/**
 * Rate limiter for the dedicated admin browser surface.
 *
 * Local and test processes use memory. Deployed environments set the parsed
 * RATE_LIMIT_BACKEND to `postgres`, which stores counters in the physically
 * separate admin database reached through ADMIN_DATABASE_URL.
 */
import { getAdminPool } from '../db/admin-client.js';
import { env } from '../env.js';
import { LOW_TRAFFIC_MAINTENANCE_INTERVAL_MS } from './background-maintenance.js';
import { MemoryRateLimiter, PostgresRateLimiter, type RateLimiter } from './rateLimiter.js';

export class AdminPostgresRateLimiter extends PostgresRateLimiter {
  protected override get bucketStore(): 'admin' {
    return 'admin';
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
