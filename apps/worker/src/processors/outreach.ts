// ============================================================
// Outreach Processor
// ============================================================
import { Job } from 'bullmq';

export async function processOutreach(job: Job): Promise<void> {
  const { type, data } = job.data;

  switch (type) {
    case 'generate-letter':
      // 1. Fetch case + claimant + opportunity data
      // 2. Build OutreachMergeData
      // 3. Check stop rules — abort if any triggered
      // 4. Select template based on channel + touch number
      // 5. Render template
      // 6. Generate PDF for mail
      // 7. Upload to storage (outreach copy)
      // 8. Create outreach_record with status 'pending'
      // 9. Queue for printing/mailing service
      console.log(`[Outreach] Generating letter for case ${data.caseId}, touch ${data.touchNumber}`);
      break;

    case 'generate-email':
      // Similar to letter but:
      // 1. Render HTML email template
      // 2. Enqueue on notifications queue for email delivery
      console.log(`[Outreach] Generating email for case ${data.caseId}, touch ${data.touchNumber}`);
      break;

    case 'generate-sms':
      // 1. Render SMS template (keep under 320 chars)
      // 2. Enqueue on notifications queue for SMS delivery
      console.log(`[Outreach] Generating SMS for case ${data.caseId}, touch ${data.touchNumber}`);
      break;

    case 'schedule-followup':
      // 1. Calculate next touch date based on policy intervals
      // 2. Schedule delayed job for next touch
      // 3. Check if max touches reached — if so, stop
      console.log(`[Outreach] Scheduling followup for case ${data.caseId}`);
      break;

    default:
      throw new Error(`Unknown outreach job type: ${type}`);
  }
}
