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
import { startPg, seedAuthUsers, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import { makeUserId, makeSessionId, makeFileId } from './factories/index.js';

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
  alice = makeUserId();
  aliceSid = makeSessionId();
  aliceFile = makeFileId();
  await seedAuthUsers(fx.url, [{ id: alice }]);
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type)
     VALUES ($1, $2, 'voice', $3, 1024, 'audio/m4a')`,
    [aliceFile, alice, `users/${alice}/voice/seed-voice.m4a`],
  );
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
    expect(body.transcript).toContain('construction site');
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
    expect(body.summary).toContain('second-floor concrete pour');
  });

  it('POST /voice/transcribe 404 on unknown fileId', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/voice/transcribe', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fileId: 'fil_00000000' }),
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
