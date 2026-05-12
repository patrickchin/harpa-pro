/**
 * Integration tests for the rate-limit middleware. Drives a live route
 * (POST /voice/summarize) end-to-end so we exercise the middleware
 * mounted on the actual route, not a stub.
 *
 * Each test resets the in-memory limiter via resetRateLimiter() to keep
 * counters from leaking between cases. The summarize route is bound to
 * 60 RPM per user; we override the limiter to a tiny instance per test
 * so we can hit the limit without firing 60 requests.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { startPg, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import {
  MemoryRateLimiter,
  setRateLimiter,
  resetRateLimiter,
  type RateLimiter,
} from '../lib/rateLimiter.js';
import { resetIdempotencyStore } from '../lib/idempotencyStore.js';

let fx: PgFixture;
let alice: string;
let aliceSid: string;
let bob: string;
let bobSid: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  process.env.R2_FIXTURE_MODE = 'replay';
  delete process.env.AI_LIVE;
  await resetPool();
  getPool(fx.url);
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  const u = await admin.query<{ id: string }>(
    `INSERT INTO auth.users(phone) VALUES ($1), ($2) RETURNING id`,
    ['+15551700001', '+15551700002'],
  );
  alice = u.rows[0]!.id;
  bob = u.rows[1]!.id;
  const s = await admin.query<{ id: string }>(
    `INSERT INTO auth.sessions(user_id, expires_at) VALUES ($1, now() + interval '7 days'), ($2, now() + interval '7 days') RETURNING id`,
    [alice, bob],
  );
  aliceSid = s.rows[0]!.id;
  bobSid = s.rows[1]!.id;
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

beforeEach(() => {
  resetRateLimiter();
  resetIdempotencyStore();
});

const headers = (tok: string) => ({
  authorization: `Bearer ${tok}`,
  'content-type': 'application/json',
});

async function callSummarize(tok: string) {
  const app = createApp();
  return app.request('/voice/summarize', {
    method: 'POST',
    headers: headers(tok),
    body: JSON.stringify({ transcript: 'whatever — replay normalises.' }),
  });
}

describe('rate limit middleware', () => {
  it('returns 429 with Retry-After + envelope once the budget is exhausted', async () => {
    // Tight 2-per-minute limiter forced via the public setter so we don't
    // need to fire 60 requests to prove the gate.
    const limiter: RateLimiter = new (class extends MemoryRateLimiter {
      override consume(key: string, _limit: number, windowMs: number) {
        return super.consume(key, 2, windowMs);
      }
    })();
    setRateLimiter(limiter);

    const tok = await signTestToken(alice, aliceSid);
    const r1 = await callSummarize(tok);
    const r2 = await callSummarize(tok);
    const r3 = await callSummarize(tok);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(r3.headers.get('x-ratelimit-remaining')).toBe('0');
    const body = (await r3.json()) as { error: { code: string; message: string }; requestId?: string };
    expect(body.error.code).toBe('rate_limited');
    expect(body.error.message).toMatch(/rate limit/i);
  });

  it('attaches X-RateLimit-* headers on success', async () => {
    const tok = await signTestToken(alice, aliceSid);
    const res = await callSummarize(tok);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-ratelimit-limit')).toBe('60');
    expect(Number(res.headers.get('x-ratelimit-remaining'))).toBeGreaterThanOrEqual(0);
    expect(res.headers.get('x-ratelimit-reset')).toMatch(/^\d+$/);
  });

  it('per-user buckets — alice exhausting her budget does not block bob', async () => {
    const limiter: RateLimiter = new (class extends MemoryRateLimiter {
      override consume(key: string, _limit: number, windowMs: number) {
        return super.consume(key, 1, windowMs);
      }
    })();
    setRateLimiter(limiter);

    const aliceTok = await signTestToken(alice, aliceSid);
    const bobTok = await signTestToken(bob, bobSid);
    const a1 = await callSummarize(aliceTok);
    const a2 = await callSummarize(aliceTok);
    const b1 = await callSummarize(bobTok);
    expect(a1.status).toBe(200);
    expect(a2.status).toBe(429);
    expect(b1.status).toBe(200);
  });

  it('envelope on 429 carries the request id from middleware', async () => {
    const limiter: RateLimiter = new (class extends MemoryRateLimiter {
      override consume(key: string, _limit: number, windowMs: number) {
        return super.consume(key, 0, windowMs);
      }
    })();
    setRateLimiter(limiter);

    const tok = await signTestToken(alice, aliceSid);
    const res = await callSummarize(tok);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { requestId?: string };
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId!.length).toBeGreaterThan(0);
  });
});
