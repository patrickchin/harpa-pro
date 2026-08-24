import pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../telemetry/sentry.js', () => ({
  captureApiException: vi.fn(),
}));

import { captureApiException } from '../telemetry/sentry.js';
import { createObservedPool } from './pool.js';

const pools: pg.Pool[] = [];

function makePool(options?: { connectionTimeoutMillis: number }): pg.Pool {
  const pool = createObservedPool({
    connectionString: 'postgresql://user:pw@127.0.0.1:1/db?sslmode=disable',
    max: options ? 5 : 10,
    ...(options ?? {}),
    idleErrorContext: {
      requestId: options ? 'admin-pool-idle' : 'pool-idle',
      route: options ? 'pg.admin-pool.idle-client' : 'pg.pool.idle-client',
    },
  });
  pools.push(pool);
  return pool;
}

describe('createObservedPool', () => {
  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
    vi.mocked(captureApiException).mockReset();
  });

  it('keeps the application profile free of a connection deadline', () => {
    const pool = makePool();

    expect(pool.options).toMatchObject({
      connectionString: 'postgresql://user:pw@127.0.0.1:1/db',
      max: 10,
      statement_timeout: 5_000,
      ssl: false,
    });
    expect(pool.options).not.toHaveProperty('connectionTimeoutMillis');
  });

  it('applies the admin connection deadline without changing shared defaults', () => {
    const pool = makePool({ connectionTimeoutMillis: 5_000 });

    expect(pool.options).toMatchObject({
      max: 5,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 5_000,
    });
  });

  it('reports idle-client errors with the caller profile context', () => {
    const pool = makePool({ connectionTimeoutMillis: 5_000 });
    const error = Object.assign(new Error('read ETIMEDOUT'), { code: 'ETIMEDOUT' });

    expect(() => pool.emit('error', error, {} as pg.PoolClient)).not.toThrow();
    expect(captureApiException).toHaveBeenCalledOnce();
    expect(captureApiException).toHaveBeenCalledWith(error, {
      requestId: 'admin-pool-idle',
      method: 'DB',
      route: 'pg.admin-pool.idle-client',
      status: 0,
    });
  });
});
