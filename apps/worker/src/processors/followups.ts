// ============================================================
// Followups Processor
// ============================================================
import { Job } from 'bullmq';

export async function processFollowups(job: Job): Promise<void> {
  const { type } = job.data || { type: job.name };

  switch (type || job.name) {
    case 'followup-check':
      // Runs hourly:
      // 1. Find outreach records where next touch is due
      // 2. Check stop rules for each
      // 3. Enqueue outreach generation for eligible records
      console.log('[Followups] Running followup check');
      break;

    case 'escalation-check':
      // Runs every 6 hours:
      // 1. Find cases stuck in a status too long (configurable thresholds)
      // 2. Flag for ops review
      // 3. Check for approaching deadlines
      console.log('[Followups] Running escalation check');
      break;

    case 'payout-check':
      // 1. Check cases in AWAITING_PAYOUT for extended periods
      // 2. Flag for follow-up with holding entity
      console.log('[Followups] Running payout check');
      break;

    default:
      console.log(`[Followups] Unknown job: ${type || job.name}`);
  }
}
