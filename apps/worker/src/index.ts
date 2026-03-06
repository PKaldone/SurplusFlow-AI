// ============================================================
// SurplusFlow AI — Worker (BullMQ)
// Processes background jobs: ingestion, matching, docgen, outreach, followups
// ============================================================

import { Worker, Queue } from 'bullmq';
import { QUEUES } from '@surplusflow/shared';
import { processIngestion } from './processors/ingestion.js';
import { processDocgen } from './processors/docgen.js';
import { processOutreach } from './processors/outreach.js';
import { processCompliance } from './processors/compliance.js';
import { processFollowups } from './processors/followups.js';
import { processMatching } from './processors/matching.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://:sfredis_local_dev@localhost:6379';
const parsed = new URL(REDIS_URL);
const connection = {
  host: parsed.hostname,
  port: parseInt(parsed.port || '6379', 10),
  password: parsed.password || undefined,
  maxRetriesPerRequest: null as null,
};

// --- Create Queues (for enqueuing from API) ---
export const queues = {
  [QUEUES.INGESTION]: new Queue(QUEUES.INGESTION, { connection }),
  [QUEUES.MATCHING]: new Queue(QUEUES.MATCHING, { connection }),
  [QUEUES.OUTREACH]: new Queue(QUEUES.OUTREACH, { connection }),
  [QUEUES.DOCGEN]: new Queue(QUEUES.DOCGEN, { connection }),
  [QUEUES.COMPLIANCE]: new Queue(QUEUES.COMPLIANCE, { connection }),
  [QUEUES.NOTIFICATIONS]: new Queue(QUEUES.NOTIFICATIONS, { connection }),
  [QUEUES.FOLLOWUPS]: new Queue(QUEUES.FOLLOWUPS, { connection }),
};

// --- Workers ---

const ingestionWorker = new Worker(QUEUES.INGESTION, processIngestion, {
  connection, concurrency: 3,
  removeOnComplete: { count: 100 },
});

const docgenWorker = new Worker(QUEUES.DOCGEN, processDocgen, {
  connection, concurrency: 2,
  removeOnComplete: { count: 100 },
});

const outreachWorker = new Worker(QUEUES.OUTREACH, processOutreach, {
  connection, concurrency: 5,
  removeOnComplete: { count: 100 },
});

const complianceWorker = new Worker(QUEUES.COMPLIANCE, processCompliance, {
  connection, concurrency: 3,
  removeOnComplete: { count: 100 },
});

const followupsWorker = new Worker(QUEUES.FOLLOWUPS, processFollowups, {
  connection, concurrency: 2,
  removeOnComplete: { count: 100 },
});

const matchingWorker = new Worker(QUEUES.MATCHING, processMatching, {
  connection, concurrency: 3,
  removeOnComplete: { count: 100 },
});

// --- Event Logging ---
const workers = [ingestionWorker, docgenWorker, outreachWorker, complianceWorker, followupsWorker, matchingWorker];

workers.forEach(worker => {
  worker.on('completed', (job) => {
    console.log(`[${worker.name}] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[${worker.name}] Job ${job?.id} failed:`, err.message);
  });
  worker.on('error', (err) => {
    console.error(`[${worker.name}] Worker error:`, err.message);
  });
});

// --- Scheduled Jobs (cron) ---
// Followup checker runs every hour
queues[QUEUES.FOLLOWUPS].add('followup-check', {}, {
  repeat: { pattern: '0 * * * *' }, // every hour
  jobId: 'scheduled-followup-check',
});

// Escalation checker runs every 6 hours
queues[QUEUES.FOLLOWUPS].add('escalation-check', {}, {
  repeat: { pattern: '0 */6 * * *' },
  jobId: 'scheduled-escalation-check',
});

// Auto-scrape: runs daily at 6 AM UTC — autonomous opportunity discovery
queues[QUEUES.INGESTION].add('scrape-state-surplus', { state: 'FL', automated: true }, {
  repeat: { pattern: '0 6 * * *' },
  jobId: 'auto-scrape-FL',
});
queues[QUEUES.INGESTION].add('scrape-state-surplus', { state: 'TX', automated: true }, {
  repeat: { pattern: '5 6 * * *' },
  jobId: 'auto-scrape-TX',
});
queues[QUEUES.INGESTION].add('scrape-state-surplus', { state: 'CA', automated: true }, {
  repeat: { pattern: '10 6 * * *' },
  jobId: 'auto-scrape-CA',
});
queues[QUEUES.INGESTION].add('scrape-state-surplus', { state: 'OH', automated: true }, {
  repeat: { pattern: '15 6 * * *' },
  jobId: 'auto-scrape-OH',
});
queues[QUEUES.INGESTION].add('scrape-state-surplus', { state: 'NY', automated: true }, {
  repeat: { pattern: '20 6 * * *' },
  jobId: 'auto-scrape-NY',
});

// Auto-compliance: runs every 2 hours — check new prospects
queues[QUEUES.COMPLIANCE].add('batch-rule-check', {}, {
  repeat: { pattern: '0 */2 * * *' },
  jobId: 'auto-compliance-check',
});

console.log('SurplusFlow Worker started. Listening on queues:', Object.keys(queues).join(', '));

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down workers...');
  await Promise.all(workers.map(w => w.close()));
  await Promise.all(Object.values(queues).map(q => q.close()));
  process.exit(0);
});
