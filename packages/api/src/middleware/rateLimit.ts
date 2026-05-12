/**
 * withRateLimit({ name, limit, windowMs }) — per-route, per-user fixed-
 * window rate limiter. Increments the counter on every call (including
 * 4xx and 5xx, per arch-api-design.md to avoid abuse via auto-retry).
 *
 * Key shape: `${name}:${userId ?? 'anon'}`. Routes that mount this MUST
 * also mount withAuth() first; otherwise all unauthed traffic shares the
 * same `anon` bucket which is a DoS vector. The middleware itself
 * tolerates the missing userId for defence-in-depth.
 *
 * On limit exceeded: 429 with `{error:{code:'rate_limited', message},
 * requestId}` envelope and a `Retry-After` header (seconds). Bypasses
 * the global errorMapper to keep the rate-limit headers attached.
 */
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app.js';
import { getRateLimiter } from '../lib/rateLimiter.js';

export interface RateLimitOptions {
  /** Logical route name; combined with userId to form the bucket key. */
  name: string;
  /** Max requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export function withRateLimit(opts: RateLimitOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = c.get('userId') ?? 'anon';
    const key = `${opts.name}:${userId}`;
    const r = await getRateLimiter().consume(key, opts.limit, opts.windowMs);

    c.header('X-RateLimit-Limit', String(r.limit));
    c.header('X-RateLimit-Remaining', String(r.remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(r.reset / 1000)));

    if (!r.success) {
      const retryAfter = Math.max(1, Math.ceil((r.reset - Date.now()) / 1000));
      const requestId = c.get('requestId');
      return c.json(
        {
          error: {
            code: 'rate_limited',
            message: 'Rate limit exceeded.',
          },
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
    await next();
  };
}
