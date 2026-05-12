/**
 * withIdempotency({ name, ttlMs? }) — caches the first non-error response
 * for an `Idempotency-Key` header and replays it verbatim on subsequent
 * calls with the same key. Default TTL 24h (arch-api-design.md §Idempotency).
 *
 * Replay semantics:
 *   - Missing `Idempotency-Key` header → no-op (passes through).
 *   - First call → run handler, capture response body+status, cache it
 *     ONLY if status < 500 (don't pin transient upstream failures).
 *   - Repeat call with same (name, userId, key) → return cached body
 *     with `Idempotent-Replay: true` header.
 *
 * Key shape: `${name}:${userId ?? 'anon'}:${idempotencyKey}`. The
 * idempotency key is bounded to 1..200 chars and a safe charset to keep
 * the cache key length under control.
 */
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app.js';
import { getIdempotencyStore } from '../lib/idempotencyStore.js';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_KEY_LEN = 200;
const KEY_RE = /^[A-Za-z0-9._:\-]+$/;

export interface IdempotencyOptions {
  name: string;
  ttlMs?: number;
}

export function withIdempotency(opts: IdempotencyOptions): MiddlewareHandler<AppEnv> {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  return async (c, next) => {
    const raw = c.req.header('idempotency-key');
    if (!raw) {
      await next();
      return;
    }
    if (raw.length > MAX_KEY_LEN || !KEY_RE.test(raw)) {
      const requestId = c.get('requestId');
      return c.json(
        {
          error: {
            code: 'bad_request',
            message: 'Invalid Idempotency-Key.',
          },
          requestId,
        },
        400,
      );
    }
    const userId = c.get('userId') ?? 'anon';
    const cacheKey = `${opts.name}:${userId}:${raw}`;
    const store = getIdempotencyStore();

    const cached = await store.get(cacheKey);
    if (cached) {
      return c.body(cached.body, cached.status as never, {
        'content-type': cached.contentType,
        'idempotent-replay': 'true',
      });
    }

    await next();

    // Capture the live response. Only cache success-ish responses
    // (status < 500) so transient upstream failures don't get pinned.
    const res = c.res;
    if (res.status >= 500) return;
    const cloned = res.clone();
    const body = await cloned.text();
    const contentType = res.headers.get('content-type') ?? 'application/json';
    await store.put(cacheKey, { status: res.status, body, contentType }, ttlMs);
  };
}
