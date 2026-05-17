/**
 * Integration tests for /settings/ai.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { startPg, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import { makeUserId, makeSessionId } from './factories/index.js';

let fx: PgFixture;
let alice: string;
let aliceSid: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  alice = makeUserId();
  aliceSid = makeSessionId();
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO auth.users(id, phone) VALUES ($1, $2)`,
    [alice, '+15551000001'],
  );
  await admin.query(
    `INSERT INTO auth.sessions(id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')`,
    [aliceSid, alice],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

const headers = (tok: string) => ({ authorization: `Bearer ${tok}`, 'content-type': 'application/json' });

describe('/settings/ai', () => {
  it('GET returns defaults when row absent', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/settings/ai', { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vendor: string; model: string };
    expect(body.vendor).toBe('openai');
    expect(body.model).toBe('gpt-4o-mini');
  });

  it('PATCH updates vendor + model and persists across GETs', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const patch = await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: 'anthropic', model: 'claude-3-5-sonnet' }),
    });
    expect(patch.status).toBe(200);
    const body = (await patch.json()) as { vendor: string; model: string };
    expect(body).toEqual({ vendor: 'anthropic', model: 'claude-3-5-sonnet' });

    const get = await app.request('/settings/ai', { headers: { authorization: `Bearer ${tok}` } });
    expect(((await get.json()) as { vendor: string }).vendor).toBe('anthropic');
  });

  it('PATCH partial — only vendor — keeps model', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: 'kimi' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vendor: string; model: string };
    expect(body.vendor).toBe('kimi');
    expect(body.model).toBe('claude-3-5-sonnet');
  });

  it('PATCH 400 on unknown vendor', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: 'bogus' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET 401 without auth', async () => {
    const app = createApp();
    const res = await app.request('/settings/ai');
    expect(res.status).toBe(401);
  });
});
