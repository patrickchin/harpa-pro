import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { env } from '../env.js';
import {
  getIdempotencyStore,
  resetIdempotencyStore,
  type CachedResponse,
  type IdempotencyStore,
} from '../lib/idempotencyStore.js';
import { getPool, resetPool } from '../db/client.js';
import { startPg, type PgFixture } from './setup-pg.js';

type AtomicIdempotencyStore = IdempotencyStore & {
  getOrExecute(
    key: string,
    ttlMs: number,
    producer: () => Promise<CachedResponse | null>,
  ): Promise<{ value: CachedResponse | null; replay: boolean }>;
};

const runtimeEnv = env as typeof env & {
  IDEMPOTENCY_BACKEND?: 'memory' | 'postgres';
};

let fx: PgFixture;
let originalBackend: 'memory' | 'postgres' | undefined;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  originalBackend = runtimeEnv.IDEMPOTENCY_BACKEND;
  runtimeEnv.IDEMPOTENCY_BACKEND = 'postgres';
}, 120_000);

afterAll(async () => {
  resetIdempotencyStore();
  if (originalBackend === undefined) {
    delete runtimeEnv.IDEMPOTENCY_BACKEND;
  } else {
    runtimeEnv.IDEMPOTENCY_BACKEND = originalBackend;
  }
  await fx?.stop();
}, 60_000);

beforeEach(() => {
  resetIdempotencyStore();
});

describe('Postgres idempotency store', () => {
  it('has durable response and lease columns for cross-machine claims', async () => {
    const client = new pg.Client({ connectionString: fx.url });
    await client.connect();
    try {
      const result = await client.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'app'
           AND table_name = 'idempotency_keys'
         ORDER BY ordinal_position`,
      );

      expect(result.rows.map((row) => row.column_name)).toEqual([
        'key_hash',
        'state',
        'owner_token',
        'lease_expires_at',
        'status',
        'response_body',
        'content_type',
        'expires_at',
        'created_at',
        'updated_at',
      ]);
    } finally {
      await client.end();
    }
  });

  it('is selected by default wiring and shares completed responses across instances', async () => {
    const firstMachine = getIdempotencyStore();
    expect(firstMachine.constructor.name).toBe('PostgresIdempotencyStore');
    await firstMachine.put(
      'scope-key',
      { status: 201, body: '{"ok":true}', contentType: 'application/json' },
      60_000,
    );

    resetIdempotencyStore();
    const secondMachine = getIdempotencyStore();
    expect(secondMachine.constructor.name).toBe('PostgresIdempotencyStore');
    expect(await secondMachine.get('scope-key')).toEqual({
      status: 201,
      body: '{"ok":true}',
      contentType: 'application/json',
    });
  });

  it('elects one producer across machines and replays its response to the waiter', async () => {
    const firstMachine = getIdempotencyStore() as AtomicIdempotencyStore;
    resetIdempotencyStore();
    const secondMachine = getIdempotencyStore() as AtomicIdempotencyStore;
    expect(typeof firstMachine.getOrExecute).toBe('function');
    expect(typeof secondMachine.getOrExecute).toBe('function');

    let sideEffects = 0;
    const producer = async (): Promise<CachedResponse> => {
      sideEffects += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        status: 200,
        body: JSON.stringify({ sideEffects }),
        contentType: 'application/json',
      };
    };

    const [first, second] = await Promise.all([
      firstMachine.getOrExecute('concurrent-scope-key', 60_000, producer),
      secondMachine.getOrExecute('concurrent-scope-key', 60_000, producer),
    ]);

    expect(sideEffects).toBe(1);
    expect([first.replay, second.replay].sort()).toEqual([false, true]);
    expect(first.value).toEqual(second.value);
  });
});
