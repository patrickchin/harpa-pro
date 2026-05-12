/**
 * Integration tests for /files/* — presign, register, signed GET.
 *
 * Storage runs in fixture mode (FixtureStorage) — see services/storage.ts.
 * No R2 calls happen in CI (arch-storage.md §Fixture mode).
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

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  process.env.R2_FIXTURE_MODE = 'replay';
  await resetPool();
  getPool(fx.url);
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  const u = await admin.query<{ id: string }>(
    `INSERT INTO auth.users(phone) VALUES ($1) RETURNING id`,
    ['+15551200001'],
  );
  alice = u.rows[0]!.id;
  const s = await admin.query<{ id: string }>(
    `INSERT INTO auth.sessions(user_id, expires_at) VALUES ($1, now() + interval '7 days') RETURNING id`,
    [alice],
  );
  aliceSid = s.rows[0]!.id;
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

const headers = (tok: string) => ({ authorization: `Bearer ${tok}`, 'content-type': 'application/json' });

describe('/files/*', () => {
  it('POST /files/presign returns server-built key under users/<callerId>/', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/files/presign', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ kind: 'voice', contentType: 'audio/m4a', sizeBytes: 12345 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { uploadUrl: string; fileKey: string; expiresAt: string };
    expect(body.fileKey.startsWith(`users/${alice}/voice/`)).toBe(true);
    expect(body.fileKey.endsWith('.m4a')).toBe(true);
    expect(body.uploadUrl).toContain(encodeURIComponent(body.fileKey));
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now() - 1000);
  });

  it('POST /files registers a file and round-trips via GET /files/:id/url', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    // Presign first to get a server-built key.
    const presign = await app.request('/files/presign', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ kind: 'image', contentType: 'image/jpeg', sizeBytes: 4096 }),
    });
    const { fileKey } = (await presign.json()) as { fileKey: string };

    const reg = await app.request('/files', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        kind: 'image',
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
        kind: 'image',
        fileKey: 'users/00000000-0000-0000-0000-000000000000/image/x.jpg',
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
      body: JSON.stringify({ kind: 'document', contentType: 'application/pdf', sizeBytes: 1024 }),
    });
    const { fileKey } = (await presign.json()) as { fileKey: string };
    const body = JSON.stringify({
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
    const res = await app.request('/files/00000000-0000-0000-0000-000000000000/url', {
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
