/**
 * Integration tests for /settings/ai.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../app.js';
import { startPg, seedAuthUsers, type PgFixture } from './setup-pg.js';
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
  await seedAuthUsers(fx.url, [{ id: alice }]);
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

const headers = (tok: string) => ({
  authorization: `Bearer ${tok}`,
  'content-type': 'application/json',
});

describe('/settings/ai', () => {
  it('GET returns {vendor: null, model: null} when row absent', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/settings/ai', { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vendor: string | null; model: string | null };
    expect(body).toEqual({ vendor: null, model: null });
  });

  it('PATCH sets vendor + model and persists across GETs', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const patch = await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: 'openai', model: 'gpt-4.1-nano' }),
    });
    expect(patch.status).toBe(200);
    expect(await patch.json()).toEqual({ vendor: 'openai', model: 'gpt-4.1-nano' });

    const get = await app.request('/settings/ai', { headers: { authorization: `Bearer ${tok}` } });
    expect(await get.json()).toEqual({ vendor: 'openai', model: 'gpt-4.1-nano' });
  });

  it('PATCH {vendor: null, model: null} clears the row back to default', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    // Set a value first
    const set = await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: 'openai', model: 'gpt-4.1' }),
    });
    expect(set.status).toBe(200);

    // Clear it
    const cleared = await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: null, model: null }),
    });
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ vendor: null, model: null });

    const get = await app.request('/settings/ai', { headers: { authorization: `Bearer ${tok}` } });
    expect(await get.json()).toEqual({ vendor: null, model: null });
  });

  it('PATCH 400 on unknown model id', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: 'openai', model: 'gpt-4o' }),
    });
    expect(res.status).toBe(400);
  });

  it('PATCH 400 on dropped vendor (kimi)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: 'kimi', model: 'kimi-k2.5' }),
    });
    expect(res.status).toBe(400);
  });

  it('PATCH 400 on mixed null/non-null', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: 'openai', model: null }),
    });
    expect(res.status).toBe(400);
  });

  it('GET 401 without auth', async () => {
    const app = createApp();
    const res = await app.request('/settings/ai');
    expect(res.status).toBe(401);
  });
});
