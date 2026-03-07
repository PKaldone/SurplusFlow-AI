// ============================================================
// Enrichment Processor — Email Discovery & Matching
// Uses a pluggable provider interface. Configure via env vars.
// Supported: PIPL, BEENVERIFIED, or stub (logs only).
// ============================================================

import { Job } from 'bullmq';
import { query } from '../lib/db.js';

// --- Provider Interface ---

interface LookupResult {
  email: string | null;
  phone: string | null;
  confidence: number;
  source: string;
}

interface LookupInput {
  firstName: string;
  lastName: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

type LookupProvider = (input: LookupInput) => Promise<LookupResult>;

// --- Provider: Pipl ---

const PIPL_API_KEY = process.env.PIPL_API_KEY || '';

async function lookupViaPipl(input: LookupInput): Promise<LookupResult> {
  if (!PIPL_API_KEY) return { email: null, phone: null, confidence: 0, source: 'pipl' };

  try {
    const params = new URLSearchParams({
      first_name: input.firstName,
      last_name: input.lastName,
      key: PIPL_API_KEY,
    });
    if (input.state) params.set('state', input.state);
    if (input.city) params.set('city', input.city);

    const resp = await fetch(`https://api.pipl.com/search/?${params}`);
    if (!resp.ok) return { email: null, phone: null, confidence: 0, source: 'pipl' };

    const data = await resp.json() as {
      person?: {
        emails?: Array<{ address: string; '@type'?: string }>;
        phones?: Array<{ display: string }>;
      };
      '@search_pointer'?: string;
    };

    const email = data.person?.emails?.[0]?.address ?? null;
    const phone = data.person?.phones?.[0]?.display ?? null;

    return {
      email,
      phone,
      confidence: email ? 75 : 0,
      source: 'pipl',
    };
  } catch {
    return { email: null, phone: null, confidence: 0, source: 'pipl' };
  }
}

// --- Provider: BeenVerified ---

const BV_API_KEY = process.env.BEENVERIFIED_API_KEY || '';

async function lookupViaBeenVerified(input: LookupInput): Promise<LookupResult> {
  if (!BV_API_KEY) return { email: null, phone: null, confidence: 0, source: 'beenverified' };

  try {
    const resp = await fetch('https://api.beenverified.com/v2/person-search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BV_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        first_name: input.firstName,
        last_name: input.lastName,
        state: input.state,
        city: input.city,
      }),
    });

    if (!resp.ok) return { email: null, phone: null, confidence: 0, source: 'beenverified' };

    const data = await resp.json() as {
      results?: Array<{
        emails?: Array<{ address: string }>;
        phones?: Array<{ number: string }>;
      }>;
    };

    const person = data.results?.[0];
    const email = person?.emails?.[0]?.address ?? null;
    const phone = person?.phones?.[0]?.number ?? null;

    return {
      email,
      phone,
      confidence: email ? 60 : 0,
      source: 'beenverified',
    };
  } catch {
    return { email: null, phone: null, confidence: 0, source: 'beenverified' };
  }
}

// --- Provider Selection ---

function getActiveProviders(): LookupProvider[] {
  const providers: LookupProvider[] = [];
  if (PIPL_API_KEY) providers.push(lookupViaPipl);
  if (BV_API_KEY) providers.push(lookupViaBeenVerified);
  return providers;
}

// --- Main Enrichment Logic ---

async function enrichClaimant(data: { claimantId: string; caseId?: string }): Promise<void> {
  const { claimantId, caseId } = data;

  const result = await query(
    `SELECT id, first_name, last_name, email, phone, address_line1, city, state, zip, do_not_contact
     FROM claimants WHERE id = $1`,
    [claimantId],
  );

  if (result.rows.length === 0) {
    throw new Error(`Claimant not found: ${claimantId}`);
  }

  const claimant = result.rows[0] as {
    id: string; first_name: string; last_name: string;
    email: string | null; phone: string | null;
    address_line1: string | null; city: string | null;
    state: string | null; zip: string | null;
    do_not_contact: boolean;
  };

  if (claimant.email) {
    console.log(`[Enrichment] Claimant ${claimantId} already has email, skipping`);
    return;
  }

  if (claimant.do_not_contact) {
    console.log(`[Enrichment] Claimant ${claimantId} is DNC, skipping`);
    return;
  }

  const providers = getActiveProviders();

  if (providers.length === 0) {
    console.log(`[Enrichment] No providers configured — skipping claimant ${claimantId} (${claimant.first_name} ${claimant.last_name})`);
    return;
  }

  const input: LookupInput = {
    firstName: claimant.first_name,
    lastName: claimant.last_name,
    address: claimant.address_line1 ?? undefined,
    city: claimant.city ?? undefined,
    state: claimant.state ?? undefined,
    zip: claimant.zip ?? undefined,
  };

  let bestResult: LookupResult = { email: null, phone: null, confidence: 0, source: 'none' };

  for (const lookup of providers) {
    const res = await lookup(input);
    if (res.email && res.confidence > bestResult.confidence) {
      bestResult = res;
    }
    if (bestResult.confidence >= 80) break;
  }

  if (bestResult.email) {
    // Check suppression list
    const suppressed = await query(
      `SELECT 1 FROM suppression_list WHERE identifier = $1 AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
      [bestResult.email],
    );

    if (suppressed.rows.length > 0) {
      console.log(`[Enrichment] Found email for ${claimantId} but it's on suppression list`);
      return;
    }

    await query(
      `UPDATE claimants SET email = $2, updated_at = NOW() WHERE id = $1 AND email IS NULL`,
      [claimantId, bestResult.email],
    );

    await query(
      `INSERT INTO audit_log (action, resource_type, resource_id, case_id, details, actor_role)
       VALUES ('claimant.email_enriched', 'claimant', $1, $2, $3, 'system')`,
      [
        claimantId,
        caseId ?? null,
        JSON.stringify({
          email: bestResult.email,
          confidence: bestResult.confidence,
          source: bestResult.source,
        }),
      ],
    );

    console.log(
      `[Enrichment] Found email for claimant ${claimantId}: ${bestResult.email} ` +
      `(${bestResult.confidence}% confidence, source: ${bestResult.source})`,
    );
  } else {
    console.log(`[Enrichment] No email found for claimant ${claimantId}`);
  }
}

async function batchEnrich(): Promise<void> {
  const providers = getActiveProviders();
  if (providers.length === 0) {
    console.log('[Enrichment] Batch skipped — no providers configured. Set PIPL_API_KEY or BEENVERIFIED_API_KEY.');
    return;
  }

  const { rows } = await query(
    `SELECT DISTINCT cl.id AS claimant_id, cc.id AS case_id
     FROM claimants cl
     JOIN claim_cases cc ON cc.claimant_id = cl.id
     WHERE cl.email IS NULL
       AND cl.do_not_contact = FALSE
       AND cc.status NOT IN ('CLOSED', 'WITHDRAWN', 'BLOCKED', 'DENIED', 'RESCINDED')
     LIMIT 50`,
  );

  console.log(`[Enrichment] Batch: ${rows.length} claimants without emails (${providers.length} provider(s) active)`);

  for (const row of rows) {
    try {
      await enrichClaimant({
        claimantId: (row as { claimant_id: string; case_id: string }).claimant_id,
        caseId: (row as { claimant_id: string; case_id: string }).case_id,
      });
      // Rate limit: 1 lookup per second
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`[Enrichment] Error for claimant ${(row as { claimant_id: string }).claimant_id}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

// --- Main Processor ---

export async function processEnrichment(job: Job): Promise<void> {
  const type = job.data.type || job.name;
  const data = job.data.data || job.data;

  switch (type) {
    case 'enrich-claimant':
      await enrichClaimant(data);
      break;

    case 'batch-enrich':
      await batchEnrich();
      break;

    default:
      throw new Error(`Unknown enrichment job type: ${type}`);
  }
}
