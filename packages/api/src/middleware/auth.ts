/**
 * withAuth: validates a better-auth session and populates `userId` /
 * `sessionId` / scoped-`db` on the request context for downstream
 * `withScopedConnection` calls (see docs/v4/arch-auth-and-rls.md).
 *
 * Bearer token comes from the `Authorization: Bearer <token>` header
 * via better-auth's `expo()` plugin. Session-row validation happens
 * inside `auth.api.getSession()` — including expiry — so route
 * handlers no longer need their own `sessionIsValid` check.
 *
 * `signTestToken` mints a real session against the unscoped pool so
 * integration tests can exercise the full request → middleware →
 * route flow without going through the email-OTP path.
 */
import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { sql } from 'drizzle-orm';
import type { AppEnv } from '../app.js';
import { auth } from '../auth/auth.js';
import { rawDb } from '../db/client.js';
import { withScopedConnection } from '../db/scope.js';
import { assertId } from '../lib/ids.js';

export function withAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!result?.session || !result.user) {
      throw new HTTPException(401, { message: 'Unauthorized.' });
    }
    const sub = result.user.id;
    const sid = result.session.id;
    c.set('userId', sub);
    c.set('sessionId', sid);
    c.set('db', (fn) => withScopedConnection({ sub, sid }, fn));
    await next();
  };
}

/**
 * Mint a real better-auth session row for tests and return the bearer
 * token to use in the `Authorization` header. Inserts directly via
 * `rawDb()` (the unscoped pool) so the test doesn't need an admin
 * client; the user row must already exist (tests seed it via
 * `seedAuthUser` in `__tests__/setup-pg.ts`).
 *
 * Branding: `sub` / `sid` are slug-validated at this trust boundary
 * — same shape as the production `getSession()` path.
 */
export async function signTestToken(sub: string, sid: string): Promise<string> {
  const userId = assertId('usr', sub, 'signTestToken sub');
  const sessionId = assertId('ses', sid, 'signTestToken sid');
  const token = randomUUID().replace(/-/g, '');
  await rawDb().execute(sql`
    INSERT INTO public."session" (id, user_id, token, expires_at, updated_at, created_at)
    VALUES (
      ${sessionId},
      ${userId},
      ${token},
      now() + interval '7 days',
      now(),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      token = EXCLUDED.token,
      expires_at = EXCLUDED.expires_at,
      updated_at = EXCLUDED.updated_at
  `);
  return token;
}
