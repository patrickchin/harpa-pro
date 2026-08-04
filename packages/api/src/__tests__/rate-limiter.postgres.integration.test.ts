import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PostgresRateLimiter } from '../lib/rateLimiter.js';
import { startPg, type PgFixture } from './setup-pg.js';

const HOUR_MS = 60 * 60_000;

let fx: PgFixture;
let firstMachinePool: pg.Pool;
let secondMachinePool: pg.Pool;

beforeAll(async () => {
  fx = await startPg();
  firstMachinePool = new pg.Pool({ connectionString: fx.url });
  secondMachinePool = new pg.Pool({ connectionString: fx.url });
}, 120_000);

afterAll(async () => {
  await Promise.all([firstMachinePool?.end(), secondMachinePool?.end()]);
  await fx?.stop();
}, 60_000);

beforeEach(async () => {
  await firstMachinePool.query('TRUNCATE app.rate_limit_buckets');
});

describe('PostgresRateLimiter', () => {
  it('observes errors from both test-created pools', () => {
    expect(firstMachinePool.listenerCount('error')).toBeGreaterThan(0);
    expect(secondMachinePool.listenerCount('error')).toBeGreaterThan(0);
  });

  it('atomically enforces one budget across independent application instances', async () => {
    const firstMachine = new PostgresRateLimiter(firstMachinePool);
    const secondMachine = new PostgresRateLimiter(secondMachinePool);

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        (index % 2 === 0 ? firstMachine : secondMachine).consume(
          'voice:shared-user',
          10,
          HOUR_MS,
        ),
      ),
    );
    const persisted = await firstMachinePool.query<{ count: number }>(
      `SELECT count
       FROM app.rate_limit_buckets
       WHERE bucket_key LIKE 'voice:shared-user|%'`,
    );

    expect(results.filter((result) => result.success)).toHaveLength(10);
    expect(results.filter((result) => !result.success)).toHaveLength(10);
    expect(persisted.rows).toEqual([{ count: 20 }]);
  });

  it('deletes stale buckets while retaining active and recently elapsed windows', async () => {
    const now = Date.UTC(2026, 6, 31, 12, 0, 0);
    await firstMachinePool.query(
      `INSERT INTO app.rate_limit_buckets (bucket_key, window_end, count)
       VALUES
         ('stale', $1, 1),
         ('recently-elapsed', $2, 2),
         ('active', $3, 3)`,
      [
        new Date(now - 60_001),
        new Date(now - 30_000),
        new Date(now + 30_000),
      ],
    );

    const deleted = await new PostgresRateLimiter(firstMachinePool).gc(now);
    const remaining = await firstMachinePool.query<{ bucket_key: string }>(
      `SELECT bucket_key
       FROM app.rate_limit_buckets
       ORDER BY bucket_key`,
    );

    expect(deleted).toBe(1);
    expect(remaining.rows.map((row) => row.bucket_key)).toEqual([
      'active',
      'recently-elapsed',
    ]);
  });
});
