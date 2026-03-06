// ============================================================
// SurplusFlow AI — Worker Database Connection
// ============================================================
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://sfuser:sfpass_local_dev@localhost:5432/surplusflow';

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  min: 2,
  max: 10,
});

export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export { pool };
