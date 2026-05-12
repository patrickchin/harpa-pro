/**
 * Idempotency-Key store. Caches the (status, body, contentType) tuple
 * keyed by `(route, userId, idempotencyKey)`. The middleware in
 * middleware/idempotency.ts replays cached entries verbatim with an
 * `Idempotent-Replay: true` header so clients can detect a replay.
 *
 * Default in-memory implementation; same multi-machine carve-out as
 * rateLimiter.ts (UpstashIdempotencyStore is TODO for production).
 *
 * TTL: arch-api-design.md §Idempotency calls for 24h. The middleware
 * sets that default; tests pass shorter TTLs to exercise expiry.
 */

export interface CachedResponse {
  status: number;
  body: string;
  contentType: string;
}

export interface IdempotencyStore {
  get(key: string): Promise<CachedResponse | null>;
  put(key: string, value: CachedResponse, ttlMs: number): Promise<void>;
}

interface Entry extends CachedResponse {
  expiresAt: number;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, Entry>();

  async get(key: string): Promise<CachedResponse | null> {
    const e = this.entries.get(key);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return { status: e.status, body: e.body, contentType: e.contentType };
  }

  async put(key: string, value: CachedResponse, ttlMs: number): Promise<void> {
    this.entries.set(key, { ...value, expiresAt: Date.now() + ttlMs });
  }
}

let _instance: IdempotencyStore | null = null;

export function getIdempotencyStore(): IdempotencyStore {
  if (!_instance) _instance = new MemoryIdempotencyStore();
  return _instance;
}

export function setIdempotencyStore(s: IdempotencyStore): void {
  _instance = s;
}

export function resetIdempotencyStore(): void {
  _instance = null;
}
