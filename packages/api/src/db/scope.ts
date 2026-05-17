import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { getPool } from './client.js';
import { assertId } from '../lib/ids.js';

export interface ScopeClaims {
  /**
   * User id slug (e.g. `usr_abcdef12`). The `assertId('usr', …)` call in
   * `withScopedConnection` enforces the shape at runtime; the type
   * stays plain `string` so tests and middleware don't need to brand
   * every value at the boundary (the runtime check is the load-bearing
   * one for the `SET LOCAL` interpolation below).
   */
  sub: string;
  /** Session id slug (e.g. `ses_abcdef12abcd`). Same shape contract as `sub`. */
  sid: string;
}

export type ScopedDb = NodePgDatabase<typeof schema>;

/**
 * Run `fn` against a per-request Postgres connection that has been scoped to
 * the actor via `SET LOCAL role` and `SET LOCAL app.user_id`. RLS policies in
 * the `app` schema use `current_setting('app.user_id')` to filter rows.
 *
 * Claim shape is enforced at the prefix-and-charset level by `assertId`
 * (slug regex `^<prefix>_[0-9a-hjkmnp-tv-z]{8,16}$`); this is defence-
 * in-depth against accidental SQL via the `SET LOCAL` string
 * interpolation below — a passing claim cannot contain a quote.
 *
 * See docs/v4/arch-auth-and-rls.md.
 */
export async function withScopedConnection<T>(
  claims: ScopeClaims,
  fn: (db: ScopedDb) => Promise<T>,
): Promise<T> {
  assertId('usr', claims.sub, 'claims.sub');
  assertId('ses', claims.sid, 'claims.sid');

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

/**
 * Run `fn` against a per-request Postgres connection pinned to the
 * `app_anonymous` role. Used by public, unauthenticated routes (e.g.
 * marketing waitlist signup). The role has `INSERT`-only grants on
 * `app.waitlist_signups`; SELECT/UPDATE/DELETE are denied by both
 * column grants and RLS.
 *
 * Mirrors `withScopedConnection` but without `sub`/`sid` claims since
 * the caller is unauthenticated.
 */
export async function withAnonConnection<T>(fn: (db: ScopedDb) => Promise<T>): Promise<T> {
  const pool = getPool();
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    await conn.query(`SET LOCAL role app_anonymous`);
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
