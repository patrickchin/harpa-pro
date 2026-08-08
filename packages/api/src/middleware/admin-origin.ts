import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../app.js';
import { env } from '../env.js';
import { adminClientIp } from './admin-rate-limit.js';

const trustedAdminOrigins = new Set(
  env.ADMIN_CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

/** Require an exact configured browser-admin Origin on state-changing routes. */
export function withTrustedAdminOrigin(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const origin = c.req.header('origin');
    if (!origin || !trustedAdminOrigins.has(origin)) {
      console.info(
        '[admin-auth]',
        JSON.stringify({
          requestId: c.get('requestId'),
          ip: adminClientIp(c).slice(0, 128),
          outcome: 'origin_rejected',
        }),
      );
      throw new HTTPException(403, { message: 'Forbidden.' });
    }
    await next();
  };
}
