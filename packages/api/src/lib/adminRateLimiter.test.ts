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
import { MemoryRateLimiter } from './rateLimiter.js';

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
});
