/**
 * Rate-limiter abstraction. The middleware in middleware/rateLimit.ts
 * goes through getRateLimiter(); tests inject a fresh instance via
 * resetRateLimiter() in beforeEach so per-route counters don't leak
 * between cases.
 *
 * Two implementations:
 *   - `MemoryRateLimiter`  — per-process, dev/test default.
 *   - `PostgresRateLimiter` — atomic, cross-machine. Backed by
 *     `app.rate_limit_buckets` (migration 0006). Selected automatically
 *     in production (or when `RATE_LIMIT_BACKEND=postgres`).
 *
 * Backend selection reads the *parsed* `env` const, NEVER `process.env`
 * directly — Pitfall 13 (sub-pattern "pickStorage()"). The lint guard
 * `scripts/check-no-process-env-rate-limit.sh` enforces this.
 *
 * Window semantics: fixed window keyed on (key, floor(now/windowMs)).
 * The window resets all at once at the boundary; this is the simplest
 * backend to reason about and matches the per-route budgets in
 * arch-api-design.md.
 */
import type pg from 'pg';
import { env } from '../env.js';
import { getPool } from '../db/client.js';

const APP_RATE_LIMIT_BUCKET_TABLE = 'app.rate_limit_buckets';
const ADMIN_RATE_LIMIT_BUCKET_TABLE = 'admin.rate_limit_buckets';

const RATE_LIMIT_BUCKET_TABLES = {
  app: APP_RATE_LIMIT_BUCKET_TABLE,
  admin: ADMIN_RATE_LIMIT_BUCKET_TABLE,
} as const;

type RateLimitBucketStore = keyof typeof RATE_LIMIT_BUCKET_TABLES;

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

/**
 * Cross-machine rate limiter backed by `app.rate_limit_buckets`.
 *
 * One round-trip per consume:
 *
 *   INSERT INTO app.rate_limit_buckets (bucket_key, window_end, count)
 *   VALUES ($1, to_timestamp($2/1000.0), 1)
 *   ON CONFLICT (bucket_key) DO UPDATE
 *     SET count = app.rate_limit_buckets.count + 1
 *   RETURNING count;
 *
 * The `bucket_key` embeds the window-start epoch so a fresh window
 * always lands on a new row. A periodic GC sweeps stale rows
 * (see `startRateLimitGc`).
 */
export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly pool: pg.Pool) {}

  /** Fixed store selector for the internal SQL core; subclasses cannot inject identifiers. */
  protected get bucketStore(): RateLimitBucketStore {
    return 'app';
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimiterResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    const bucketKey = `${key}|${windowStart}`;
    const bucketTable = RATE_LIMIT_BUCKET_TABLES[this.bucketStore];
    const { rows } = await this.pool.query<{ count: number }>(
      `INSERT INTO ${bucketTable} (bucket_key, window_end, count)
       VALUES ($1, to_timestamp($2 / 1000.0), 1)
       ON CONFLICT (bucket_key) DO UPDATE
         SET count = ${bucketTable}.count + 1
       RETURNING count`,
      [bucketKey, resetAt],
    );
    const count = rows[0]?.count ?? 1;
    const remaining = Math.max(0, limit - count);
    return { success: count <= limit, limit, remaining, reset: resetAt };
  }

  /** Delete rows whose window has fully elapsed. Safe to call from any machine. */
  async gc(now: number = Date.now()): Promise<number> {
    const cutoff = new Date(now - 60_000).toISOString();
    const bucketTable = RATE_LIMIT_BUCKET_TABLES[this.bucketStore];
    const { rowCount } = await this.pool.query(`DELETE FROM ${bucketTable} WHERE window_end < $1`, [
      cutoff,
    ]);
    return rowCount ?? 0;
  }
}

let _instance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (_instance) return _instance;
  if (env.RATE_LIMIT_BACKEND === 'postgres') {
    _instance = new PostgresRateLimiter(getPool());
  } else {
    _instance = new MemoryRateLimiter();
  }
  return _instance;
}

export function setRateLimiter(r: RateLimiter): void {
  _instance = r;
}

export function resetRateLimiter(): void {
  _instance = null;
}

let _gcTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start a periodic GC sweep (every `intervalMs`, default 10 min) when
 * the active limiter is a PostgresRateLimiter. No-op for memory mode.
 * Idempotent: calling twice does not double-schedule. Exposed so the
 * server entry can start it after the pool is initialised.
 */
export function startRateLimitGc(intervalMs = 10 * 60_000): void {
  if (_gcTimer) return;
  const inst = getRateLimiter();
  if (!(inst instanceof PostgresRateLimiter)) return;
  _gcTimer = setInterval(() => {
    inst.gc().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[rate-limit] gc failed:', err);
    });
  }, intervalMs);
  // Don't keep the event loop alive solely for GC.
  if (typeof _gcTimer.unref === 'function') _gcTimer.unref();
}

export function stopRateLimitGc(): void {
  if (_gcTimer) {
    clearInterval(_gcTimer);
    _gcTimer = null;
  }
}
