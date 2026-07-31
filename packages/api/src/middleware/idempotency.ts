/**
 * withIdempotency({ name, ttlMs? }) — runs a request once for a scoped
 * `Idempotency-Key` and replays the response on retries. Default TTL 24h
 * (arch-api-design.md §Idempotency).
 *
 * Replay semantics:
 *   - Missing `Idempotency-Key` header → no-op (passes through).
 *   - First call → run handler, capture response body+status, cache it
 *     ONLY if status < 500 (don't pin transient upstream failures).
 *   - Concurrent calls coalesce locally or through a Postgres lease.
 *   - Repeat call with the same scoped request → return cached body with
 *     `Idempotent-Replay: true`.
 *
 * Scope includes route name, user, HTTP method, concrete path, and a
 * SHA-256 body digest before the client key. Length-prefixing prevents
 * delimiter ambiguity; the Postgres store hashes the final composite
 * before persistence.
 */
import { createHash } from 'node:crypto';
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

function frame(value: string): string {
  return `${Buffer.byteLength(value, 'utf8')}:${value}`;
}

async function scopedKey(
  method: string,
  path: string,
  body: Request,
  name: string,
  userId: string,
  clientKey: string,
): Promise<string> {
  const bodyText = await body.clone().text();
  const bodyHash = createHash('sha256').update(bodyText, 'utf8').digest('hex');
  return [name, userId, method.toUpperCase(), path, bodyHash, clientKey].map(frame).join('');
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
    const store = getIdempotencyStore();
    const cacheKey = await scopedKey(c.req.method, c.req.path, c.req.raw, opts.name, userId, raw);
    const result = await store.getOrExecute(cacheKey, ttlMs, async () => {
      await next();

      // Capture the live response. Only cache success-ish responses
      // (status < 500) so transient upstream failures don't get pinned.
      const response = c.res;
      if (response.status >= 500) return null;
      const cloned = response.clone();
      const body = await cloned.text();
      const contentType = response.headers.get('content-type') ?? 'application/json';
      return { status: response.status, body, contentType };
    });

    if (result.replay && result.value) {
      return c.body(result.value.body, result.value.status as never, {
        'content-type': result.value.contentType,
        'idempotent-replay': 'true',
      });
    }
  };
}
