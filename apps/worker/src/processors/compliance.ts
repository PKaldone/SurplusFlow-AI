// ============================================================
// Compliance Processor
// Runs jurisdiction rule checks, disclosure validation,
// and solicitation window enforcement for claim cases.
// ============================================================
import { Job, Queue } from 'bullmq';
import { query } from '../lib/db.js';
import { evaluateJurisdiction } from '@surplusflow/rules';
import { QUEUES, AUDIT_ACTIONS } from '@surplusflow/shared';
import type { JurisdictionRule, SourceType, RuleEvalInput } from '@surplusflow/shared';

const REDIS_URL = process.env.REDIS_URL || 'redis://:sfredis_local_dev@localhost:6379';
const parsed = new URL(REDIS_URL);
const connection = {
  host: parsed.hostname,
  port: parseInt(parsed.port || '6379', 10),
  password: parsed.password || undefined,
};

const outreachQueue = new Queue(QUEUES.OUTREACH, { connection });

// --- Helpers ---

interface CaseRow {
  id: string;
  case_number: string;
  jurisdiction_key: string;
  source_type: SourceType;
  state: string;
  county: string | null;
  claimed_amount: string | null;
  agreed_fee_pct: string | null;
  status: string;
  opportunity_id: string;
  metadata: Record<string, unknown> | null;
}

function rowToRule(row: Record<string, unknown>): JurisdictionRule {
  return {
    id: row.id as string,
    jurisdictionKey: row.jurisdiction_key as string,
    state: row.state as string,
    county: (row.county as string) ?? undefined,
    sourceType: row.source_type as SourceType,
    effectiveDate: String(row.effective_date),
    expirationDate: row.expiration_date ? String(row.expiration_date) : undefined,
    maxFeePercent: row.max_fee_percent != null ? Number(row.max_fee_percent) : undefined,
    feeCapAmount: row.fee_cap_amount != null ? Number(row.fee_cap_amount) : undefined,
    coolingOffDays: Number(row.cooling_off_days ?? 0),
    notarizationRequired: Boolean(row.notarization_required),
    assignmentAllowed: Boolean(row.assignment_allowed),
    licenseRequired: Boolean(row.license_required),
    bondRequired: Boolean(row.bond_required),
    bondAmount: row.bond_amount != null ? Number(row.bond_amount) : undefined,
    solicitationRestricted: Boolean(row.solicitation_restricted),
    solicitationWindowDays: row.solicitation_window_days != null ? Number(row.solicitation_window_days) : undefined,
    requiredDisclosures: (row.required_disclosures as string[]) ?? [],
    prohibitedPractices: (row.prohibited_practices as string[]) ?? [],
    contractTemplateVersion: (row.contract_template_version as string) ?? undefined,
    filingRequirements: (row.filing_requirements as Record<string, unknown>) ?? {},
    judicialFilingRequired: Boolean(row.judicial_filing_required),
    statuteReference: (row.statute_reference as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    verificationStatus: row.verification_status as JurisdictionRule['verificationStatus'],
    verifiedBy: (row.verified_by as string) ?? undefined,
    verifiedAt: row.verified_at ? String(row.verified_at) : undefined,
    verificationEvidence: (row.verification_evidence as string) ?? undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function insertAuditLog(
  action: string,
  resourceType: string,
  resourceId: string | null,
  caseId: string | null,
  details: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO audit_log (action, resource_type, resource_id, case_id, details, actor_role)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [action, resourceType, resourceId, caseId, JSON.stringify(details), 'system'],
  );
}

async function insertStatusHistory(
  caseId: string,
  fromStatus: string | null,
  toStatus: string,
  reason: string,
): Promise<void> {
  await query(
    `INSERT INTO case_status_history (case_id, from_status, to_status, reason)
     VALUES ($1, $2, $3, $4)`,
    [caseId, fromStatus, toStatus, reason],
  );
}

// --- Job Handlers ---

async function handleRuleCheck(data: { caseId: string }): Promise<void> {
  const { caseId } = data;

  // 1. Fetch the case
  const caseResult = await query(
    `SELECT id, case_number, jurisdiction_key, source_type, state, county,
            claimed_amount, agreed_fee_pct, status, opportunity_id, metadata
     FROM claim_cases WHERE id = $1`,
    [caseId],
  );

  if (caseResult.rows.length === 0) {
    throw new Error(`Case not found: ${caseId}`);
  }

  const caseRow = caseResult.rows[0] as CaseRow;

  // 2. Fetch matching jurisdiction rules
  const rulesResult = await query(
    `SELECT * FROM jurisdiction_rules
     WHERE (jurisdiction_key = $1 OR state = $2)
       AND source_type = $3
       AND effective_date <= CURRENT_DATE
       AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
     ORDER BY jurisdiction_key = $1 DESC, effective_date DESC`,
    [caseRow.jurisdiction_key, caseRow.state, caseRow.source_type],
  );

  const allRules = rulesResult.rows.map(rowToRule);

  // 3. Build evaluation input and run engine
  const evalInput: RuleEvalInput = {
    jurisdictionKey: caseRow.jurisdiction_key,
    sourceType: caseRow.source_type,
    state: caseRow.state,
    county: caseRow.county ?? undefined,
    configuredFeePercent: caseRow.agreed_fee_pct ? Number(caseRow.agreed_fee_pct) : 33,
    solicitationDate: new Date().toISOString(),
  };

  const evaluation = evaluateJurisdiction(evalInput, allRules);

  console.log(
    `[Compliance] Rule check for case ${caseRow.case_number}: ${evaluation.result} ` +
    `(${evaluation.constraints.length} constraints, ${evaluation.blockedReasons.length} blocked reasons)`,
  );

  // 4. Handle BLOCKED result
  if (evaluation.result === 'BLOCKED') {
    await query(
      `UPDATE claim_cases
       SET status = 'BLOCKED', previous_status = $2,
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        caseId,
        caseRow.status,
        JSON.stringify({
          ruleEvaluation: {
            result: evaluation.result,
            blockedReasons: evaluation.blockedReasons,
            evaluatedAt: new Date().toISOString(),
          },
        }),
      ],
    );

    await insertStatusHistory(caseId, caseRow.status, 'BLOCKED', evaluation.blockedReasons.join('; '));

    await insertAuditLog(
      AUDIT_ACTIONS.COMPLIANCE_RULE_BLOCKED,
      'claim_case',
      caseId,
      caseId,
      {
        result: evaluation.result,
        blockedReasons: evaluation.blockedReasons,
        jurisdictionKey: caseRow.jurisdiction_key,
        sourceType: caseRow.source_type,
      },
    );

    return;
  }

  // 5. Handle ALLOWED / ALLOWED_WITH_CONSTRAINTS
  const evaluationMeta = {
    ruleEvaluation: {
      result: evaluation.result,
      constraints: evaluation.constraints,
      warnings: evaluation.warnings,
      verificationStatus: evaluation.verificationStatus,
      ruleId: evaluation.rule?.id,
      evaluatedAt: new Date().toISOString(),
    },
  };

  await query(
    `UPDATE claim_cases
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [caseId, JSON.stringify(evaluationMeta)],
  );

  // If case is PROSPECT, transition to OUTREACH (ready for first contact)
  if (caseRow.status === 'PROSPECT') {
    await query(
      `UPDATE claim_cases
       SET status = 'OUTREACH', previous_status = $2, updated_at = NOW()
       WHERE id = $1`,
      [caseId, caseRow.status],
    );

    await insertStatusHistory(
      caseId,
      caseRow.status,
      'OUTREACH',
      `Rule check passed (${evaluation.result}). Ready for outreach.`,
    );

    // Queue first outreach touch
    await outreachQueue.add('generate-letter', {
      type: 'generate-letter',
      data: { caseId, touchNumber: 1 },
    });

    console.log(`[Compliance] Case ${caseRow.case_number} moved to OUTREACH, first touch queued.`);
  }

  await insertAuditLog(
    AUDIT_ACTIONS.RULE_EVALUATED,
    'claim_case',
    caseId,
    caseId,
    {
      result: evaluation.result,
      constraintCount: evaluation.constraints.length,
      warningCount: evaluation.warnings.length,
      jurisdictionKey: caseRow.jurisdiction_key,
      sourceType: caseRow.source_type,
    },
  );
}

async function handleDisclosureCheck(data: { caseId: string }): Promise<void> {
  const { caseId } = data;

  // Fetch case jurisdiction info
  const caseResult = await query(
    `SELECT cc.id, cc.case_number, cc.jurisdiction_key, cc.source_type, cc.state
     FROM claim_cases cc WHERE cc.id = $1`,
    [caseId],
  );

  if (caseResult.rows.length === 0) {
    throw new Error(`Case not found: ${caseId}`);
  }

  const caseRow = caseResult.rows[0] as Pick<CaseRow, 'id' | 'case_number' | 'jurisdiction_key' | 'source_type' | 'state'>;

  // Fetch required disclosures from jurisdiction rules
  const rulesResult = await query(
    `SELECT required_disclosures FROM jurisdiction_rules
     WHERE jurisdiction_key = $1 AND source_type = $2
       AND effective_date <= CURRENT_DATE
       AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
     ORDER BY effective_date DESC LIMIT 1`,
    [caseRow.jurisdiction_key, caseRow.source_type],
  );

  const requiredDisclosures: string[] = rulesResult.rows.length > 0
    ? (rulesResult.rows[0].required_disclosures as string[] ?? [])
    : [];

  if (requiredDisclosures.length === 0) {
    console.log(`[Compliance] No disclosures required for case ${caseRow.case_number}`);
    return;
  }

  // Check executed contracts for disclosure document
  const contractResult = await query(
    `SELECT ec.merge_data FROM executed_contracts ec
     WHERE ec.case_id = $1
     ORDER BY ec.created_at DESC LIMIT 1`,
    [caseId],
  );

  const mergeData = contractResult.rows.length > 0
    ? (contractResult.rows[0].merge_data as Record<string, unknown>)
    : null;

  const presentDisclosures: string[] = mergeData?.disclosures
    ? ((mergeData.disclosures as Record<string, unknown>).stateSpecificDisclosures as string[] ?? [])
    : [];

  const missingDisclosures = requiredDisclosures.filter(d => !presentDisclosures.includes(d));

  if (missingDisclosures.length > 0) {
    console.log(
      `[Compliance] Case ${caseRow.case_number}: missing disclosures: ${missingDisclosures.join(', ')}`,
    );

    await query(
      `UPDATE claim_cases
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        caseId,
        JSON.stringify({
          disclosureCheck: {
            required: requiredDisclosures,
            present: presentDisclosures,
            missing: missingDisclosures,
            checkedAt: new Date().toISOString(),
            passed: false,
          },
        }),
      ],
    );
  } else {
    await query(
      `UPDATE claim_cases
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        caseId,
        JSON.stringify({
          disclosureCheck: {
            required: requiredDisclosures,
            present: presentDisclosures,
            missing: [],
            checkedAt: new Date().toISOString(),
            passed: true,
          },
        }),
      ],
    );
  }

  await insertAuditLog(
    AUDIT_ACTIONS.RULE_EVALUATED,
    'claim_case',
    caseId,
    caseId,
    {
      checkType: 'disclosure',
      required: requiredDisclosures,
      missing: missingDisclosures,
      passed: missingDisclosures.length === 0,
    },
  );
}

async function handleSolicitationWindowCheck(data: { caseId: string }): Promise<void> {
  const { caseId } = data;

  // Fetch case + linked opportunity for surplus_date
  const caseResult = await query(
    `SELECT cc.id, cc.case_number, cc.jurisdiction_key, cc.source_type, cc.state, cc.status,
            o.surplus_date, o.sale_date
     FROM claim_cases cc
     JOIN opportunities o ON o.id = cc.opportunity_id
     WHERE cc.id = $1`,
    [caseId],
  );

  if (caseResult.rows.length === 0) {
    throw new Error(`Case not found: ${caseId}`);
  }

  const row = caseResult.rows[0] as {
    id: string;
    case_number: string;
    jurisdiction_key: string;
    source_type: string;
    state: string;
    status: string;
    surplus_date: string | null;
    sale_date: string | null;
  };

  // Fetch solicitation rule
  const ruleResult = await query(
    `SELECT solicitation_restricted, solicitation_window_days
     FROM jurisdiction_rules
     WHERE jurisdiction_key = $1 AND source_type = $2
       AND effective_date <= CURRENT_DATE
       AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
     ORDER BY effective_date DESC LIMIT 1`,
    [row.jurisdiction_key, row.source_type],
  );

  if (ruleResult.rows.length === 0) {
    console.log(`[Compliance] No solicitation rule for ${row.jurisdiction_key} / ${row.source_type}`);
    return;
  }

  const rule = ruleResult.rows[0] as {
    solicitation_restricted: boolean;
    solicitation_window_days: number | null;
  };

  if (!rule.solicitation_restricted || !rule.solicitation_window_days) {
    console.log(`[Compliance] No solicitation restriction for case ${row.case_number}`);
    return;
  }

  const eventDate = row.surplus_date ?? row.sale_date;
  if (!eventDate) {
    console.log(`[Compliance] No event date for case ${row.case_number}, cannot check window`);
    return;
  }

  const eventDateObj = new Date(eventDate);
  const windowEnd = new Date(eventDateObj);
  windowEnd.setDate(windowEnd.getDate() + rule.solicitation_window_days);
  const now = new Date();
  const isBlocked = now < windowEnd;

  const windowMeta = {
    solicitationWindowCheck: {
      eventDate,
      windowDays: rule.solicitation_window_days,
      windowEndDate: windowEnd.toISOString().split('T')[0],
      isBlocked,
      checkedAt: new Date().toISOString(),
    },
  };

  await query(
    `UPDATE claim_cases
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [caseId, JSON.stringify(windowMeta)],
  );

  if (isBlocked) {
    console.log(
      `[Compliance] Case ${row.case_number}: solicitation blocked until ${windowEnd.toISOString().split('T')[0]}`,
    );
  } else {
    console.log(`[Compliance] Case ${row.case_number}: solicitation window clear`);
  }

  await insertAuditLog(
    AUDIT_ACTIONS.RULE_EVALUATED,
    'claim_case',
    caseId,
    caseId,
    {
      checkType: 'solicitation_window',
      ...windowMeta.solicitationWindowCheck,
    },
  );
}

// --- Main Processor ---

export async function processCompliance(job: Job): Promise<void> {
  const type = job.data.type || job.name;
  const data = job.data.data || job.data;

  switch (type) {
    case 'rule-check':
      await handleRuleCheck(data);
      break;

    case 'batch-rule-check': {
      // Query all cases in PROSPECT status and enqueue individual rule-checks
      const { rows: prospects } = await query(
        `SELECT id, jurisdiction_key, source_type FROM claim_cases WHERE status = 'PROSPECT'`,
      );
      console.log(`[Compliance] Batch rule check: found ${prospects.length} prospects`);

      const complianceQueue = new Queue(QUEUES.COMPLIANCE, { connection });

      for (const prospect of prospects) {
        await complianceQueue.add('rule-check', {
          type: 'rule-check',
          data: {
            caseId: prospect.id,
            jurisdictionKey: prospect.jurisdiction_key,
            sourceType: prospect.source_type,
          },
        });
      }

      await complianceQueue.close();
      console.log(`[Compliance] Enqueued ${prospects.length} rule-check jobs`);
      break;
    }

    case 'disclosure-check':
      await handleDisclosureCheck(data);
      break;

    case 'solicitation-window-check':
      await handleSolicitationWindowCheck(data);
      break;

    default:
      throw new Error(`Unknown compliance job type: ${type}`);
  }
}
