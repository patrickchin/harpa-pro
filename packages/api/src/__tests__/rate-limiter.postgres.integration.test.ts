import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PostgresRateLimiter } from '../lib/rateLimiter.js';
import { startPg, type PgFixture } from './setup-pg.js';

const HOUR_MS = 60 * 60_000;

let fx: PgFixture;
let firstMachinePool: pg.Pool;
let secondMachinePool: pg.Pool;
let tearingDown = false;

type PoolError = Error & { code?: string };
type PoolSource = 'first-machine' | 'second-machine';

function isExpectedTeardownError(error: PoolError, duringTeardown: boolean) {
  return duringTeardown && error.code === '57P01';
}

function observePoolErrors(pool: pg.Pool, source: PoolSource) {
  pool.on('error', (error) => {
    const poolError = error as PoolError;
    if (isExpectedTeardownError(poolError, tearingDown)) return;
    throw Object.assign(new Error(`[${source}] unexpected test pool error: ${poolError.message}`), {
      cause: poolError,
      code: poolError.code,
    });
  });
}

async function endPoolAfterClientRemoval(pool: pg.Pool | undefined): Promise<void> {
  if (!pool) return;

  const expectedRemovals = pool.totalCount;
  if (expectedRemovals === 0) {
    await pool.end();
    return;
  }

  const clientsRemoved = new Promise<void>((resolve) => {
    let removals = 0;
    const onRemove = () => {
      removals += 1;
      if (removals === expectedRemovals) {
        pool.removeListener('remove', onRemove);
        resolve();
      }
    };
    pool.on('remove', onRemove);
  });

  await Promise.all([pool.end(), clientsRemoved]);
}

beforeAll(async () => {
  tearingDown = false;
  fx = await startPg();
  firstMachinePool = new pg.Pool({ connectionString: fx.url });
  secondMachinePool = new pg.Pool({ connectionString: fx.url });
  observePoolErrors(firstMachinePool, 'first-machine');
  observePoolErrors(secondMachinePool, 'second-machine');
}, 120_000);

afterAll(async () => {
  tearingDown = true;
  await Promise.all([
    endPoolAfterClientRemoval(firstMachinePool),
    endPoolAfterClientRemoval(secondMachinePool),
  ]);
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

  it('only tolerates administrator shutdown after teardown begins', () => {
    const administratorShutdown = Object.assign(
      new Error('terminating connection due to administrator command'),
      { code: '57P01' },
    );
    const connectionReset = Object.assign(new Error('read ECONNRESET'), {
      code: 'ECONNRESET',
    });

    expect(isExpectedTeardownError(administratorShutdown, false)).toBe(false);
    expect(isExpectedTeardownError(administratorShutdown, true)).toBe(true);
    expect(isExpectedTeardownError(connectionReset, true)).toBe(false);
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
