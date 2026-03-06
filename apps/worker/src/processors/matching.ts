// ============================================================
// Matching Processor
// Handles auto-enrollment of claimants to opportunities
// ============================================================
import { Job } from 'bullmq';
import { query } from '../lib/db.js';

export async function processMatching(job: Job): Promise<void> {
  const type = job.data.type || job.name;

  switch (type) {
    case 'auto-enroll': {
      const { opportunityId } = job.data;
      // 1. Fetch the opportunity
      const { rows: [opp] } = await query(
        `SELECT id, owner_name, state, jurisdiction_key, source_type, reported_amount
         FROM opportunities WHERE id = $1 AND status = 'new'`,
        [opportunityId],
      );
      if (!opp) {
        console.log(`[Matching] Opportunity ${opportunityId} not found or not in 'new' status`);
        return;
      }

      // 2. Try to match against existing claimants by name
      const { rows: claimants } = await query(
        `SELECT id, first_name, last_name FROM claimants
         WHERE LOWER(CONCAT(first_name, ' ', last_name)) = LOWER($1)
           AND do_not_contact = FALSE
         LIMIT 5`,
        [opp.owner_name],
      );

      if (claimants.length === 0) {
        console.log(`[Matching] No claimant match for opportunity ${opportunityId} (${opp.owner_name})`);
        // Mark opportunity as matched (no claimant yet — outreach may create one)
        await query(
          `UPDATE opportunities SET status = 'matched', updated_at = NOW() WHERE id = $1`,
          [opportunityId],
        );
        return;
      }

      // 3. For the first matched claimant, check if case already exists
      const claimant = claimants[0];
      const { rows: existing } = await query(
        `SELECT id FROM claim_cases WHERE opportunity_id = $1 AND claimant_id = $2`,
        [opp.id, claimant.id],
      );
      if (existing.length > 0) {
        console.log(`[Matching] Case already exists for opp ${opportunityId} + claimant ${claimant.id}`);
        return;
      }

      // 4. Generate case number
      const { rows: [{ count }] } = await query(`SELECT COUNT(*)::int AS count FROM claim_cases`);
      const caseNumber = `SF-${String(count + 1).padStart(6, '0')}`;

      // 5. Create the case
      const { rows: [newCase] } = await query(
        `INSERT INTO claim_cases (case_number, opportunity_id, claimant_id, status, source_type, jurisdiction_key, state, county, claimed_amount, agreed_fee_pct)
         VALUES ($1, $2, $3, 'PROSPECT', $4, $5, $6, $7, $8, 33)
         RETURNING id`,
        [caseNumber, opp.id, claimant.id, opp.source_type, opp.jurisdiction_key, opp.state, opp.county || null, opp.reported_amount],
      );

      // 6. Update opportunity status
      await query(
        `UPDATE opportunities SET status = 'matched', updated_at = NOW() WHERE id = $1`,
        [opp.id],
      );

      // 7. Audit log
      await query(
        `INSERT INTO audit_log (action, resource_type, resource_id, case_id, details)
         VALUES ('case.created', 'claim_case', $1, $1, $2)`,
        [newCase.id, JSON.stringify({ source: 'auto-enroll', opportunityId, claimantId: claimant.id, caseNumber })],
      );

      console.log(`[Matching] Created case ${caseNumber} for opp ${opportunityId} + claimant ${claimant.id}`);
      break;
    }

    default:
      console.log(`[Matching] Unknown job type: ${type}`);
  }
}
