/**
 * Integration tests for the Idempotency-Key middleware. Drives a live
 * route (POST /voice/transcribe) end-to-end so the middleware order
 * (auth → rate-limit → idempotency → handler) is exercised as deployed.
 *
 * Each test resets the in-memory store via resetIdempotencyStore() and
 * resetRateLimiter() to keep state from leaking between cases.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { startPg, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import { resetRateLimiter } from '../lib/rateLimiter.js';
import { resetIdempotencyStore } from '../lib/idempotencyStore.js';

let fx: PgFixture;
let alice: string;
let aliceSid: string;
let bob: string;
let bobSid: string;
let aliceFile: string;

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
    ['+15551800001', '+15551800002'],
  );
  alice = u.rows[0]!.id;
  bob = u.rows[1]!.id;
  const s = await admin.query<{ id: string }>(
    `INSERT INTO auth.sessions(user_id, expires_at) VALUES ($1, now() + interval '7 days'), ($2, now() + interval '7 days') RETURNING id`,
    [alice, bob],
  );
  aliceSid = s.rows[0]!.id;
  bobSid = s.rows[1]!.id;
  const af = await admin.query<{ id: string }>(
    `INSERT INTO app.files(owner_id, kind, file_key, size_bytes, content_type)
     VALUES ($1, 'voice', $2, 1024, 'audio/m4a') RETURNING id`,
    [alice, `users/${alice}/voice/idem-voice.m4a`],
  );
  aliceFile = af.rows[0]!.id;
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

beforeEach(() => {
  resetRateLimiter();
  resetIdempotencyStore();
});

const headers = (tok: string, key?: string) => {
  const h: Record<string, string> = {
    authorization: `Bearer ${tok}`,
    'content-type': 'application/json',
  };
  if (key) h['idempotency-key'] = key;
  return h;
};

async function callTranscribe(tok: string, key?: string) {
  const app = createApp();
  return app.request('/voice/transcribe', {
    method: 'POST',
    headers: headers(tok, key),
    body: JSON.stringify({ fileId: aliceFile }),
  });
}

describe('idempotency middleware', () => {
  it('repeats with same key replay the cached body + status', async () => {
    const tok = await signTestToken(alice, aliceSid);
    const r1 = await callTranscribe(tok, 'req-abc-001');
    expect(r1.status).toBe(200);
    expect(r1.headers.get('idempotent-replay')).toBeNull();
    const b1 = await r1.text();

    const r2 = await callTranscribe(tok, 'req-abc-001');
    expect(r2.status).toBe(200);
    expect(r2.headers.get('idempotent-replay')).toBe('true');
    const b2 = await r2.text();
    expect(b2).toBe(b1);
  });

  it('different keys do not collide', async () => {
    const tok = await signTestToken(alice, aliceSid);
    const r1 = await callTranscribe(tok, 'req-key-A');
    const r2 = await callTranscribe(tok, 'req-key-B');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.headers.get('idempotent-replay')).toBeNull();
  });

  it('keys are scoped per user — alice key cannot be replayed by bob', async () => {
    const aliceTok = await signTestToken(alice, aliceSid);
    const bobTok = await signTestToken(bob, bobSid);
    await callTranscribe(aliceTok, 'shared-key-1');
    const bobRes = await callTranscribe(bobTok, 'shared-key-1');
    // Bob doesn't own the file, so this is a fresh call (and 404). The
    // important thing is the middleware did NOT replay alice's 200.
    expect(bobRes.status).toBe(404);
    expect(bobRes.headers.get('idempotent-replay')).toBeNull();
  });

  it('passes through when no Idempotency-Key header is set', async () => {
    const tok = await signTestToken(alice, aliceSid);
    const r1 = await callTranscribe(tok);
    const r2 = await callTranscribe(tok);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.headers.get('idempotent-replay')).toBeNull();
    expect(r2.headers.get('idempotent-replay')).toBeNull();
  });

  it('rejects malformed Idempotency-Key with 400', async () => {
    const tok = await signTestToken(alice, aliceSid);
    const res = await callTranscribe(tok, 'has spaces and !@#');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('bad_request');
  });

  it('does not cache 5xx responses (so a transient failure does not pin)', async () => {
    const tok = await signTestToken(alice, aliceSid);
    // Force a 502 via unknown fixture name → AiProviderError.
    const app = createApp();
    const r1 = await app.request('/voice/transcribe', {
      method: 'POST',
      headers: { ...headers(tok, 'pin-test-1') },
      body: JSON.stringify({ fileId: aliceFile, fixtureName: 'transcribe.does-not-exist' }),
    });
    expect(r1.status).toBe(502);

    // Same key, but now without the bad fixture override → should run
    // a fresh handler (200), not replay the 502.
    const r2 = await callTranscribe(tok, 'pin-test-1');
    expect(r2.status).toBe(200);
    expect(r2.headers.get('idempotent-replay')).toBeNull();
  });
});
