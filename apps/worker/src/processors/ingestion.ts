// ============================================================
// Ingestion Processor — Autonomous Scraping Pipeline
// ============================================================

import { Job, Queue } from 'bullmq';
import crypto from 'node:crypto';
import { QUEUES, CASE_NUMBER_PREFIX } from '@surplusflow/shared';
import { query } from '../lib/db.js';

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
// State configuration — realistic counties & source types per state
// ---------------------------------------------------------------------------

interface StateConfig {
  readonly state: string;
  readonly counties: readonly string[];
  readonly sourceTypes: readonly SourceTypeOption[];
  readonly holders: readonly string[];
  readonly amountRange: readonly [number, number];
}

type SourceTypeOption = 'unclaimed_property' | 'tax_sale_surplus' | 'foreclosure_surplus';

const STATE_CONFIGS: Record<string, StateConfig> = {
  FL: {
    state: 'FL',
    counties: ['Miami-Dade', 'Broward', 'Palm Beach', 'Orange', 'Hillsborough'],
    sourceTypes: ['unclaimed_property', 'foreclosure_surplus'],
    holders: [
      'Florida Department of Financial Services',
      'Clerk of the Circuit Court',
      'County Tax Collector',
    ],
    amountRange: [800, 150_000],
  },
  TX: {
    state: 'TX',
    counties: ['Harris', 'Dallas', 'Tarrant', 'Bexar', 'Travis'],
    sourceTypes: ['tax_sale_surplus', 'unclaimed_property'],
    holders: [
      'Texas Comptroller of Public Accounts',
      'County Tax Assessor-Collector',
      'District Clerk',
    ],
    amountRange: [500, 120_000],
  },
  CA: {
    state: 'CA',
    counties: ['Los Angeles', 'San Francisco', 'San Diego', 'Orange', 'Sacramento'],
    sourceTypes: ['foreclosure_surplus', 'unclaimed_property'],
    holders: [
      'California State Controller',
      'County Treasurer-Tax Collector',
      'Superior Court of California',
    ],
    amountRange: [1_000, 150_000],
  },
  OH: {
    state: 'OH',
    counties: ['Cuyahoga', 'Franklin', 'Hamilton', 'Summit', 'Montgomery'],
    sourceTypes: ['unclaimed_property', 'tax_sale_surplus'],
    holders: [
      'Ohio Department of Commerce',
      'County Auditor',
      'County Treasurer',
    ],
    amountRange: [500, 80_000],
  },
  NY: {
    state: 'NY',
    counties: ['Kings', 'Queens', 'New York', 'Suffolk', 'Nassau'],
    sourceTypes: ['foreclosure_surplus', 'unclaimed_property'],
    holders: [
      'New York State Comptroller',
      'NYC Department of Finance',
      'County Clerk',
    ],
    amountRange: [1_500, 150_000],
  },
} as const;

// ---------------------------------------------------------------------------
// Realistic data generators
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Lisa', 'Daniel', 'Nancy',
  'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
  'Steven', 'Dorothy', 'Andrew', 'Kimberly', 'Paul', 'Emily', 'Joshua', 'Donna',
] as const;

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
] as const;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAmount(min: number, max: number): number {
  // Skew toward lower amounts (more realistic distribution)
  const raw = Math.random() ** 1.5;
  return Math.round((min + raw * (max - min)) * 100) / 100;
}

function generateSourceId(state: string, sourceType: SourceTypeOption): string {
  const year = new Date().getFullYear();
  const suffix = randomInt(100_000, 999_999);
  const prefixMap: Record<SourceTypeOption, string> = {
    unclaimed_property: 'UP',
    tax_sale_surplus: 'TS',
    foreclosure_surplus: 'FS',
  };
  return `${state}-${prefixMap[sourceType]}-${year}-${suffix}`;
}

function generatePropertyDescription(sourceType: SourceTypeOption, county: string): string {
  const descriptions: Record<SourceTypeOption, readonly string[]> = {
    unclaimed_property: [
      `Unclaimed funds from dormant account held by financial institution in ${county} County`,
      `Unclaimed insurance proceeds originally payable to property owner in ${county} County`,
      `Unclaimed utility deposit refund from ${county} County service provider`,
      `Unclaimed estate distribution from probate court in ${county} County`,
      `Unclaimed mineral rights royalty payment — ${county} County`,
    ],
    tax_sale_surplus: [
      `Tax sale surplus from delinquent property tax auction in ${county} County`,
      `Excess proceeds from county tax lien foreclosure sale — ${county} County`,
      `Surplus funds from tax deed sale, parcel in ${county} County`,
      `Overage from ${county} County annual tax sale`,
    ],
    foreclosure_surplus: [
      `Foreclosure surplus from mortgage default sale in ${county} County`,
      `Excess proceeds from judicial foreclosure — ${county} County Circuit Court`,
      `Surplus funds from trustee sale following default in ${county} County`,
      `Foreclosure overage held by ${county} County Clerk of Court`,
    ],
  };

  return randomElement(descriptions[sourceType]);
}

function buildJurisdictionKey(state: string, county: string, sourceType: SourceTypeOption): string {
  const sanitized = county.toLowerCase().replace(/[^a-z0-9]/g, '_');
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
  const cfg = STATE_CONFIGS[state];

  if (!cfg) {
    throw new Error(`No configuration for state: ${state}. Supported: ${Object.keys(STATE_CONFIGS).join(', ')}`);
  }

  const batchId = `batch-${state}-${Date.now()}`;
  const opportunityCount = randomInt(3, 8);
  const opportunities: Array<{
    id: string;
    source_type: SourceTypeOption;
    source_id: string;
    state: string;
    county: string;
    jurisdiction_key: string;
    reported_amount: number;
    owner_name: string;
    holder_name: string;
    property_description: string;
    ingestion_batch: string;
    raw_data: string;
  }> = [];

  // Generate realistic opportunities
  for (let i = 0; i < opportunityCount; i++) {
    const sourceType = randomElement(cfg.sourceTypes);
    const county = randomElement(cfg.counties);
    const firstName = randomElement(FIRST_NAMES);
    const lastName = randomElement(LAST_NAMES);

    opportunities.push({
      id: crypto.randomUUID(),
      source_type: sourceType,
      source_id: generateSourceId(state, sourceType),
      state: cfg.state,
      county,
      jurisdiction_key: buildJurisdictionKey(cfg.state, county, sourceType),
      reported_amount: randomAmount(cfg.amountRange[0], cfg.amountRange[1]),
      owner_name: `${firstName} ${lastName}`,
      holder_name: randomElement(cfg.holders),
      property_description: generatePropertyDescription(sourceType, county),
      ingestion_batch: batchId,
      raw_data: JSON.stringify({
        scraped_at: new Date().toISOString(),
        triggered_by: triggeredBy ?? 'system',
        simulated: true,
      }),
    });
  }

  // Bulk insert with deduplication (ON CONFLICT DO NOTHING)
  let inserted = 0;
  let jobsQueued = 0;

  for (const opp of opportunities) {
    const result = await query<{ id: string }>(
      `INSERT INTO opportunities (
        id, source_type, source_id, state, county, jurisdiction_key,
        reported_amount, owner_name, holder_name, property_description,
        ingestion_batch, raw_data, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, 'new', NOW(), NOW()
      )
      ON CONFLICT (source_type, source_id) DO NOTHING
      RETURNING id`,
      [
        opp.id, opp.source_type, opp.source_id, opp.state, opp.county,
        opp.jurisdiction_key, opp.reported_amount, opp.owner_name,
        opp.holder_name, opp.property_description, opp.ingestion_batch,
        opp.raw_data,
      ],
    );

    if (result.rowCount && result.rowCount > 0) {
      inserted++;
      const insertedId = result.rows[0].id;

      // Queue auto-enroll (compliance check happens after case is created)
      await ingestionQueue.add('auto-enroll', {
        opportunityId: insertedId,
      });

      jobsQueued += 1;
    }
  }

  const duplicates = opportunityCount - inserted;

  console.log(
    `[Ingestion] ${state} scrape complete: ${opportunityCount} found, ` +
    `${inserted} new, ${duplicates} duplicates, ${jobsQueued} jobs queued (batch: ${batchId})`,
  );

  return { state, found: opportunityCount, inserted, duplicates, jobsQueued };
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

  // 3. Look up or create claimant from owner_name
  const ownerName = opp.owner_name ?? 'Unknown Owner';
  const nameParts = ownerName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? 'Unknown';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Unknown';

  // Try to find existing claimant by exact name match
  const existingClaimant = await query<{ id: string }>(
    `SELECT id FROM claimants WHERE first_name = $1 AND last_name = $2 LIMIT 1`,
    [firstName, lastName],
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

  // 4. Generate case_number: SF-{year}-{sequential 4-digit}
  //    Mirrors the pattern in cases/routes.ts (COUNT-based)
  const year = new Date().getFullYear();
  const prefix = `${CASE_NUMBER_PREFIX}-${year}-`;
  const countResult = await query<{ count: string }>(
    `SELECT MAX(CAST(SUBSTRING(case_number FROM '[0-9]+$') AS INTEGER)) AS max_seq FROM claim_cases WHERE case_number LIKE $1`,
    [`${prefix}%`],
  );
  const nextSeq = (parseInt(countResult.rows[0].max_seq, 10) || 0) + 1;
  const caseNumber = `${prefix}${String(nextSeq).padStart(4, '0')}`;

  // 5. Insert into claim_cases
  const caseId = crypto.randomUUID();
  await query(
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

  // 6. Insert into case_status_history
  await query(
    `INSERT INTO case_status_history (case_id, from_status, to_status, changed_by, reason, created_at)
     VALUES ($1, NULL, 'PROSPECT', 'system', 'Auto-enrolled from ingestion pipeline', NOW())`,
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
