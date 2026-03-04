// ============================================================
// Ingestion Processor
// ============================================================
import { Job } from 'bullmq';

export async function processIngestion(job: Job): Promise<void> {
  const { type, data } = job.data;

  switch (type) {
    case 'import-state-data':
      // 1. Parse CSV/API response from state unclaimed property database
      // 2. Normalize fields to opportunity schema
      // 3. Deduplicate against existing opportunities (source_type + source_id)
      // 4. Insert new opportunities with status 'new'
      // 5. Enqueue matching jobs for new opportunities
      console.log(`[Ingestion] Processing state data import: ${data.state}`);
      break;

    case 'import-county-records':
      // 1. Parse court/county records for foreclosure surplus
      // 2. Extract parcel numbers, sale dates, surplus amounts
      // 3. Insert opportunities
      console.log(`[Ingestion] Processing county records: ${data.county}, ${data.state}`);
      break;

    case 'import-csv':
      // 1. Parse uploaded CSV file from MinIO
      // 2. Validate rows against schema
      // 3. Insert valid rows, report errors
      console.log(`[Ingestion] Processing CSV import: ${data.filename}`);
      break;

    default:
      throw new Error(`Unknown ingestion job type: ${type}`);
  }
}
