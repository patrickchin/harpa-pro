import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminPostgresRateLimiter,
  resetAdminRateLimiter,
  setAdminRateLimiter,
  startAdminRateLimitGc,
  stopAdminRateLimitGc,
} from './adminRateLimiter.js';
import {
  PostgresIdempotencyStore,
  resetIdempotencyStore,
  setIdempotencyStore,
  startIdempotencyGc,
  stopIdempotencyGc,
} from './idempotencyStore.js';
import {
  PostgresRateLimiter,
  resetRateLimiter,
  setRateLimiter,
  startRateLimitGc,
  stopRateLimitGc,
} from './rateLimiter.js';

const DAY_MS = 24 * 60 * 60_000;

afterEach(() => {
  stopAdminRateLimitGc();
  stopIdempotencyGc();
  stopRateLimitGc();
  resetAdminRateLimiter();
  resetIdempotencyStore();
  resetRateLimiter();
  vi.useRealTimers();
});

describe('low-traffic database maintenance cadence', () => {
  it.each([
    {
      name: 'application rate-limit buckets',
      start(query: ReturnType<typeof vi.fn>) {
        setRateLimiter(new PostgresRateLimiter({ query } as unknown as pg.Pool));
        startRateLimitGc();
      },
    },
    {
      name: 'admin rate-limit buckets',
      start(query: ReturnType<typeof vi.fn>) {
        setAdminRateLimiter(new AdminPostgresRateLimiter({ query } as unknown as pg.Pool));
        startAdminRateLimitGc();
      },
    },
    {
      name: 'idempotency keys',
      start(query: ReturnType<typeof vi.fn>) {
        setIdempotencyStore(new PostgresIdempotencyStore({ query } as unknown as pg.Pool));
        startIdempotencyGc();
      },
    },
  ])('waits one day before pruning $name', async ({ start }) => {
    vi.useFakeTimers();
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    start(query);

    await vi.advanceTimersByTimeAsync(DAY_MS - 1);
    expect(query).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(query).toHaveBeenCalledOnce();
  });
});
