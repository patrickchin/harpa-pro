/**
 * Rate limiter for the dedicated admin browser surface.
 *
 * Local and test processes use memory. Deployed environments set the parsed
 * RATE_LIMIT_BACKEND to `postgres`, which stores counters in the physically
 * separate admin database reached through ADMIN_DATABASE_URL.
 */
import type pg from 'pg';
import { getAdminPool } from '../db/admin-client.js';
import { env } from '../env.js';
import { LOW_TRAFFIC_MAINTENANCE_INTERVAL_MS } from './background-maintenance.js';
import { MemoryRateLimiter, type RateLimiter, type RateLimiterResult } from './rateLimiter.js';

export class AdminPostgresRateLimiter implements RateLimiter {
  constructor(private readonly pool: pg.Pool) {}

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimiterResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    const bucketKey = `${key}|${windowStart}`;
    const { rows } = await this.pool.query<{ count: number }>(
      `INSERT INTO admin.rate_limit_buckets (bucket_key, window_end, count)
       VALUES ($1, to_timestamp($2 / 1000.0), 1)
       ON CONFLICT (bucket_key) DO UPDATE
         SET count = admin.rate_limit_buckets.count + 1
       RETURNING count`,
      [bucketKey, resetAt],
    );
    const count = rows[0]?.count ?? 1;
    return {
      success: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      reset: resetAt,
    };
  }

  /** Delete buckets after their complete fixed window has elapsed. */
  async gc(now: number = Date.now()): Promise<number> {
    const cutoff = new Date(now - 60_000).toISOString();
    const { rowCount } = await this.pool.query(
      `DELETE FROM admin.rate_limit_buckets WHERE window_end < $1`,
      [cutoff],
    );
    return rowCount ?? 0;
  }
}

let instance: RateLimiter | null = null;

export function getAdminRateLimiter(): RateLimiter {
  if (instance) return instance;
  instance =
    env.RATE_LIMIT_BACKEND === 'postgres'
      ? new AdminPostgresRateLimiter(getAdminPool())
      : new MemoryRateLimiter();
  return instance;
}

/** Test seam for focused route-limit assertions. */
export function setAdminRateLimiter(limiter: RateLimiter): void {
  instance = limiter;
}

export function resetAdminRateLimiter(): void {
  instance = null;
}

let gcTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start one background sweep for expired distributed buckets.
 *
 * Memory mode needs no sweep. The timer is unref'd so it cannot keep a
 * process alive during shutdown.
 */
export function startAdminRateLimitGc(intervalMs = LOW_TRAFFIC_MAINTENANCE_INTERVAL_MS): void {
  if (gcTimer) return;
  const limiter = getAdminRateLimiter();
  if (!(limiter instanceof AdminPostgresRateLimiter)) return;
  gcTimer = setInterval(() => {
    limiter.gc().catch((error) => {
      console.warn('[admin-rate-limit] gc failed:', error);
    });
  }, intervalMs);
  if (typeof gcTimer.unref === 'function') gcTimer.unref();
}

export function stopAdminRateLimitGc(): void {
  if (!gcTimer) return;
  clearInterval(gcTimer);
  gcTimer = null;
}
