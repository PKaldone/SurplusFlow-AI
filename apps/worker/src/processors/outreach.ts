// ============================================================
// Outreach Processor
// Generates outreach letters, emails, and SMS records.
// Evaluates stop rules before each send. Schedules follow-ups.
// ============================================================
import { Job, Queue } from 'bullmq';
import { query } from '../lib/db.js';
import { evaluateStopRules, DEFAULT_OUTREACH_POLICY, getOutreachTemplate } from '@surplusflow/contracts/src/outreach.js';
import type { OutreachContext } from '@surplusflow/contracts/src/outreach.js';
import { QUEUES, AUDIT_ACTIONS, COMPANY } from '@surplusflow/shared';
import type { OutreachChannel } from '@surplusflow/shared';
import { sendEmail, isEmailConfigured } from '../lib/email.js';
import { sendLetter, isMailConfigured } from '../lib/mail.js';
import { getEmailSubject, getEmailHtml, getEmailText } from '../templates/outreach-email.js';
import { getLetterHtml } from '../templates/outreach-letter.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://:sfredis_local_dev@localhost:6379';
const parsed = new URL(REDIS_URL);
const connection = {
  host: parsed.hostname,
  port: parseInt(parsed.port || '6379', 10),
  password: parsed.password || undefined,
};

const outreachQueue = new Queue(QUEUES.OUTREACH, { connection });

// Terminal case statuses — no outreach allowed
const TERMINAL_STATUSES = ['CLOSED', 'WITHDRAWN', 'BLOCKED', 'DENIED', 'RESCINDED'] as const;

// --- Helpers ---

interface CaseJoinRow {
  case_id: string;
  case_number: string;
  case_status: string;
  jurisdiction_key: string;
  source_type: string;
  state: string;
  county: string | null;
  claimed_amount: string | null;
  agreed_fee_pct: string | null;
  opportunity_id: string;
  claimant_id: string;
  // claimant fields
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  claimant_state: string | null;
  zip: string | null;
  do_not_contact: boolean;
  // opportunity fields
  property_description: string | null;
  reported_amount: string | null;
  holder_name: string | null;
  surplus_date: string | null;
}

async function fetchCaseContext(caseId: string): Promise<CaseJoinRow> {
  const result = await query(
    `SELECT
       cc.id AS case_id, cc.case_number, cc.status AS case_status,
       cc.jurisdiction_key, cc.source_type, cc.state, cc.county,
       cc.claimed_amount, cc.agreed_fee_pct, cc.opportunity_id, cc.claimant_id,
       cl.first_name, cl.last_name, cl.email, cl.phone,
       cl.address_line1, cl.address_line2, cl.city,
       cl.state AS claimant_state, cl.zip, cl.do_not_contact,
       o.property_description, o.reported_amount, o.holder_name, o.surplus_date
     FROM claim_cases cc
     JOIN claimants cl ON cl.id = cc.claimant_id
     JOIN opportunities o ON o.id = cc.opportunity_id
     WHERE cc.id = $1`,
    [caseId],
  );

  if (result.rows.length === 0) {
    throw new Error(`Case not found: ${caseId}`);
  }

  return result.rows[0] as CaseJoinRow;
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

async function countTouchesSent(caseId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS cnt FROM outreach_records
     WHERE case_id = $1 AND status NOT IN ('failed')`,
    [caseId],
  );
  return result.rows[0]?.cnt ?? 0;
}

async function hasClaimantResponded(caseId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM outreach_records
     WHERE case_id = $1 AND responded_at IS NOT NULL
     LIMIT 1`,
    [caseId],
  );
  return result.rows.length > 0;
}

async function isSolicitationBlocked(jurisdictionKey: string, sourceType: string): Promise<boolean> {
  const result = await query(
    `SELECT solicitation_restricted FROM jurisdiction_rules
     WHERE jurisdiction_key = $1 AND source_type = $2
       AND effective_date <= CURRENT_DATE
       AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
     ORDER BY effective_date DESC LIMIT 1`,
    [jurisdictionKey, sourceType],
  );

  return result.rows.length > 0 && Boolean(result.rows[0].solicitation_restricted);
}

async function buildStopContext(
  caseRow: CaseJoinRow,
): Promise<OutreachContext> {
  const onSuppression = await checkSuppressionList(caseRow.email, caseRow.phone);
  const touchesSent = await countTouchesSent(caseRow.case_id);
  const responded = await hasClaimantResponded(caseRow.case_id);
  const solBlocked = await isSolicitationBlocked(caseRow.jurisdiction_key, caseRow.source_type);

  return {
    claimantDoNotContact: Boolean(caseRow.do_not_contact),
    claimantOptedOut: onSuppression,
    touchesSent,
    maxTouches: DEFAULT_OUTREACH_POLICY.maxTouches,
    claimantResponded: responded,
    caseStatus: caseRow.case_status,
    suppressionListMatch: onSuppression,
    solicitationBlocked: solBlocked,
    jurisdictionRestricted: false, // would need a dedicated rule field
  };
}

function buildMergeData(caseRow: CaseJoinRow): Record<string, unknown> {
  return {
    claimantFirstName: caseRow.first_name,
    claimantLastName: caseRow.last_name,
    claimantFullName: `${caseRow.first_name} ${caseRow.last_name}`,
    claimantAddress: [caseRow.address_line1, caseRow.address_line2].filter(Boolean).join(', '),
    claimantCity: caseRow.city,
    claimantState: caseRow.claimant_state,
    claimantZip: caseRow.zip,
    claimantEmail: caseRow.email,
    propertyDescription: caseRow.property_description,
    reportedAmount: caseRow.reported_amount ? `$${Number(caseRow.reported_amount).toLocaleString()}` : 'Unknown',
    holderName: caseRow.holder_name,
    jurisdictionState: caseRow.state,
    jurisdictionCounty: caseRow.county,
    caseNumber: caseRow.case_number,
    companyName: COMPANY.name,
    companyAddress: COMPANY.address,
    companyPhone: COMPANY.phone,
    companyEmail: COMPANY.email,
    companyWebsite: COMPANY.website,
    optOutUrl: COMPANY.optOutUrl,
    optOutPhone: COMPANY.optOutPhone,
    feePercent: caseRow.agreed_fee_pct ?? '33',
    todayDate: new Date().toISOString().split('T')[0],
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

function getFollowupDelayMs(touchNumber: number): number {
  // Touch 1→2: 14 days, Touch 2→3: 21 days
  if (touchNumber <= 1) {
    return DEFAULT_OUTREACH_POLICY.touch1ToTouch2Days * 24 * 60 * 60 * 1000;
  }
  return DEFAULT_OUTREACH_POLICY.touch2ToTouch3Days * 24 * 60 * 60 * 1000;
}

// --- Job Handlers ---

async function handleGenerateOutreach(
  data: { caseId: string; touchNumber: number },
  channel: OutreachChannel,
): Promise<void> {
  const { caseId, touchNumber } = data;

  // 1. Fetch case + claimant + opportunity
  const caseRow = await fetchCaseContext(caseId);

  // 2. Build and evaluate stop rules
  const stopContext = await buildStopContext(caseRow);
  const { canSend, triggeredRules } = evaluateStopRules(stopContext);

  if (!canSend) {
    const stopReasons = triggeredRules.map(r => r.code).join(', ');
    console.log(
      `[Outreach] Stopped for case ${caseRow.case_number} touch ${touchNumber} (${channel}): ${stopReasons}`,
    );

    // Insert outreach record with failed status and stop reason
    await query(
      `INSERT INTO outreach_records
         (case_id, claimant_id, channel, template_key, touch_number, status, stop_reason)
       VALUES ($1, $2, $3, $4, $5, 'failed', $6)`,
      [
        caseId,
        caseRow.claimant_id,
        channel,
        getOutreachTemplate(channel, touchNumber) ?? `outreach_${channel}_v1`,
        touchNumber,
        stopReasons,
      ],
    );

    await insertAuditLog(
      AUDIT_ACTIONS.OUTREACH_CREATED,
      'outreach_record',
      null,
      caseId,
      { channel, touchNumber, stopped: true, stopReasons, triggeredRules: triggeredRules.map(r => r.code) },
    );

    return;
  }

  // 3. Build merge data and select template
  const mergeData = buildMergeData(caseRow);
  const templateKey = getOutreachTemplate(channel, touchNumber) ?? `outreach_${channel}_v1`;

  // 4. Insert outreach record as pending
  const insertResult = await query(
    `INSERT INTO outreach_records
       (case_id, claimant_id, channel, template_key, touch_number, status, merge_data)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6)
     RETURNING id`,
    [
      caseId,
      caseRow.claimant_id,
      channel,
      templateKey,
      touchNumber,
      JSON.stringify(mergeData),
    ],
  );

  const outreachRecordId = insertResult.rows[0]?.id;

  console.log(
    `[Outreach] Created ${channel} record ${outreachRecordId} for case ${caseRow.case_number}, touch ${touchNumber}`,
  );

  // 5. Send email if channel is email and claimant has an email address
  if ((channel === 'email' || channel === 'mail') && caseRow.email && isEmailConfigured()) {
    try {
      const subject = getEmailSubject(touchNumber, mergeData as unknown as Parameters<typeof getEmailSubject>[1]);
      const html = getEmailHtml(touchNumber, mergeData as unknown as Parameters<typeof getEmailHtml>[1]);
      const text = getEmailText(touchNumber, mergeData as unknown as Parameters<typeof getEmailText>[1]);

      const result = await sendEmail({
        to: caseRow.email,
        subject,
        html,
        text,
        replyTo: COMPANY.email,
        tags: [
          { name: 'case', value: caseRow.case_number },
          { name: 'touch', value: String(touchNumber) },
          { name: 'channel', value: channel },
        ],
      });

      if (result.success) {
        await query(
          `UPDATE outreach_records SET status = 'sent', sent_at = NOW(), external_id = $2 WHERE id = $1`,
          [outreachRecordId, result.id],
        );
        console.log(`[Outreach] Email sent to ${caseRow.email} for case ${caseRow.case_number} (resend:${result.id})`);
      } else {
        await query(
          `UPDATE outreach_records SET status = 'failed', stop_reason = $2 WHERE id = $1`,
          [outreachRecordId, `Email send failed: ${result.error}`],
        );
        console.error(`[Outreach] Email failed for case ${caseRow.case_number}: ${result.error}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await query(
        `UPDATE outreach_records SET status = 'failed', stop_reason = $2 WHERE id = $1`,
        [outreachRecordId, `Email error: ${errMsg}`],
      );
      console.error(`[Outreach] Email error for case ${caseRow.case_number}: ${errMsg}`);
    }
  }

  // 5b. Send physical letter if channel is mail, claimant has address, and Lob is configured
  if (channel === 'mail' && caseRow.address_line1 && caseRow.claimant_state && caseRow.zip && isMailConfigured()) {
    try {
      const letterHtml = getLetterHtml(touchNumber, mergeData as unknown as Parameters<typeof getLetterHtml>[1]);

      const result = await sendLetter({
        to: {
          name: `${caseRow.first_name} ${caseRow.last_name}`,
          address_line1: caseRow.address_line1,
          address_line2: caseRow.address_line2 ?? undefined,
          address_city: caseRow.city ?? '',
          address_state: caseRow.claimant_state,
          address_zip: caseRow.zip,
        },
        html: letterHtml,
        description: `SurplusFlow Outreach Touch ${touchNumber} — Case ${caseRow.case_number}`,
        metadata: {
          case_number: caseRow.case_number,
          touch_number: String(touchNumber),
          case_id: caseId,
        },
      });

      if (result.success) {
        await query(
          `UPDATE outreach_records SET status = 'sent', sent_at = NOW(), external_id = $2 WHERE id = $1`,
          [outreachRecordId, result.id],
        );
        console.log(`[Outreach] Letter sent for case ${caseRow.case_number} (lob:${result.id}, ETA: ${result.expectedDelivery})`);
      } else {
        await query(
          `UPDATE outreach_records SET status = 'failed', stop_reason = $2 WHERE id = $1`,
          [outreachRecordId, `Letter send failed: ${result.error}`],
        );
        console.error(`[Outreach] Letter failed for case ${caseRow.case_number}: ${result.error}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await query(
        `UPDATE outreach_records SET status = 'failed', stop_reason = $2 WHERE id = $1`,
        [outreachRecordId, `Letter error: ${errMsg}`],
      );
      console.error(`[Outreach] Letter error for case ${caseRow.case_number}: ${errMsg}`);
    }
  }

  // 6. Schedule follow-up for next touch if not at max
  if (touchNumber < DEFAULT_OUTREACH_POLICY.maxTouches) {
    const delayMs = getFollowupDelayMs(touchNumber);
    await outreachQueue.add(
      'schedule-followup',
      {
        type: 'schedule-followup',
        data: { caseId, touchNumber: touchNumber + 1 },
      },
      { delay: delayMs },
    );

    console.log(
      `[Outreach] Follow-up touch ${touchNumber + 1} scheduled in ${delayMs / (24 * 60 * 60 * 1000)} days`,
    );
  }

  // 6. Audit log
  await insertAuditLog(
    AUDIT_ACTIONS.OUTREACH_CREATED,
    'outreach_record',
    outreachRecordId,
    caseId,
    { channel, touchNumber, templateKey, claimantId: caseRow.claimant_id },
  );
}

async function handleScheduleFollowup(data: { caseId: string; touchNumber: number }): Promise<void> {
  const { caseId, touchNumber } = data;

  // Check if max touches already reached
  const touchCount = await countTouchesSent(caseId);

  if (touchCount >= DEFAULT_OUTREACH_POLICY.maxTouches) {
    console.log(`[Outreach] Max touches reached for case ${caseId}, skipping follow-up`);
    return;
  }

  // Queue the next outreach generation
  await outreachQueue.add('generate-letter', {
    type: 'generate-letter',
    data: { caseId, touchNumber },
  });

  console.log(`[Outreach] Queued follow-up touch ${touchNumber} for case ${caseId}`);
}

// --- Main Processor ---

export async function processOutreach(job: Job): Promise<void> {
  const type = job.data.type || job.name;
  const data = job.data.data || job.data;

  switch (type) {
    case 'generate-letter':
      await handleGenerateOutreach(data, 'mail');
      break;

    case 'generate-email':
      await handleGenerateOutreach(data, 'email');
      break;

    case 'generate-sms':
      await handleGenerateOutreach(data, 'sms');
      break;

    case 'schedule-followup':
      await handleScheduleFollowup(data);
      break;

    default:
      throw new Error(`Unknown outreach job type: ${type}`);
  }
}
