/**
 * withAdmin — checks `auth.users.is_admin = true` for the caller.
 * Mounts on top of `withAuth()` (which has already populated
 * `userId`). On non-admin, returns 403. On no-session, 401 (delegated
 * to withAuth).
 *
 * Uses `rawDb()` so the check works even if the scoped role can't
 * SELECT the user row.
 */
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { sql } from 'drizzle-orm';
import type { AppEnv } from '../app.js';
import { rawDb } from '../db/client.js';

export function withAdmin(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = c.get('userId');
    if (!userId) {
      throw new HTTPException(401, { message: 'Missing bearer token.' });
    }
    const result = await rawDb().execute<{ is_admin: boolean }>(
      sql`SELECT is_admin FROM auth.users WHERE id = ${userId}::uuid LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row || row.is_admin !== true) {
      throw new HTTPException(403, { message: 'Admin access required.' });
    }
    await next();
  };
}
