/**
 * Global catch-all rate limiter. Mounted in `createApp()` after the
 * per-route auth middleware has had a chance to populate `userId`.
 *
 * Defaults (arch-rate-limiting.md §3.3):
 *   - 600/min per user (when authed)
 *   - 120/min per IP (when unauthed)
 *
 * Routes that should be exempt — fast-path health probes and any
 * future special endpoint — are listed in `SKIP_PREFIXES`. The match
 * is prefix-based to keep this O(1) and avoid pulling a router in.
 */
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app.js';
import { getRateLimiter, type RateLimiterResult } from '../lib/rateLimiter.js';
import { clientIp } from '../lib/clientIp.js';
import { verifyJwt } from '../auth/jwt.js';

const MIN = 60_000;
const USER_LIMIT = 600;
const IP_LIMIT = 120;

const SKIP_PREFIXES: readonly string[] = [
  '/healthz',
  '/readyz',
  '/openapi.json',
  // Apple swcd and Android PackageManager fetch universal-link manifests
  // automatically (e.g. on every app install). They hit from many IPs and
  // don't carry auth headers — exempt to avoid spurious 429s that would
  // silently break deep-link verification.
  '/.well-known/',
];

function attachHeaders(c: Parameters<MiddlewareHandler<AppEnv>>[0], r: RateLimiterResult): void {
  c.header('X-RateLimit-Limit', String(r.limit));
  c.header('X-RateLimit-Remaining', String(r.remaining));
  c.header('X-RateLimit-Reset', String(Math.ceil(r.reset / 1000)));
}

/**
 * Non-throwing JWT peek. Returns the userId if the Authorization header
 * carries a valid bearer token; null otherwise. Used so the global
 * rate limiter can pick the right keying strategy (per-user vs per-IP)
 * BEFORE the route-level `withAuth()` runs. `withAuth()` does its own
 * verify + sets the scoped DB accessor — this peek does NOT.
 */
async function peekUserId(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  try {
    const claims = await verifyJwt(token);
    return claims.sub;
  } catch {
    return null;
  }
}

export function globalRateLimit(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const path = c.req.path;
    for (const p of SKIP_PREFIXES) {
      if (path === p || path.startsWith(`${p}/`)) {
        await next();
        return;
      }
    }

    const userId = c.get('userId') ?? (await peekUserId(c.req.header('authorization')));
    const limiter = getRateLimiter();
    const r = userId
      ? await limiter.consume(`global:user:${userId}`, USER_LIMIT, MIN)
      : await limiter.consume(`global:ip:${clientIp(c)}`, IP_LIMIT, MIN);

    if (!r.success) {
      const retryAfter = Math.max(1, Math.ceil((r.reset - Date.now()) / 1000));
      const requestId = c.get('requestId');
      return c.json(
        {
          error: { code: 'rate_limited', message: 'Rate limit exceeded.' },
          requestId,
        },
        429,
        {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(r.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(r.reset / 1000)),
        },
      );
    }
    attachHeaders(c, r);
    await next();
  };
}
