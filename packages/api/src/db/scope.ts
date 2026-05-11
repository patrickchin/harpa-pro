import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { getPool } from './client.js';

export interface ScopeClaims {
  sub: string; // user id (uuid)
  sid: string; // session id (uuid)
}

export type ScopedDb = NodePgDatabase<typeof schema>;

/**
 * Run `fn` against a per-request Postgres connection that has been scoped to
 * the actor via `SET LOCAL role` and `SET LOCAL app.user_id`. RLS policies in
 * the `app` schema use `current_setting('app.user_id')` to filter rows.
 *
 * See docs/v4/arch-auth-and-rls.md.
 */
export async function withScopedConnection<T>(
  claims: ScopeClaims,
  fn: (db: ScopedDb) => Promise<T>,
): Promise<T> {
  // Reject anything that doesn't look like a UUID — defence in depth against
  // accidental SQL via the SET LOCAL string interpolation below.
  assertUuid(claims.sub, 'claims.sub');
  assertUuid(claims.sid, 'claims.sid');

  const pool = getPool();
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    await conn.query(`SET LOCAL role app_authenticated`);
    await conn.query(`SET LOCAL app.user_id = '${claims.sub}'`);
    await conn.query(`SET LOCAL app.session_id = '${claims.sid}'`);
    const db = drizzle(conn, { schema });
    const result = await fn(db);
    await conn.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await conn.query('ROLLBACK');
    } catch {
      // ignore secondary failure
    }
    throw err;
  } finally {
    conn.release();
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`[scope] ${label} is not a valid UUID: ${JSON.stringify(value)}`);
  }
}
