import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { env } from '../env.js';
import { parseConnection } from './connection.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/**
 * Server-side cap on any single statement's execution time. Bounds the
 * blast radius of a runaway query (planner regression, missing index,
 * pathological input) so a single request can't hold a pool connection
 * indefinitely and starve healthy traffic. 5 s is comfortably above
 * the slowest known endpoint p99 and well under the upstream Fly /
 * load-balancer idle timeout. Applied per session via pg's PoolConfig;
 * routes that legitimately need longer (none today) would override
 * with `SET LOCAL statement_timeout` inside their transaction.
 * See docs/v4/plan-p4-hardening.md §P4.2.
 */
const STATEMENT_TIMEOUT_MS = 5_000;

/** Lazy-init pool. Allows tests to set DATABASE_URL after import. */
export function getPool(connectionString?: string): pg.Pool {
  if (!pool) {
    const url = connectionString ?? env.DATABASE_URL;
    if (!url) {
      throw new Error('[db] DATABASE_URL is not set; cannot create pool.');
    }
    pool = new Pool({
      ...parseConnection(url),
      max: 10,
      statement_timeout: STATEMENT_TIMEOUT_MS,
    });
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
