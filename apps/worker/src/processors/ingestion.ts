// ============================================================
// Ingestion Processor — Autonomous Scraping Pipeline
// ============================================================

import { Job, Queue } from 'bullmq';
import crypto from 'node:crypto';
import { QUEUES, CASE_NUMBER_PREFIX } from '@surplusflow/shared';
import { query, pool } from '../lib/db.js';
import { getScrapersForState } from '../scrapers/index.js';

// ---------------------------------------------------------------------------
// Redis connection (mirrors worker/src/index.ts)
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.REDIS_URL || 'redis://:sfredis_local_dev@localhost:6379';
const parsed = new URL(REDIS_URL);
const connection = {
  host: parsed.hostname,
  port: parseInt(parsed.port || '6379', 10),
  password: parsed.password || undefined,
  maxRetriesPerRequest: null as null,
};

const ingestionQueue = new Queue(QUEUES.INGESTION, { connection });
const complianceQueue = new Queue(QUEUES.COMPLIANCE, { connection });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildJurisdictionKey(state: string, county: string | null, sourceType: string): string {
  const sanitized = (county ?? 'statewide').toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${state.toLowerCase()}_${sanitized}_${sourceType}`;
}

// ---------------------------------------------------------------------------
// Job type: scrape-state-surplus
// ---------------------------------------------------------------------------

interface ScrapeResult {
  state: string;
  found: number;
  inserted: number;
  duplicates: number;
  jobsQueued: number;
}

async function scrapeStateSurplus(job: Job): Promise<ScrapeResult> {
  const { state, triggeredBy } = job.data as { state: string; triggeredBy?: string };

  const scrapers = getScrapersForState(state);
  const batchId = `batch-${state}-${Date.now()}`;

  let totalFound = 0;
  let inserted = 0;
  let jobsQueued = 0;
  const allErrors: string[] = [];

  for (const scraper of scrapers) {
    try {
      const result = await scraper.scrape();
      totalFound += result.found;
      allErrors.push(...result.errors);

      console.log(
        `[Ingestion] ${scraper.name}: ${result.found} found in ${result.durationMs}ms` +
        (result.errors.length ? ` (${result.errors.length} errors)` : ''),
      );

      for (const opp of result.opportunities) {
        const id = crypto.randomUUID();
        const jurisdictionKey = buildJurisdictionKey(opp.state, opp.county, opp.source_type);

        const dbResult = await query<{ id: string }>(
          `INSERT INTO opportunities (
            id, source_type, source_id, source_url, state, county, jurisdiction_key,
            reported_amount, owner_name, owner_address, holder_name, property_description,
            parcel_number, sale_date, surplus_date, deadline_date,
            ingestion_batch, raw_data, status, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12,
            $13, $14, $15, $16,
            $17, $18, 'new', NOW(), NOW()
          )
          ON CONFLICT (source_type, source_id) DO NOTHING
          RETURNING id`,
          [
            id, opp.source_type, opp.source_id, opp.source_url, opp.state, opp.county, jurisdictionKey,
            opp.reported_amount, opp.owner_name, opp.owner_address, opp.holder_name, opp.property_description,
            opp.parcel_number, opp.sale_date, opp.surplus_date, opp.deadline_date,
            batchId,
            JSON.stringify({
              ...opp.raw_data,
              triggered_by: triggeredBy ?? 'system',
              scraper: scraper.name,
            }),
          ],
        );

        if (dbResult.rowCount && dbResult.rowCount > 0) {
          inserted++;
          await ingestionQueue.add('auto-enroll', { opportunityId: dbResult.rows[0].id });
          jobsQueued++;
        }
      }
    } catch (err) {
      allErrors.push(`${scraper.name}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await scraper.dispose();
    }
  }

  const duplicates = totalFound - inserted;

  console.log(
    `[Ingestion] ${state} scrape complete: ${totalFound} found, ` +
    `${inserted} new, ${duplicates} duplicates, ${jobsQueued} jobs queued (batch: ${batchId})` +
    (allErrors.length ? ` — ${allErrors.length} errors` : ''),
  );

  if (allErrors.length > 0) {
    console.warn(`[Ingestion] ${state} errors:`, allErrors.slice(0, 5));
  }

  return { state, found: totalFound, inserted, duplicates, jobsQueued };
}

// ---------------------------------------------------------------------------
// Job type: auto-enroll — create case from opportunity
// ---------------------------------------------------------------------------

interface AutoEnrollResult {
  opportunityId: string;
  caseId: string | null;
  caseNumber: string | null;
  skipped: boolean;
  reason?: string;
}

async function autoEnroll(job: Job): Promise<AutoEnrollResult> {
  const { opportunityId } = (job.data.data ?? job.data) as { opportunityId: string };

  // 1. Fetch the opportunity
  const oppResult = await query<{
    id: string;
    source_type: string;
    state: string;
    county: string | null;
    jurisdiction_key: string;
    reported_amount: number | null;
    owner_name: string | null;
  }>(
    `SELECT id, source_type, state, county, jurisdiction_key, reported_amount, owner_name
     FROM opportunities WHERE id = $1`,
    [opportunityId],
  );

  if (oppResult.rows.length === 0) {
    throw new Error(`Opportunity not found: ${opportunityId}`);
  }

  const opp = oppResult.rows[0];

  // 2. Check if a case already exists for this opportunity
  const existingCase = await query<{ id: string }>(
    `SELECT id FROM claim_cases WHERE opportunity_id = $1 LIMIT 1`,
    [opportunityId],
  );

  if (existingCase.rows.length > 0) {
    console.log(`[Ingestion] Auto-enroll skipped: case already exists for opportunity ${opportunityId}`);
    return {
      opportunityId,
      caseId: existingCase.rows[0].id,
      caseNumber: null,
      skipped: true,
      reason: 'case_already_exists',
    };
  }

  // 3. Look up or create claimant from owner_name (fuzzy match via pg_trgm)
  const ownerName = opp.owner_name ?? 'Unknown Owner';
  const nameParts = ownerName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? 'Unknown';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Unknown';

  const existingClaimant = await query<{ id: string; sim: number }>(
    `SELECT id, similarity(first_name || ' ' || last_name, $1) AS sim
     FROM claimants
     WHERE similarity(first_name || ' ' || last_name, $1) > 0.4
       AND do_not_contact = FALSE
     ORDER BY sim DESC
     LIMIT 1`,
    [ownerName],
  );

  let claimantId: string;

  if (existingClaimant.rows.length > 0) {
    claimantId = existingClaimant.rows[0].id;
  } else {
    const newClaimantId = crypto.randomUUID();
    await query(
      `INSERT INTO claimants (id, first_name, last_name, identity_verified, do_not_contact, created_at, updated_at)
       VALUES ($1, $2, $3, false, false, NOW(), NOW())`,
      [newClaimantId, firstName, lastName],
    );
    claimantId = newClaimantId;
  }

  // 4. Generate case_number + insert in a single transaction with advisory lock
  //    to prevent race conditions on concurrent auto-enroll jobs
  const year = new Date().getFullYear();
  const prefix = `${CASE_NUMBER_PREFIX}-${year}-`;
  const caseId = crypto.randomUUID();

  const client = await pool.connect();
  let caseNumber: string;
  try {
    await client.query('BEGIN');
    // Advisory lock keyed on a fixed hash to serialize case number generation
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('case_number_gen'))`);

    const countResult = await client.query<{ max_seq: string }>(
      `SELECT MAX(CAST(SUBSTRING(case_number FROM '[0-9]+$') AS INTEGER)) AS max_seq FROM claim_cases WHERE case_number LIKE $1`,
      [`${prefix}%`],
    );
    const nextSeq = (parseInt(countResult.rows[0].max_seq, 10) || 0) + 1;
    caseNumber = `${prefix}${String(nextSeq).padStart(4, '0')}`;

    // 5. Insert into claim_cases
    await client.query(
      `INSERT INTO claim_cases (
        id, case_number, opportunity_id, claimant_id, status,
        source_type, jurisdiction_key, state, county,
        claimed_amount, attorney_required, notarization_required,
        assignment_enabled, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, 'PROSPECT',
        $5, $6, $7, $8,
        $9, false, false,
        false, $10, NOW(), NOW()
      )`,
      [
        caseId, caseNumber, opportunityId, claimantId,
        opp.source_type, opp.jurisdiction_key, opp.state, opp.county,
        opp.reported_amount,
        JSON.stringify({ auto_enrolled: true, enrolled_at: new Date().toISOString() }),
      ],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 6. Insert into case_status_history (changed_by is NULL for system actions — column is UUID FK)
  await query(
    `INSERT INTO case_status_history (case_id, from_status, to_status, changed_by, reason, created_at)
     VALUES ($1, NULL, 'PROSPECT', NULL, 'Auto-enrolled from ingestion pipeline', NOW())`,
    [caseId],
  );

  // 7. Update opportunity status to 'matched'
  await query(
    `UPDATE opportunities SET status = 'matched', updated_at = NOW() WHERE id = $1`,
    [opportunityId],
  );

  // 8. Queue compliance rule-check for the new case
  await complianceQueue.add('compliance:rule-check', {
    type: 'rule-check',
    data: {
      caseId,
      jurisdictionKey: opp.jurisdiction_key,
      sourceType: opp.source_type,
      state: opp.state,
      county: opp.county,
    },
  });

  console.log(
    `[Ingestion] Auto-enrolled: opportunity ${opportunityId} -> case ${caseNumber} (${caseId})`,
  );

  return { opportunityId, caseId, caseNumber, skipped: false };
}

// ---------------------------------------------------------------------------
// Job type: import-csv (stub)
// ---------------------------------------------------------------------------

async function importCsv(job: Job): Promise<{ message: string }> {
  const { filename } = (job.data.data ?? job.data) as { filename?: string };
  console.log(`[Ingestion] CSV import requested: ${filename ?? 'unknown'}. Stub — returning success.`);
  return { message: `CSV import stub completed for ${filename ?? 'unknown'}` };
}

// ---------------------------------------------------------------------------
// Main processor entry point
// ---------------------------------------------------------------------------

export async function processIngestion(job: Job): Promise<unknown> {
  const jobName = job.name;
  const jobType = job.data.type ?? jobName;

  switch (jobType) {
    case 'scrape-state-surplus':
      return scrapeStateSurplus(job);

    case 'auto-enroll':
      return autoEnroll(job);

    case 'import-csv':
      return importCsv(job);

    default:
      throw new Error(`Unknown ingestion job type: ${jobType}`);
  }
}
