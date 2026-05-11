import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { env } from '../env.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/** Lazy-init pool. Allows tests to set DATABASE_URL after import. */
export function getPool(connectionString?: string): pg.Pool {
  if (!pool) {
    const url = connectionString ?? env.DATABASE_URL;
    if (!url) {
      throw new Error('[db] DATABASE_URL is not set; cannot create pool.');
    }
    pool = new Pool({ connectionString: url, max: 10 });
  }
  return pool;
}

/** Reset the pool (used by Testcontainers between test files). */
export async function resetPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Raw drizzle handle. **Do NOT import directly from route handlers** —
 * use `c.get('db')(fn)` for the per-request scoped accessor.
 * The lint rule `no-restricted-imports` blocks raw imports from
 * `packages/api/src/routes/`.
 */
export function rawDb(connectionString?: string): NodePgDatabase<typeof schema> {
  return drizzle(getPool(connectionString), { schema });
}

export { schema };
