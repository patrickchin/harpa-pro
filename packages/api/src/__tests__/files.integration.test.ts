/**
 * Integration tests for /files/* — presign, register, signed GET.
 *
 * Storage runs in fixture mode (FixtureStorage) — see services/storage.ts.
 * No R2 calls happen in CI (arch-storage.md §Fixture mode).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../app.js';
import { startPg, seedAuthUsers, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import { makeUserId, makeSessionId, makeFileId } from './factories/index.js';
import { env } from '../env.js';

let fx: PgFixture;
let alice: string;
let aliceSid: string;
let proUser: string;
let proSid: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  process.env.R2_FIXTURE_MODE = 'replay';
  await resetPool();
  getPool(fx.url);
  alice = makeUserId();
  aliceSid = makeSessionId();
  proUser = makeUserId();
  proSid = makeSessionId();
  env.FREEMIUM_ENFORCEMENT_ENABLED = '1';
  env.FREEMIUM_ENFORCEMENT_AT = '2026-01-01T00:00:00.000Z';
  await seedAuthUsers(fx.url, [{ id: alice }, { id: proUser, plan: 'pro' }]);
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

const headers = (tok: string) => ({ authorization: `Bearer ${tok}`, 'content-type': 'application/json' });

describe('/files/*', () => {
  it('accepts exactly 5 MiB and rejects 5 MiB + 1 for Free presign', async () => {
    const tok = await signTestToken(alice, aliceSid);
    const request = (sizeBytes: number) => createApp().request('/files/presign', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        scope: 'scratch',
        kind: 'voice',
        contentType: 'audio/m4a',
        sizeBytes,
      }),
    });

    expect((await request(5 * 1024 * 1024)).status).toBe(200);
    const rejected = await request(5 * 1024 * 1024 + 1);
    expect(rejected.status).toBe(413);
    await expect(rejected.json()).resolves.toMatchObject({
      error: {
        code: 'file_size_limit_exceeded',
        details: {
          sizeBytes: 5 * 1024 * 1024 + 1,
          limitBytes: 5 * 1024 * 1024,
          plan: 'free',
        },
      },
    });
  });

  it('allows Pro to presign exactly 50 MiB', async () => {
    const tok = await signTestToken(proUser, proSid);
    const response = await createApp().request('/files/presign', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        scope: 'scratch',
        kind: 'document',
        contentType: 'application/pdf',
        sizeBytes: 50 * 1024 * 1024,
      }),
    });

    expect(response.status).toBe(200);
  });

  it('keeps an existing Pro-sized file visible after downgrade', async () => {
    const app = createApp();
    const tok = await signTestToken(proUser, proSid);
    const sizeBytes = 6 * 1024 * 1024;
    const presign = await app.request('/files/presign', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        scope: 'scratch',
        kind: 'document',
        contentType: 'application/pdf',
        sizeBytes,
      }),
    });
    expect(presign.status).toBe(200);
    const { fileKey } = (await presign.json()) as { fileKey: string };

    const register = await app.request('/files', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        scope: 'scratch',
        kind: 'document',
        fileKey,
        contentType: 'application/pdf',
        sizeBytes,
      }),
    });
    expect(register.status).toBe(201);
    const file = (await register.json()) as { id: string };

    await getPool().query(
      `UPDATE public."user" SET plan = 'free', updated_at = now() WHERE id = $1`,
      [proUser],
    );

    const url = await app.request(`/files/${file.id}/url`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(url.status).toBe(200);
  });

  it('repeats the Free limit check during registration', async () => {
    const tok = await signTestToken(alice, aliceSid);
    const presign = await createApp().request('/files/presign', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        scope: 'scratch',
        kind: 'document',
        contentType: 'application/pdf',
        sizeBytes: 1024,
      }),
    });
    const { fileKey } = (await presign.json()) as { fileKey: string };

    const register = await createApp().request('/files', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        scope: 'scratch',
        kind: 'document',
        fileKey,
        contentType: 'application/pdf',
        sizeBytes: 5 * 1024 * 1024 + 1,
      }),
    });

    expect(register.status).toBe(413);
    const rows = await getPool().query(
      `SELECT id FROM app.files WHERE file_key = $1`,
      [fileKey],
    );
    expect(rows.rowCount).toBe(0);
  });

  it('POST /files/presign (scratch) returns server-built key under users/<callerId>/scratch/', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/files/presign', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ scope: 'scratch', kind: 'voice', contentType: 'audio/m4a', sizeBytes: 12345 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { uploadUrl: string; fileKey: string; expiresAt: string };
    expect(body.fileKey.startsWith(`users/${alice}/scratch/`)).toBe(true);
    expect(body.fileKey.endsWith('.m4a')).toBe(true);
    expect(body.uploadUrl).toContain(encodeURIComponent(body.fileKey));
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now() - 1000);
  });

  it('POST /files (avatar) registers a file and round-trips via GET /files/:id/url', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    // Presign first to get a server-built key.
    const presign = await app.request('/files/presign', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ scope: 'avatar', contentType: 'image/jpeg', sizeBytes: 4096 }),
    });
    const { fileKey } = (await presign.json()) as { fileKey: string };

    const reg = await app.request('/files', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        scope: 'avatar',
        fileKey,
        sizeBytes: 4096,
        contentType: 'image/jpeg',
      }),
    });
    expect(reg.status).toBe(201);
    const file = (await reg.json()) as { id: string; ownerId: string; fileKey: string };
    expect(file.ownerId).toBe(alice);
    expect(file.fileKey).toBe(fileKey);

    const url = await app.request(`/files/${file.id}/url`, { headers: { authorization: `Bearer ${tok}` } });
    expect(url.status).toBe(200);
    const body = (await url.json()) as { url: string; expiresAt: string };
    expect(body.url).toContain(encodeURIComponent(fileKey));
  });

  it('POST /files 400 when fileKey is not under caller prefix', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/files', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        scope: 'scratch',
        kind: 'image',
        fileKey: 'users/usr_00000000/scratch/fil_00000000.jpg',
        sizeBytes: 1,
        contentType: 'image/jpeg',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /files 409 on duplicate fileKey', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const presign = await app.request('/files/presign', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ scope: 'scratch', kind: 'document', contentType: 'application/pdf', sizeBytes: 1024 }),
    });
    const { fileKey } = (await presign.json()) as { fileKey: string };
    const body = JSON.stringify({
      scope: 'scratch',
      kind: 'document',
      fileKey,
      sizeBytes: 1024,
      contentType: 'application/pdf',
    });
    const r1 = await app.request('/files', { method: 'POST', headers: headers(tok), body });
    expect(r1.status).toBe(201);
    const r2 = await app.request('/files', { method: 'POST', headers: headers(tok), body });
    expect(r2.status).toBe(409);
  });

  it('GET /files/:id/url 404 on unknown id', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/files/fil_00000000/url', {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(404);
  });

  it('all endpoints 401 without auth', async () => {
    const app = createApp();
    expect((await app.request('/files/presign', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await app.request('/files', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await app.request('/files/00000000-0000-0000-0000-000000000000/url')).status).toBe(401);
  });
});
