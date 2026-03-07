// ============================================================
// Enrichment Processor — Email Discovery & Matching
// Searches for email addresses for claimants using public
// people-search APIs, then updates the claimant record.
// ============================================================

import { Job } from 'bullmq';
import { query } from '../lib/db.js';

// Supported providers for email lookup
const HUNTER_API_KEY = process.env.HUNTER_API_KEY || '';
const PROSPECTIO_API_KEY = process.env.PROSPECTIO_API_KEY || '';

// --- Email Lookup Strategies ---

interface LookupResult {
  email: string | null;
  confidence: number;
  source: string;
}

async function lookupViaHunter(firstName: string, lastName: string, state?: string): Promise<LookupResult> {
  if (!HUNTER_API_KEY) return { email: null, confidence: 0, source: 'hunter' };

  try {
    const params = new URLSearchParams({
      first_name: firstName,
      last_name: lastName,
      api_key: HUNTER_API_KEY,
    });

    const resp = await fetch(`https://api.hunter.io/v2/email-finder?${params}`);
    if (!resp.ok) return { email: null, confidence: 0, source: 'hunter' };

    const data = await resp.json() as { data?: { email?: string; score?: number } };
    if (data.data?.email) {
      return {
        email: data.data.email,
        confidence: data.data.score ?? 50,
        source: 'hunter',
      };
    }
  } catch {
    // Hunter lookup failed — continue to next provider
  }

  return { email: null, confidence: 0, source: 'hunter' };
}

async function lookupViaGoogle(firstName: string, lastName: string, state: string, city?: string): Promise<LookupResult> {
  // Free fallback: search public records via Google Custom Search API
  // This is a best-effort lookup for publicly available contact info
  // Requires GOOGLE_CSE_KEY and GOOGLE_CSE_ID env vars
  const cseKey = process.env.GOOGLE_CSE_KEY || '';
  const cseId = process.env.GOOGLE_CSE_ID || '';

  if (!cseKey || !cseId) return { email: null, confidence: 0, source: 'google_cse' };

  try {
    const searchQuery = `"${firstName} ${lastName}" ${city ?? ''} ${state} email`;
    const params = new URLSearchParams({ key: cseKey, cx: cseId, q: searchQuery, num: '5' });

    const resp = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
    if (!resp.ok) return { email: null, confidence: 0, source: 'google_cse' };

    const data = await resp.json() as { items?: Array<{ snippet?: string }> };

    // Extract email patterns from snippets
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    for (const item of data.items ?? []) {
      const matches = item.snippet?.match(emailPattern);
      if (matches && matches.length > 0) {
        // Filter out common junk emails
        const validEmail = matches.find(e =>
          !e.includes('example.com') &&
          !e.includes('noreply') &&
          !e.includes('support@')
        );
        if (validEmail) {
          return { email: validEmail, confidence: 30, source: 'google_cse' };
        }
      }
    }
  } catch {
    // Google CSE failed
  }

  return { email: null, confidence: 0, source: 'google_cse' };
}

// --- Main Enrichment Logic ---

async function enrichClaimant(data: { claimantId: string; caseId?: string }): Promise<void> {
  const { claimantId, caseId } = data;

  // 1. Fetch claimant
  const result = await query(
    `SELECT id, first_name, last_name, email, phone, city, state, do_not_contact
     FROM claimants WHERE id = $1`,
    [claimantId],
  );

  if (result.rows.length === 0) {
    throw new Error(`Claimant not found: ${claimantId}`);
  }

  const claimant = result.rows[0] as {
    id: string; first_name: string; last_name: string;
    email: string | null; phone: string | null;
    city: string | null; state: string | null;
    do_not_contact: boolean;
  };

  // Skip if already has email or is DNC
  if (claimant.email) {
    console.log(`[Enrichment] Claimant ${claimantId} already has email, skipping`);
    return;
  }

  if (claimant.do_not_contact) {
    console.log(`[Enrichment] Claimant ${claimantId} is DNC, skipping`);
    return;
  }

  // 2. Try each lookup provider in order
  const providers: Array<() => Promise<LookupResult>> = [
    () => lookupViaHunter(claimant.first_name, claimant.last_name, claimant.state ?? undefined),
    () => lookupViaGoogle(claimant.first_name, claimant.last_name, claimant.state ?? '', claimant.city ?? undefined),
  ];

  let bestResult: LookupResult = { email: null, confidence: 0, source: 'none' };

  for (const lookup of providers) {
    const result = await lookup();
    if (result.email && result.confidence > bestResult.confidence) {
      bestResult = result;
    }
    // If we got a high-confidence match, stop early
    if (bestResult.confidence >= 80) break;
  }

  // 3. Update claimant if we found an email
  if (bestResult.email) {
    // Check suppression list first
    const suppressed = await query(
      `SELECT 1 FROM suppression_list WHERE identifier = $1 AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
      [bestResult.email],
    );

    if (suppressed.rows.length > 0) {
      console.log(`[Enrichment] Found email for ${claimantId} but it's on suppression list`);
      return;
    }

    await query(
      `UPDATE claimants
       SET email = $2, updated_at = NOW()
       WHERE id = $1 AND email IS NULL`,
      [claimantId, bestResult.email],
    );

    // Log to audit
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
  // Find all claimants without emails that have active cases
  const { rows } = await query(
    `SELECT DISTINCT cl.id AS claimant_id, cc.id AS case_id
     FROM claimants cl
     JOIN claim_cases cc ON cc.claimant_id = cl.id
     WHERE cl.email IS NULL
       AND cl.do_not_contact = FALSE
       AND cc.status NOT IN ('CLOSED', 'WITHDRAWN', 'BLOCKED', 'DENIED', 'RESCINDED')
     LIMIT 50`,
  );

  console.log(`[Enrichment] Batch: ${rows.length} claimants without emails`);

  for (const row of rows) {
    try {
      await enrichClaimant({
        claimantId: (row as { claimant_id: string; case_id: string }).claimant_id,
        caseId: (row as { claimant_id: string; case_id: string }).case_id,
      });
      // Rate limit: 1 lookup per second to avoid API throttling
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
