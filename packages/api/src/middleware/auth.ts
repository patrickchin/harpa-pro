/**
 * withAuth: requires a valid bearer JWT issued by `auth/jwt.ts`. Sets
 * `userId` (jwt sub) and `sessionId` (jwt sid) on the request context for
 * downstream `withScopedConnection` calls (see docs/v4/arch-auth-and-rls.md).
 *
 * Session-row validation (revocation on logout) is enforced by route
 * handlers — see e.g. `routes/me.ts` — to avoid a hard middleware
 * dependency on the DB for routes that don't need it.
 */
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../app.js';
import { signJwt, verifyJwt } from '../auth/jwt.js';
import { withScopedConnection } from '../db/scope.js';

export function withAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.req.header('authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing bearer token.' });
    }
    const token = auth.slice('Bearer '.length).trim();
    let claims;
    try {
      claims = await verifyJwt(token);
    } catch {
      throw new HTTPException(401, { message: 'Invalid token.' });
    }
    c.set('userId', claims.sub);
    c.set('sessionId', claims.sid);
    c.set('db', (fn) => withScopedConnection({ sub: claims.sub, sid: claims.sid }, fn));
    await next();
  };
}

/**
 * Mint a real JWT for tests. Same shape as production tokens — kept
 * exported so integration tests (and the existing unit suite) can
 * construct an authenticated request without going through Twilio.
 */
export async function signTestToken(sub: string, sid: string): Promise<string> {
  return signJwt({ sub, sid });
}
