import pg from 'pg';
import { config } from '../config/index.js';

const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  min: config.DB_POOL_MIN,
  max: config.DB_POOL_MAX,
});

export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export { pool };
