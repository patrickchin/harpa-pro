/**
 * Rate-limiter abstraction. The middleware in middleware/rateLimit.ts
 * goes through getRateLimiter(); tests inject a fresh instance via
 * resetRateLimiter() in beforeEach so per-route counters don't leak
 * between cases.
 *
 * The default implementation is in-memory + per-process. That's fine for
 * tests, dev, and a single Fly.io machine. Multi-machine production
 * deployments will swap in an UpstashRateLimiter (TODO) implementing
 * the same interface backed by @upstash/redis. See the carve-out note in
 * docs/v4/plan-p1-api-core.md §P1.9.
 *
 * Window semantics: fixed window keyed on (key, floor(now/windowMs)). The
 * window resets all at once at the boundary; this is the simplest backend
 * to reason about and matches the per-route budgets in arch-api-design.md
 * (60 RPM shared budgets are enforced per-user, per-window).
 */

export interface RateLimiterResult {
  /** True if the request is within budget (was just consumed). */
  success: boolean;
  /** Total budget for this key in the current window. */
  limit: number;
  /** Remaining budget after this consume call (>= 0). */
  remaining: number;
  /** Epoch ms at which the current window resets. */
  reset: number;
}

export interface RateLimiter {
  /**
   * Atomically increments the counter for `key` and returns whether the
   * request is within `limit` per `windowMs`. Always returns success=false
   * when the limit is already exceeded; the caller decides what to do.
   */
  consume(key: string, limit: number, windowMs: number): Promise<RateLimiterResult>;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimiterResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    const bucketKey = `${key}|${windowStart}`;
    let b = this.buckets.get(bucketKey);
    if (!b) {
      // Drop any stale buckets for this key (cheap GC, bounded by callers).
      for (const [k] of this.buckets) {
        if (k.startsWith(`${key}|`) && k !== bucketKey) this.buckets.delete(k);
      }
      b = { count: 0, resetAt };
      this.buckets.set(bucketKey, b);
    }
    b.count += 1;
    const remaining = Math.max(0, limit - b.count);
    return { success: b.count <= limit, limit, remaining, reset: resetAt };
  }
}

let _instance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!_instance) _instance = new MemoryRateLimiter();
  return _instance;
}

export function setRateLimiter(r: RateLimiter): void {
  _instance = r;
}

export function resetRateLimiter(): void {
  _instance = null;
}
