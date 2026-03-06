// ============================================================
// Followups Processor
// Periodic checks: follow-up scheduling, escalation detection,
// and payout tracking for stale cases.
// ============================================================
import { Job, Queue } from 'bullmq';
import { query } from '../lib/db.js';
import { evaluateStopRules, DEFAULT_OUTREACH_POLICY } from '@surplusflow/contracts/src/outreach.js';
import type { OutreachContext } from '@surplusflow/contracts/src/outreach.js';
import { QUEUES, AUDIT_ACTIONS } from '@surplusflow/shared';

const REDIS_URL = process.env.REDIS_URL || 'redis://:sfredis_local_dev@localhost:6379';
const parsed = new URL(REDIS_URL);
const connection = {
  host: parsed.hostname,
  port: parseInt(parsed.port || '6379', 10),
  password: parsed.password || undefined,
};

const outreachQueue = new Queue(QUEUES.OUTREACH, { connection });

// Escalation thresholds: status → max days before flagging
const ESCALATION_THRESHOLDS: Record<string, number> = {
  PROSPECT: 7,
  ENROLLED: 30,
  PACKET_ASSEMBLY: 14,
  SUBMITTED: 60,
  AWAITING_PAYOUT: 45,
};

// --- Helpers ---

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

async function checkSuppressionList(email: string | null, phone: string | null): Promise<boolean> {
  const identifiers: string[] = [];
  if (email) identifiers.push(email);
  if (phone) identifiers.push(phone);

  if (identifiers.length === 0) return false;

  const result = await query(
    `SELECT 1 FROM suppression_list
     WHERE identifier = ANY($1)
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [identifiers],
  );

  return result.rows.length > 0;
}

// --- Job Handlers ---

async function handleFollowupCheck(): Promise<void> {
  console.log('[Followups] Running followup check...');

  // 1. Find outreach records that are pending and old enough for follow-up
  //    Touch 1: after 14 days, Touch 2: after 21 days
  const pendingResult = await query(
    `SELECT
       orec.id, orec.case_id, orec.claimant_id, orec.touch_number,
       orec.created_at AS record_created_at,
       cc.status AS case_status, cc.jurisdiction_key, cc.source_type,
       cl.do_not_contact, cl.email, cl.phone
     FROM outreach_records orec
     JOIN claim_cases cc ON cc.id = orec.case_id
     JOIN claimants cl ON cl.id = orec.claimant_id
     WHERE orec.status = 'pending'
       AND orec.responded_at IS NULL
       AND (
         (orec.touch_number = 1 AND orec.created_at < NOW() - INTERVAL '14 days')
         OR (orec.touch_number = 2 AND orec.created_at < NOW() - INTERVAL '21 days')
       )
     ORDER BY orec.created_at ASC
     LIMIT 100`,
  );

  let queuedCount = 0;

  for (const row of pendingResult.rows) {
    const rec = row as {
      id: string;
      case_id: string;
      claimant_id: string;
      touch_number: number;
      case_status: string;
      jurisdiction_key: string;
      source_type: string;
      do_not_contact: boolean;
      email: string | null;
      phone: string | null;
    };

    const nextTouch = rec.touch_number + 1;

    if (nextTouch > DEFAULT_OUTREACH_POLICY.maxTouches) {
      continue;
    }

    // Check stop rules before queuing
    const onSuppression = await checkSuppressionList(rec.email, rec.phone);

    // Count existing touches for this case
    const touchCountResult = await query(
      `SELECT COUNT(*)::int AS cnt FROM outreach_records
       WHERE case_id = $1 AND status NOT IN ('failed')`,
      [rec.case_id],
    );
    const touchesSent = touchCountResult.rows[0]?.cnt ?? 0;

    const respondedResult = await query(
      `SELECT 1 FROM outreach_records
       WHERE case_id = $1 AND responded_at IS NOT NULL LIMIT 1`,
      [rec.case_id],
    );
    const responded = respondedResult.rows.length > 0;

    const stopContext: OutreachContext = {
      claimantDoNotContact: Boolean(rec.do_not_contact),
      claimantOptedOut: onSuppression,
      touchesSent,
      maxTouches: DEFAULT_OUTREACH_POLICY.maxTouches,
      claimantResponded: responded,
      caseStatus: rec.case_status,
      suppressionListMatch: onSuppression,
      solicitationBlocked: false,
      jurisdictionRestricted: false,
    };

    const { canSend } = evaluateStopRules(stopContext);

    if (canSend) {
      await outreachQueue.add('generate-letter', {
        type: 'generate-letter',
        data: { caseId: rec.case_id, touchNumber: nextTouch },
      });
      queuedCount++;
    }
  }

  // 2. Find ENROLLED cases with no outreach records older than 30 days
  const noOutreachResult = await query(
    `SELECT cc.id AS case_id
     FROM claim_cases cc
     WHERE cc.status = 'ENROLLED'
       AND cc.created_at < NOW() - INTERVAL '30 days'
       AND NOT EXISTS (
         SELECT 1 FROM outreach_records orec WHERE orec.case_id = cc.id
       )
     LIMIT 50`,
  );

  for (const row of noOutreachResult.rows) {
    const { case_id } = row as { case_id: string };

    await outreachQueue.add('generate-letter', {
      type: 'generate-letter',
      data: { caseId: case_id, touchNumber: 1 },
    });
    queuedCount++;
  }

  console.log(`[Followups] Followup check complete. Queued ${queuedCount} outreach jobs.`);
}

async function handleEscalationCheck(): Promise<void> {
  console.log('[Followups] Running escalation check...');

  let flaggedCount = 0;

  for (const [status, maxDays] of Object.entries(ESCALATION_THRESHOLDS)) {
    // Find cases stuck in this status beyond the threshold
    // Exclude cases already escalated (metadata->>'escalated' = 'true')
    const staleResult = await query(
      `SELECT id, case_number, status, created_at, updated_at, metadata
       FROM claim_cases
       WHERE status = $1
         AND updated_at < NOW() - ($2 || ' days')::INTERVAL
         AND (metadata->>'escalated' IS NULL OR metadata->>'escalated' != 'true')
       ORDER BY updated_at ASC
       LIMIT 50`,
      [status, String(maxDays)],
    );

    for (const row of staleResult.rows) {
      const caseRow = row as {
        id: string;
        case_number: string;
        status: string;
        updated_at: string;
        metadata: Record<string, unknown> | null;
      };

      const escalationMeta = {
        escalated: true,
        escalatedAt: new Date().toISOString(),
        reason: `Case stuck in ${status} for over ${maxDays} days`,
      };

      await query(
        `UPDATE claim_cases
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [caseRow.id, JSON.stringify(escalationMeta)],
      );

      await insertAuditLog(
        'case.escalated',
        'claim_case',
        caseRow.id,
        caseRow.id,
        {
          status,
          thresholdDays: maxDays,
          lastUpdated: caseRow.updated_at,
          reason: escalationMeta.reason,
        },
      );

      flaggedCount++;

      console.log(
        `[Followups] Escalated case ${caseRow.case_number}: ${status} for >${maxDays} days`,
      );
    }
  }

  console.log(`[Followups] Escalation check complete. Flagged ${flaggedCount} cases.`);
}

async function handlePayoutCheck(): Promise<void> {
  console.log('[Followups] Running payout check...');

  // Find cases in AWAITING_PAYOUT for >30 days
  const staleResult = await query(
    `SELECT cc.id, cc.case_number, cc.status, cc.updated_at, cc.metadata
     FROM claim_cases cc
     WHERE cc.status = 'AWAITING_PAYOUT'
       AND cc.updated_at < NOW() - INTERVAL '30 days'
     ORDER BY cc.updated_at ASC
     LIMIT 50`,
  );

  let flaggedCount = 0;

  for (const row of staleResult.rows) {
    const caseRow = row as {
      id: string;
      case_number: string;
      status: string;
      updated_at: string;
      metadata: Record<string, unknown> | null;
    };

    // Check if already flagged for payout follow-up recently (within 7 days)
    const recentAuditResult = await query(
      `SELECT 1 FROM audit_log
       WHERE case_id = $1
         AND action = 'payout.followup_flagged'
         AND timestamp > NOW() - INTERVAL '7 days'
       LIMIT 1`,
      [caseRow.id],
    );

    if (recentAuditResult.rows.length > 0) {
      continue; // Already flagged recently
    }

    await insertAuditLog(
      'payout.followup_flagged',
      'claim_case',
      caseRow.id,
      caseRow.id,
      {
        status: 'AWAITING_PAYOUT',
        daysWaiting: Math.floor(
          (Date.now() - new Date(caseRow.updated_at).getTime()) / (24 * 60 * 60 * 1000),
        ),
        reason: 'Payout pending for over 30 days — requires follow-up with holding entity',
      },
    );

    flaggedCount++;

    console.log(
      `[Followups] Payout follow-up flagged for case ${caseRow.case_number}`,
    );
  }

  console.log(`[Followups] Payout check complete. Flagged ${flaggedCount} cases.`);
}

// --- Main Processor ---

export async function processFollowups(job: Job): Promise<void> {
  const type = job.data?.type || job.name;

  switch (type) {
    case 'followup-check':
      await handleFollowupCheck();
      break;

    case 'escalation-check':
      await handleEscalationCheck();
      break;

    case 'payout-check':
      await handlePayoutCheck();
      break;

    default:
      console.log(`[Followups] Unknown job: ${type}`);
  }
}
