import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../app.js';
import { clearAdminSessionCookie, readAdminSessionToken } from '../lib/admin-cookie.js';
import { clientIp } from '../lib/clientIp.js';
import { readAdminSession } from '../services/admin-auth.js';

export function withAdminSession(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = readAdminSessionToken(c);
    if (!token) {
      throw new HTTPException(401, { message: 'Unauthorized.' });
    }

    const session = await readAdminSession(token);
    if (!session) {
      clearAdminSessionCookie(c);
      console.info(
        '[admin-auth]',
        JSON.stringify({
          requestId: c.get('requestId'),
          ip: clientIp(c),
          outcome: 'session_rejected',
        }),
      );
      throw new HTTPException(401, { message: 'Unauthorized.' });
    }

    c.set('adminIdentityId', session.identityId);
    c.set('adminSessionId', session.sessionId);
    c.set('adminEmail', session.email);
    await next();
  };
}
