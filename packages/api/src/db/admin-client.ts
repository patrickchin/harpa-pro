import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { env } from '../env.js';
import { captureApiException } from '../telemetry/sentry.js';
import { parseConnection } from './connection.js';
import * as adminSchema from './admin-schema.js';

const { Pool } = pg;

/** Bounds both new socket establishment and waits for an exhausted pool. */
const CONNECTION_TIMEOUT_MS = 5_000;
const STATEMENT_TIMEOUT_MS = 5_000;
let adminPool: pg.Pool | null = null;

/**
 * Lazy pool for the separate admin database.
 *
 * An explicit connection string is accepted for integration tests. Call
 * resetAdminPool() before switching databases in the same process.
 */
export function getAdminPool(connectionString?: string): pg.Pool {
  if (!adminPool) {
    const url = connectionString ?? env.ADMIN_DATABASE_URL;
    if (!url) {
      throw new Error('[admin-db] ADMIN_DATABASE_URL is not set; cannot create pool.');
    }
    adminPool = new Pool({
      ...parseConnection(url),
      max: 5,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      statement_timeout: STATEMENT_TIMEOUT_MS,
    });
    adminPool.on('error', (err) => {
      captureApiException(err, {
        requestId: 'admin-pool-idle',
        method: 'DB',
        route: 'pg.admin-pool.idle-client',
        status: 0,
      });
    });
  }
  return adminPool;
}

/** Close and forget the admin pool, primarily for Testcontainers. */
export async function resetAdminPool(): Promise<void> {
  if (adminPool) {
    await adminPool.end();
    adminPool = null;
  }
}

/** Unscoped Drizzle handle for the isolated admin-auth service. */
export function rawAdminDb(connectionString?: string): NodePgDatabase<typeof adminSchema> {
  return drizzle(getAdminPool(connectionString), { schema: adminSchema });
}

export { adminSchema };
