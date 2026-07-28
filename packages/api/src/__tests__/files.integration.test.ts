/**
 * Integration tests for /files/* — presign, register, signed GET.
 *
 * Storage runs in fixture mode (FixtureStorage) — see services/storage.ts.
 * No R2 calls happen in CI (arch-storage.md §Fixture mode).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { startPg, seedAuthUsers, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import { makeUserId, makeSessionId, makeFileId } from './factories/index.js';

let fx: PgFixture;
let admin: pg.Client;
let alice: string;
let aliceSid: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  process.env.R2_FIXTURE_MODE = 'replay';
  await resetPool();
  getPool(fx.url);
  alice = makeUserId();
  aliceSid = makeSessionId();
  await seedAuthUsers(fx.url, [{ id: alice }]);
  admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
}, 120_000);

afterAll(async () => {
  await admin?.end();
  await fx?.stop();
}, 60_000);

const headers = (tok: string) => ({ authorization: `Bearer ${tok}`, 'content-type': 'application/json' });

describe('/files/*', () => {
  it('POST /files/presign (scratch) returns server-built key under users/<callerId>/scratch/', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/files/presign', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ scope: 'scratch', kind: 'voice', contentType: 'audio/m4a', sizeBytes: 12345 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      uploadUrl: string;
      fileId: string;
      fileKey: string;
      expiresAt: string;
    };
    expect(body.fileKey.startsWith(`users/${alice}/scratch/`)).toBe(true);
    expect(body.fileKey.endsWith('.m4a')).toBe(true);
    expect(body.uploadUrl).toContain(encodeURIComponent(body.fileKey));
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now() - 1000);

    const lease = await admin.query<{
      file_id: string;
      owner_id: string;
      file_key: string;
      scope: string;
      project_id: string | null;
      report_id: string | null;
      content_type: string;
      size_bytes: string;
      presign_expires_at: Date;
      consumed_at: Date | null;
    }>(
      `SELECT file_id, owner_id, file_key, scope, project_id, report_id,
              content_type, size_bytes, presign_expires_at, consumed_at
         FROM app.file_upload_leases
        WHERE file_id = $1`,
      [body.fileId],
    );
    expect(lease.rows).toHaveLength(1);
    expect(lease.rows[0]).toMatchObject({
      file_id: body.fileId,
      owner_id: alice,
      file_key: body.fileKey,
      scope: 'scratch',
      project_id: null,
      report_id: null,
      content_type: 'audio/m4a',
      size_bytes: '12345',
      consumed_at: null,
    });
    expect(lease.rows[0]?.presign_expires_at.toISOString()).toBe(body.expiresAt);
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
    const { fileId, fileKey } = (await presign.json()) as {
      fileId: string;
      fileKey: string;
    };

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

    const registeredState = await admin.query<{
      file_id: string;
      consumed_at: Date;
      registered_file_id: string;
    }>(
      `SELECT l.file_id, l.consumed_at, f.id AS registered_file_id
         FROM app.file_upload_leases AS l
         JOIN app.files AS f
           ON f.id = l.file_id
          AND f.owner_id = l.owner_id
          AND f.file_key = l.file_key
        WHERE l.file_id = $1
          AND l.owner_id = $2
          AND l.file_key = $3`,
      [fileId, alice, fileKey],
    );
    expect(registeredState.rows).toHaveLength(1);
    expect(registeredState.rows[0]).toMatchObject({
      file_id: fileId,
      registered_file_id: fileId,
    });
    expect(registeredState.rows[0]?.consumed_at).toBeInstanceOf(Date);

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

  it('POST /files 409 without a matching upload lease and writes no file', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const fileId = makeFileId();
    const fileKey = `users/${alice}/scratch/${fileId}.jpg`;

    const res = await app.request('/files', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        scope: 'scratch',
        kind: 'image',
        fileKey,
        sizeBytes: 1,
        contentType: 'image/jpeg',
      }),
    });
    const persisted = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM app.files
        WHERE id = $1 OR file_key = $2`,
      [fileId, fileKey],
    );

    expect.soft(res.status).toBe(409);
    expect.soft(persisted.rows[0]?.count).toBe('0');
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
