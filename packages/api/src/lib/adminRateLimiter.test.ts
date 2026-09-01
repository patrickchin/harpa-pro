import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env.js';
import {
  AdminPostgresRateLimiter,
  getAdminRateLimiter,
  resetAdminRateLimiter,
  setAdminRateLimiter,
  startAdminRateLimitGc,
  stopAdminRateLimitGc,
} from './adminRateLimiter.js';
import { MemoryRateLimiter, PostgresRateLimiter } from './rateLimiter.js';

const runtimeEnv = env as typeof env & {
  RATE_LIMIT_BACKEND: 'memory' | 'postgres';
};

let originalBackend: 'memory' | 'postgres';

beforeEach(() => {
  originalBackend = runtimeEnv.RATE_LIMIT_BACKEND;
  runtimeEnv.RATE_LIMIT_BACKEND = 'memory';
  resetAdminRateLimiter();
});

afterEach(() => {
  stopAdminRateLimitGc();
  resetAdminRateLimiter();
  runtimeEnv.RATE_LIMIT_BACKEND = originalBackend;
  vi.useRealTimers();
});

describe('admin rate-limiter default wiring', () => {
  it('keeps bucket-table selection out of the public Postgres limiter instance', () => {
    const limiter = new PostgresRateLimiter({ query: vi.fn() } as unknown as pg.Pool);

    expect(Object.keys(limiter)).not.toContain('bucketTable');
  });

  it('uses a process-local limiter for local and test environments', () => {
    const first = getAdminRateLimiter();
    const second = getAdminRateLimiter();

    expect(first).toBeInstanceOf(MemoryRateLimiter);
    expect(second).toBe(first);
  });

  it('starts one stoppable GC timer for the Postgres backend', async () => {
    vi.useFakeTimers();
    const limiter = new AdminPostgresRateLimiter({ query: vi.fn() } as unknown as pg.Pool);
    const gc = vi.spyOn(limiter, 'gc').mockResolvedValue(0);
    setAdminRateLimiter(limiter);

    startAdminRateLimitGc(1_000);
    startAdminRateLimitGc(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(gc).toHaveBeenCalledOnce();

    stopAdminRateLimitGc();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(gc).toHaveBeenCalledOnce();
  });

  it('specializes the shared Postgres core while targeting the admin bucket table', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ count: 1 }], rowCount: 0 });
    const limiter = new AdminPostgresRateLimiter({ query } as unknown as pg.Pool);

    expect(limiter).toBeInstanceOf(PostgresRateLimiter);

    await limiter.consume('admin-key', 2, 60_000);
    await limiter.gc(Date.UTC(2026, 7, 13, 12, 0, 0));

    expect(query.mock.calls[0]?.[0]).toContain('INSERT INTO admin.rate_limit_buckets');
    expect(query.mock.calls[0]?.[0]).toContain(
      'SET count = admin.rate_limit_buckets.count + 1',
    );
    expect(query.mock.calls[1]?.[0]).toContain('DELETE FROM admin.rate_limit_buckets');
  });
});
