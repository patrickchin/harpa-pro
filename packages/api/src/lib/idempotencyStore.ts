/**
 * Idempotency-Key response storage.
 *
 * `MemoryIdempotencyStore` is the dev/test implementation. It caches
 * completed responses and coalesces concurrent requests in one process.
 *
 * `PostgresIdempotencyStore` is the production implementation. It uses
 * short, renewable leases in `app.idempotency_keys` so one API machine
 * runs the producer while it retains the lease, and waiters replay its
 * durable response. No connection or transaction is held during the
 * producer's AI call.
 */
import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getPool } from '../db/client.js';
import { env } from '../env.js';
import { LOW_TRAFFIC_MAINTENANCE_INTERVAL_MS } from './background-maintenance.js';

export interface CachedResponse {
  status: number;
  body: string;
  contentType: string;
}

export interface IdempotencyExecution {
  value: CachedResponse | null;
  replay: boolean;
}

export interface IdempotencyStore {
  get(key: string): Promise<CachedResponse | null>;
  put(key: string, value: CachedResponse, ttlMs: number): Promise<void>;
  /**
   * Return a cached response, wait for another owner, or atomically
   * become the producer. `null` means the producer returned a 5xx and
   * deliberately released the key instead of caching it.
   */
  getOrExecute(
    key: string,
    ttlMs: number,
    producer: () => Promise<CachedResponse | null>,
  ): Promise<IdempotencyExecution>;
}

interface Entry extends CachedResponse {
  expiresAt: number;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, Entry>();
  private readonly inFlight = new Map<string, Promise<CachedResponse | null>>();

  async get(key: string): Promise<CachedResponse | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return {
      status: entry.status,
      body: entry.body,
      contentType: entry.contentType,
    };
  }

  async put(key: string, value: CachedResponse, ttlMs: number): Promise<void> {
    this.entries.set(key, { ...value, expiresAt: Date.now() + ttlMs });
  }

  async getOrExecute(
    key: string,
    ttlMs: number,
    producer: () => Promise<CachedResponse | null>,
  ): Promise<IdempotencyExecution> {
    const cached = await this.get(key);
    if (cached) return { value: cached, replay: true };

    const pending = this.inFlight.get(key);
    if (pending) {
      try {
        const value = await pending;
        if (value) return { value, replay: true };
      } catch {
        // The owner failed without a cacheable response. This request
        // gets its own chance to run rather than inheriting that error.
      }
      return this.getOrExecute(key, ttlMs, producer);
    }

    let resolvePending!: (value: CachedResponse | null) => void;
    const owned = new Promise<CachedResponse | null>((resolve) => {
      resolvePending = resolve;
    });
    this.inFlight.set(key, owned);

    try {
      const value = await producer();
      if (value) await this.put(key, value, ttlMs);
      resolvePending(value);
      return { value, replay: false };
    } catch (error) {
      // Wake waiters so one of them may retry after the failed owner.
      // The owner still receives its original exception.
      resolvePending(null);
      throw error;
    } finally {
      if (this.inFlight.get(key) === owned) this.inFlight.delete(key);
    }
  }
}

interface StoredRow {
  state: 'pending' | 'completed';
  owner_token: string | null;
  lease_expires_at: Date | null;
  status: number | null;
  response_body: string | null;
  content_type: string | null;
}

const LEASE_MS = 30_000;
const HEARTBEAT_MS = 10_000;
const INITIAL_POLL_MS = 50;
const MAX_POLL_MS = 500;

export class IdempotencyLeaseLostError extends Error {
  override name = 'IdempotencyLeaseLostError';

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
  }
}

function hashKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

function asCachedResponse(row: StoredRow): CachedResponse | null {
  if (
    row.state !== 'completed' ||
    row.status === null ||
    row.response_body === null ||
    row.content_type === null
  ) {
    return null;
  }
  return {
    status: row.status,
    body: row.response_body,
    contentType: row.content_type,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Durable cross-machine store backed by `app.idempotency_keys`.
 *
 * The claim query is an atomic insert/reclaim. A live owner renews its
 * lease in the background; a crashed owner becomes reclaimable within
 * 30 seconds. Waiters use bounded backoff and never hold a DB connection
 * while the producer runs.
 */
export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly pool: pg.Pool) {}

  async get(key: string): Promise<CachedResponse | null> {
    const row = await this.read(hashKey(key));
    return row ? asCachedResponse(row) : null;
  }

  async put(key: string, value: CachedResponse, ttlMs: number): Promise<void> {
    const keyHash = hashKey(key);
    await this.pool.query(
      `INSERT INTO app.idempotency_keys
         (key_hash, state, owner_token, lease_expires_at, status,
          response_body, content_type, expires_at)
       VALUES
         ($1, 'completed', NULL, NULL, $2, $3, $4,
          now() + ($5::double precision * interval '1 millisecond'))
       ON CONFLICT (key_hash) DO UPDATE
         SET state = 'completed',
             owner_token = NULL,
             lease_expires_at = NULL,
             status = EXCLUDED.status,
             response_body = EXCLUDED.response_body,
             content_type = EXCLUDED.content_type,
             expires_at = EXCLUDED.expires_at,
             updated_at = now()`,
      [keyHash, value.status, value.body, value.contentType, ttlMs],
    );
  }

  async getOrExecute(
    key: string,
    ttlMs: number,
    producer: () => Promise<CachedResponse | null>,
  ): Promise<IdempotencyExecution> {
    const keyHash = hashKey(key);
    let pollMs = INITIAL_POLL_MS;

    while (true) {
      const cached = await this.read(keyHash);
      const cachedValue = cached ? asCachedResponse(cached) : null;
      if (cachedValue) return { value: cachedValue, replay: true };

      const ownerToken = randomUUID();
      if (await this.tryClaim(keyHash, ownerToken, ttlMs)) {
        return this.runAsOwner(keyHash, ownerToken, ttlMs, producer);
      }

      await wait(pollMs);
      pollMs = Math.min(MAX_POLL_MS, pollMs * 2);
    }
  }

  private async read(keyHash: string): Promise<StoredRow | null> {
    const { rows } = await this.pool.query<StoredRow>(
      `SELECT state, owner_token, lease_expires_at, status,
              response_body, content_type
       FROM app.idempotency_keys
       WHERE key_hash = $1
         AND expires_at > now()`,
      [keyHash],
    );
    return rows[0] ?? null;
  }

  private async tryClaim(keyHash: string, ownerToken: string, ttlMs: number): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO app.idempotency_keys AS current
         (key_hash, state, owner_token, lease_expires_at, status,
          response_body, content_type, expires_at)
       VALUES
         ($1, 'pending', $2,
          now() + ($3::double precision * interval '1 millisecond'),
          NULL, NULL, NULL,
          now() + ($4::double precision * interval '1 millisecond'))
       ON CONFLICT (key_hash) DO UPDATE
         SET state = 'pending',
             owner_token = EXCLUDED.owner_token,
             lease_expires_at = EXCLUDED.lease_expires_at,
             status = NULL,
             response_body = NULL,
             content_type = NULL,
             expires_at = EXCLUDED.expires_at,
             updated_at = now()
       WHERE current.expires_at <= now()
          OR (
            current.state = 'pending'
            AND current.lease_expires_at <= now()
          )
       RETURNING key_hash`,
      [keyHash, ownerToken, LEASE_MS, ttlMs],
    );
    return rowCount === 1;
  }

  private async runAsOwner(
    keyHash: string,
    ownerToken: string,
    ttlMs: number,
    producer: () => Promise<CachedResponse | null>,
  ): Promise<IdempotencyExecution> {
    let heartbeatRunning: Promise<void> | null = null;
    let leaseFailure: IdempotencyLeaseLostError | null = null;
    const heartbeat = setInterval(() => {
      if (heartbeatRunning || leaseFailure) return;
      heartbeatRunning = this.renewLease(keyHash, ownerToken)
        .catch((error) => {
          if (error instanceof IdempotencyLeaseLostError) {
            leaseFailure ??= error;
            return;
          }
          // A query error does not prove whether Postgres applied the
          // renewal. The guarded complete/release below is authoritative.
          // eslint-disable-next-line no-console
          console.warn('[idempotency] lease heartbeat was inconclusive:', error);
        })
        .finally(() => {
          heartbeatRunning = null;
        });
    }, HEARTBEAT_MS);
    if (typeof heartbeat.unref === 'function') heartbeat.unref();

    let outcome: { ok: true; value: CachedResponse | null } | { ok: false; error: unknown };
    try {
      outcome = { ok: true, value: await producer() };
    } catch (error) {
      outcome = { ok: false, error };
    }

    clearInterval(heartbeat);
    const finalHeartbeat = heartbeatRunning;
    if (finalHeartbeat) await finalHeartbeat;

    const lostLease = leaseFailure;
    if (lostLease) {
      await this.release(keyHash, ownerToken).catch(() => undefined);
      throw lostLease;
    }

    if (!outcome.ok) {
      await this.release(keyHash, ownerToken);
      throw outcome.error;
    }
    if (!outcome.value) {
      await this.release(keyHash, ownerToken);
      return { value: null, replay: false };
    }
    await this.complete(keyHash, ownerToken, outcome.value, ttlMs);
    return { value: outcome.value, replay: false };
  }

  private async renewLease(keyHash: string, ownerToken: string): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE app.idempotency_keys
       SET lease_expires_at =
             now() + ($3::double precision * interval '1 millisecond'),
           updated_at = now()
       WHERE key_hash = $1
         AND state = 'pending'
         AND owner_token = $2`,
      [keyHash, ownerToken, LEASE_MS],
    );
    if (rowCount !== 1) {
      throw new IdempotencyLeaseLostError('Idempotency lease ownership was lost during renewal.');
    }
  }

  private async complete(
    keyHash: string,
    ownerToken: string,
    value: CachedResponse,
    ttlMs: number,
  ): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE app.idempotency_keys
       SET state = 'completed',
           owner_token = NULL,
           lease_expires_at = NULL,
           status = $3,
           response_body = $4,
           content_type = $5,
           expires_at =
             now() + ($6::double precision * interval '1 millisecond'),
           updated_at = now()
       WHERE key_hash = $1
         AND state = 'pending'
         AND owner_token = $2`,
      [keyHash, ownerToken, value.status, value.body, value.contentType, ttlMs],
    );
    if (rowCount !== 1) {
      throw new IdempotencyLeaseLostError(
        'Idempotency lease ownership was lost before completion.',
      );
    }
  }

  private async release(keyHash: string, ownerToken: string): Promise<void> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM app.idempotency_keys
       WHERE key_hash = $1
         AND state = 'pending'
         AND owner_token = $2`,
      [keyHash, ownerToken],
    );
    if (rowCount !== 1) {
      throw new IdempotencyLeaseLostError('Idempotency lease ownership was lost before release.');
    }
  }

  async gc(now: number = Date.now()): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM app.idempotency_keys WHERE expires_at < $1`,
      [new Date(now).toISOString()],
    );
    return rowCount ?? 0;
  }
}

let instance: IdempotencyStore | null = null;

export function getIdempotencyStore(): IdempotencyStore {
  if (instance) return instance;
  if (env.IDEMPOTENCY_BACKEND === 'postgres' || env.NODE_ENV === 'production') {
    instance = new PostgresIdempotencyStore(getPool());
  } else {
    instance = new MemoryIdempotencyStore();
  }
  return instance;
}

export function setIdempotencyStore(store: IdempotencyStore): void {
  instance = store;
}

export function resetIdempotencyStore(): void {
  instance = null;
}

let gcTimer: ReturnType<typeof setInterval> | null = null;

export function startIdempotencyGc(intervalMs = LOW_TRAFFIC_MAINTENANCE_INTERVAL_MS): void {
  if (gcTimer) return;
  const store = getIdempotencyStore();
  if (!(store instanceof PostgresIdempotencyStore)) return;
  gcTimer = setInterval(() => {
    store.gc().catch((error) => {
      // eslint-disable-next-line no-console
      console.warn('[idempotency] gc failed:', error);
    });
  }, intervalMs);
  if (typeof gcTimer.unref === 'function') gcTimer.unref();
}

export function stopIdempotencyGc(): void {
  if (!gcTimer) return;
  clearInterval(gcTimer);
  gcTimer = null;
}
