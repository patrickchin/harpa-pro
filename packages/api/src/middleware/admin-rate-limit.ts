import { isIP } from 'node:net';
import type { Context } from 'hono';
import type { AppEnv } from '../app.js';
import { env } from '../env.js';
import { getAdminRateLimiter } from '../lib/adminRateLimiter.js';
import { clientIp } from '../lib/clientIp.js';
import { withRateLimit } from './rateLimit.js';

const MINUTE_MS = 60_000;

/**
 * Fly overwrites Fly-Client-IP at its trusted edge. In deployed mode, never
 * fall back to caller-controlled forwarding headers when that metadata is
 * absent; one shared `unknown` bucket fails closed. Local/test requests keep
 * the general helper's CF/XFF fallbacks.
 */
export function adminClientIp(c: Context<AppEnv>): string {
  const flyIp = c.req.header('fly-client-ip')?.trim();
  if (flyIp && isIP(flyIp) !== 0) return flyIp;
  return env.NODE_ENV === 'production' ? 'unknown' : clientIp(c);
}

/**
 * Shared pre-authentication gate for routes that may query the isolated admin
 * database. Route-specific authenticated budgets remain additive.
 */
export const adminAuthIpWindow = withRateLimit({
  name: 'admin.auth.ip.1m',
  keyBy: adminClientIp,
  limit: 120,
  windowMs: MINUTE_MS,
  getLimiter: getAdminRateLimiter,
});
