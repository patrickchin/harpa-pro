/**
 * withRateLimit({ name, limit, windowMs, keyBy? }) — per-route rate
 * limiter. Increments the counter on every call (including 4xx and 5xx,
 * per arch-api-design.md to avoid abuse via auto-retry).
 *
 * Keying strategies (`keyBy`):
 *   - 'user'  (default) — `${name}:user:${userId ?? 'anon'}`.
 *     Requires a prior `withAuth()` mount; missing `userId` raises a 401
 *     (treated as a bug-shaped caller — see arch-rate-limiting.md §3.2).
 *   - 'ip'             — `${name}:ip:${clientIp(c)}` for unauthed routes.
 *   - 'phone'          — `${name}:phone:${phone}` for OTP-shaped routes.
 *                        Missing phone (e.g. invalid body) is keyed as
 *                        `${name}:phone:unknown` so the bucket still bites.
 *   - (c) => string    — escape hatch for composite keys.
 *
 * On limit exceeded: 429 with `{error:{code:'rate_limited', message},
 * requestId}` envelope and `Retry-After` + `X-RateLimit-*` headers.
 * Bypasses the global errorMapper to keep the rate-limit headers attached.
 *
 * Multiple `withRateLimit` middlewares can be chained on the same route
 * (e.g. per-IP + per-phone for OTP). All must pass; the first to reject
 * short-circuits.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../app.js';
import { getRateLimiter, type RateLimiterResult } from '../lib/rateLimiter.js';
import { clientIp, phoneOf } from '../lib/clientIp.js';

export type RateLimitKeyBy =
  | 'user'
  | 'ip'
  | 'phone'
  | ((c: Context<AppEnv>) => string | Promise<string>);

export interface RateLimitOptions {
  /** Logical route name; combined with the resolved key to form the bucket. */
  name: string;
  /** Max requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** How to extract the per-request bucket key. Defaults to 'user'. */
  keyBy?: RateLimitKeyBy;
}

async function resolveKey(
  c: Context<AppEnv>,
  name: string,
  keyBy: RateLimitKeyBy,
): Promise<string> {
  if (typeof keyBy === 'function') {
    return `${name}:fn:${await keyBy(c)}`;
  }
  if (keyBy === 'user') {
    const userId = c.get('userId');
    if (!userId) {
      // keyBy:'user' without a prior withAuth() — this is a wiring bug.
      // 401 is the right answer for the user (they can't auth anyway)
      // and an obvious signal to the developer.
      throw new HTTPException(401, { message: 'Authentication required.' });
    }
    return `${name}:user:${userId}`;
  }
  if (keyBy === 'ip') {
    return `${name}:ip:${clientIp(c)}`;
  }
  // 'phone'
  const phone = await phoneOf(c);
  return `${name}:phone:${phone ?? 'unknown'}`;
}

function attachHeaders(c: Context<AppEnv>, r: RateLimiterResult): void {
  c.header('X-RateLimit-Limit', String(r.limit));
  c.header('X-RateLimit-Remaining', String(r.remaining));
  c.header('X-RateLimit-Reset', String(Math.ceil(r.reset / 1000)));
}

function rejectJson(c: Context<AppEnv>, r: RateLimiterResult) {
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

export function withRateLimit(opts: RateLimitOptions): MiddlewareHandler<AppEnv> {
  const keyBy: RateLimitKeyBy = opts.keyBy ?? 'user';
  return async (c, next) => {
    // E2E/test seam: when DISABLE_RATE_LIMIT=1 the middleware is a no-op.
    // This is gated by an env var (defaulted off) so it cannot accidentally
    // ship in production builds — see packages/api/src/env.ts.
    if (process.env.DISABLE_RATE_LIMIT === '1') {
      await next();
      return;
    }
    const key = await resolveKey(c, opts.name, keyBy);
    const r = await getRateLimiter().consume(key, opts.limit, opts.windowMs);
    attachHeaders(c, r);
    if (!r.success) return rejectJson(c, r);
    await next();
  };
}
