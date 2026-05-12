/**
 * Integration tests for /voice/* — transcribe + summarize.
 *
 * AI provider runs in @harpa/ai-fixtures replay mode (default). No real
 * provider is hit. Fixtures: packages/ai-fixtures/fixtures/{transcribe,
 * summarize}.basic.json — services/ai.ts normalises inputs to the
 * canonical recorded values so the request hash always matches.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { startPg, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';

let fx: PgFixture;
let alice: string;
let aliceSid: string;
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
    `INSERT INTO auth.users(phone) VALUES ($1) RETURNING id`,
    ['+15551400001'],
  );
  alice = u.rows[0]!.id;
  const s = await admin.query<{ id: string }>(
    `INSERT INTO auth.sessions(user_id, expires_at) VALUES ($1, now() + interval '7 days') RETURNING id`,
    [alice],
  );
  aliceSid = s.rows[0]!.id;
  const af = await admin.query<{ id: string }>(
    `INSERT INTO app.files(owner_id, kind, file_key, size_bytes, content_type)
     VALUES ($1, 'voice', $2, 1024, 'audio/m4a') RETURNING id`,
    [alice, `users/${alice}/voice/seed-voice.m4a`],
  );
  aliceFile = af.rows[0]!.id;
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

const headers = (tok: string) => ({
  authorization: `Bearer ${tok}`,
  'content-type': 'application/json',
});

describe('/voice/*', () => {
  it('POST /voice/transcribe returns the recorded transcript', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/voice/transcribe', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fileId: aliceFile }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transcript: string };
    expect(body.transcript).toContain('Site arrival 8:15');
  });

  it('POST /voice/summarize returns the recorded summary', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/voice/summarize', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ transcript: 'anything — replay normalises the prompt.' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: string };
    expect(body.summary).toContain('Crew arrived 8:15');
  });

  it('POST /voice/transcribe 404 on unknown fileId', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/voice/transcribe', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fileId: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('POST /voice/transcribe 400 on bad body (missing fileId)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/voice/transcribe', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('POST /voice/summarize 400 on empty transcript', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/voice/summarize', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ transcript: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /voice/transcribe 502 with code=ai_provider_error on unknown fixtureName', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/voice/transcribe', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fileId: aliceFile, fixtureName: 'transcribe.does-not-exist' }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('ai_provider_error');
    // No provider/fixture detail leaks to the wire.
    expect(body.error.message).not.toContain('does-not-exist');
    expect(body.error.message).not.toContain('fixture');
  });

  it('POST /voice/summarize 502 with code=ai_provider_error on unknown fixtureName', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/voice/summarize', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ transcript: 'whatever', fixtureName: 'summarize.missing' }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ai_provider_error');
  });

  it('POST /voice/transcribe 400 rejects path-traversal-shaped fixtureName', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/voice/transcribe', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fileId: aliceFile, fixtureName: '../../../etc/passwd' }),
    });
    // Rejected at the contract boundary by the regex on fixtureName,
    // before the route handler / fixture store is touched.
    expect(res.status).toBe(400);
  });

  it('both endpoints 401 without auth', async () => {
    const app = createApp();
    expect((await app.request('/voice/transcribe', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await app.request('/voice/summarize', { method: 'POST', body: '{}' })).status).toBe(401);
  });
});
