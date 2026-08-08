import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../app.js';
import { readAdminSessionToken } from './admin-cookie.js';

export const ADMIN_CSRF_HEADER = 'X-Admin-CSRF';

const ADMIN_CSRF_DOMAIN = 'harpa-pro:admin-csrf:v1';
const ADMIN_CSRF_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const ADMIN_CSRF_TOKEN_BYTES = 32;

/** Derive a browser-visible CSRF token without exposing the opaque session. */
export function createAdminCsrfToken(sessionToken: string): string {
  return createHmac('sha256', sessionToken).update(ADMIN_CSRF_DOMAIN, 'utf8').digest('base64url');
}

/** Validate only fixed-size base64url candidates, then compare in constant time. */
export function verifyAdminCsrfToken(sessionToken: string, candidate: string | undefined): boolean {
  if (!candidate || !ADMIN_CSRF_TOKEN_RE.test(candidate)) return false;

  const actual = Buffer.from(candidate, 'base64url');
  if (actual.length !== ADMIN_CSRF_TOKEN_BYTES) return false;
  const expected = Buffer.from(createAdminCsrfToken(sessionToken), 'base64url');
  return timingSafeEqual(actual, expected);
}

/** Require the custom token bound to the dedicated HttpOnly admin cookie. */
export function withAdminCsrf(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const sessionToken = readAdminSessionToken(c);
    const candidate = c.req.header(ADMIN_CSRF_HEADER);
    if (!sessionToken || !verifyAdminCsrfToken(sessionToken, candidate)) {
      throw new HTTPException(403, { message: 'Forbidden.' });
    }
    await next();
  };
}
