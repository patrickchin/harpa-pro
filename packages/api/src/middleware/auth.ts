/**
 * withAuth: requires a valid better-auth session. Sets `userId`,
 * `sessionId`, `user`, and `db` on the request context for downstream
 * route handlers. The scoped DB accessor (`c.get('db')`) enforces RLS
 * via `withScopedConnection`. See docs/v4/arch-auth-and-rls.md.
 */
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../app.js';
import { auth } from '../auth/auth.js';
import { withScopedConnection } from '../db/scope.js';
import { rawDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import * as authSchema from '../db/auth-schema.js';

export function withAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // Fast-path: reject immediately if no auth credential is present.
    // This avoids initialising the DB pool (rawDb) for public/unauthenticated
    // requests that happen to hit a protected route — important for unit tests
    // and for cold-start latency.
    const hasBearer = c.req.header('authorization')?.startsWith('Bearer ') ?? false;
    const hasCookie = Boolean(c.req.header('cookie'));
    if (!hasBearer && !hasCookie) {
      throw new HTTPException(401, { message: 'Authentication required.' });
    }

    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      throw new HTTPException(401, { message: 'Authentication required.' });
    }
    c.set('userId', session.user.id);
    c.set('sessionId', session.session.id);
    c.set('user', session.user);
    c.set('db', (fn) =>
      withScopedConnection({ sub: session.user.id, sid: session.session.id }, fn),
    );
    await next();
  };
}

/**
 * Test helper: inserts a real better-auth session row into the DB so
 * that `withAuth` can validate it. Returns the bearer token string to
 * set on `Authorization: Bearer <token>` headers in integration tests.
 *
 * Replaces the old `signTestToken(userId, sessionId)` JWT helper.
 * The user row must already exist in `public."user"` before calling this.
 */
export async function signTestSession(userId: string): Promise<{ token: string; sessionId: string }> {
  const sessionId = newId('ses');
  const token = `test_${sessionId}_${crypto.randomUUID().replace(/-/g, '')}`;
  await rawDb().insert(authSchema.session).values({
    id: sessionId,
    token,
    userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { token, sessionId };
}
