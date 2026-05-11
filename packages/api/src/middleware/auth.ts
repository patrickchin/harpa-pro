/**
 * withAuth: requires a valid bearer token, sets userId/sessionId on the context.
 * P0.4 wires this to better-auth. For now it accepts a HMAC-signed token of
 * the shape `<userId>.<sessionId>.<sig>` produced by signTestToken — only used
 * by integration tests until better-auth lands.
 */
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AppEnv } from '../app.js';
import { env } from '../env.js';

export function withAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.req.header('authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing bearer token.' });
    }
    const token = auth.slice('Bearer '.length).trim();
    const claims = verifyTestToken(token);
    if (!claims) throw new HTTPException(401, { message: 'Invalid token.' });
    c.set('userId', claims.sub);
    c.set('sessionId', claims.sid);
    await next();
  };
}

export function signTestToken(sub: string, sid: string): string {
  const body = `${sub}.${sid}`;
  const sig = createHmac('sha256', env.BETTER_AUTH_SECRET).update(body).digest('hex');
  return `${body}.${sig}`;
}

function verifyTestToken(token: string): { sub: string; sid: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [sub, sid, sig] = parts as [string, string, string];
  const expected = createHmac('sha256', env.BETTER_AUTH_SECRET).update(`${sub}.${sid}`).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return { sub, sid };
}
