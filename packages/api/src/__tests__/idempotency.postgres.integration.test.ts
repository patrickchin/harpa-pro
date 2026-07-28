import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { env } from '../env.js';
import {
  getIdempotencyStore,
  PostgresIdempotencyStore,
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
  IDEMPOTENCY_BACKEND: 'memory' | 'postgres';
};

let fx: PgFixture;
let originalBackend: 'memory' | 'postgres';

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
  runtimeEnv.IDEMPOTENCY_BACKEND = originalBackend;
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

  it('reclaims an expired lease left by a crashed machine', async () => {
    const key = 'abandoned-scope-key';
    const keyHash = createHash('sha256').update(key, 'utf8').digest('hex');
    const admin = new pg.Client({ connectionString: fx.url });
    await admin.connect();
    try {
      await admin.query(
        `INSERT INTO app.idempotency_keys
           (key_hash, state, owner_token, lease_expires_at, expires_at)
         VALUES ($1, 'pending', 'dead-machine', now() - interval '1 second',
                 now() + interval '1 hour')`,
        [keyHash],
      );
    } finally {
      await admin.end();
    }

    const store = getIdempotencyStore() as AtomicIdempotencyStore;
    let sideEffects = 0;
    const result = await store.getOrExecute(key, 60_000, async () => {
      sideEffects += 1;
      return {
        status: 200,
        body: '{"recovered":true}',
        contentType: 'application/json',
      };
    });

    expect(sideEffects).toBe(1);
    expect(result.replay).toBe(false);
    expect(result.value?.body).toBe('{"recovered":true}');
  });

  it('releases a failed claim so another machine can retry', async () => {
    const firstMachine = getIdempotencyStore() as AtomicIdempotencyStore;
    await expect(
      firstMachine.getOrExecute('failed-scope-key', 60_000, async () => {
        throw new Error('producer failed');
      }),
    ).rejects.toThrow('producer failed');

    resetIdempotencyStore();
    const secondMachine = getIdempotencyStore() as AtomicIdempotencyStore;
    const retried = await secondMachine.getOrExecute('failed-scope-key', 60_000, async () => ({
      status: 200,
      body: '{"retried":true}',
      contentType: 'application/json',
    }));

    expect(retried.replay).toBe(false);
    expect(retried.value?.body).toBe('{"retried":true}');
  });

  it('fails the owner when its lease heartbeat cannot renew', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const store = new PostgresIdempotencyStore(getPool(fx.url));
    const renewal = vi
      .spyOn(
        store as unknown as {
          renewLease(keyHash: string, ownerToken: string): Promise<void>;
        },
        'renewLease',
      )
      .mockRejectedValueOnce(new Error('database partition'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    let finishProducer!: () => void;
    const producerFinished = new Promise<void>((resolve) => {
      finishProducer = resolve;
    });
    let producerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      producerStarted = resolve;
    });

    try {
      const execution = store.getOrExecute('heartbeat-failure-key', 60_000, async () => {
        producerStarted();
        await producerFinished;
        return {
          status: 200,
          body: '{"shouldNotReplay":true}',
          contentType: 'application/json',
        };
      });

      await started;
      await vi.advanceTimersByTimeAsync(10_000);
      finishProducer();

      await expect(execution).rejects.toMatchObject({
        name: 'IdempotencyLeaseLostError',
        message: 'Idempotency lease renewal failed.',
        cause: expect.objectContaining({ message: 'database partition' }),
      });
      expect(renewal).toHaveBeenCalledOnce();
      expect(await store.get('heartbeat-failure-key')).toBeNull();
    } finally {
      warning.mockRestore();
      vi.useRealTimers();
    }
  });

  it('reports a reclaimed lease instead of masking it with a producer failure', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const store = new PostgresIdempotencyStore(getPool(fx.url));
    const renewal = vi.spyOn(
      store as unknown as {
        renewLease(keyHash: string, ownerToken: string): Promise<void>;
      },
      'renewLease',
    );
    const key = 'reclaimed-live-owner-key';
    const keyHash = createHash('sha256').update(key, 'utf8').digest('hex');

    let failProducer!: (error: Error) => void;
    const producerFinished = new Promise<void>((_resolve, reject) => {
      failProducer = reject;
    });
    let producerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      producerStarted = resolve;
    });

    const admin = new pg.Client({ connectionString: fx.url });
    await admin.connect();
    try {
      const execution = store.getOrExecute(key, 60_000, async () => {
        producerStarted();
        await producerFinished;
        return {
          status: 200,
          body: '{"unreachable":true}',
          contentType: 'application/json',
        };
      });

      await started;
      await admin.query(
        `UPDATE app.idempotency_keys
         SET owner_token = 'replacement-owner',
             lease_expires_at = now() + interval '1 minute'
         WHERE key_hash = $1`,
        [keyHash],
      );
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.waitFor(() => expect(renewal).toHaveBeenCalledOnce());
      await (renewal.mock.results[0]!.value as Promise<void>).catch(() => undefined);
      failProducer(new Error('producer failed'));

      await expect(execution).rejects.toMatchObject({
        name: 'IdempotencyLeaseLostError',
        message: 'Idempotency lease ownership was lost during renewal.',
      });

      const row = await admin.query<{ owner_token: string }>(
        `SELECT owner_token
         FROM app.idempotency_keys
         WHERE key_hash = $1`,
        [keyHash],
      );
      expect(row.rows[0]?.owner_token).toBe('replacement-owner');
    } finally {
      await admin.end();
      vi.useRealTimers();
    }
  });
});
