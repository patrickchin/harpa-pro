/**
 * Real-R2 default-wiring test (Pitfall 13 layer 2).
 *
 * Boots MinIO via Testcontainers, repoints `env.R2_*` at it
 * (`R2_FIXTURE_MODE=live`), then drives the real `/files/presign`
 * route, performs the *real* signed PUT against MinIO, and asserts
 * the object lands with the expected Content-Type / Content-Length.
 *
 * The intent is to close the layer-2 trapdoor described in
 * `docs/v4/pitfalls.md#pitfall-13`: every other suite runs through
 * `FixtureStorage`, so `R2Storage` had no integration coverage at
 * all. A regression in `pickStorage()`, `R2Storage.presign()`, or
 * the signed-header policy now fails this test.
 *
 * Heavy by design — spins a fresh MinIO + Postgres container per
 * file. Gated by `CI_R2_LIVE !== '0'`; set `CI_R2_LIVE=0` to skip
 * (CI without docker-in-docker).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pg from 'pg';
import { HeadObjectCommand } from '@aws-sdk/client-s3';

import { startPg, type PgFixture } from './setup-pg.js';
import { startMinio, type MinioFixture } from './helpers/r2-container.js';
import { makeUserId, makeSessionId } from './factories/index.js';

const ENABLED = process.env.CI_R2_LIVE !== '0';

let pgFx: PgFixture;
let minio: MinioFixture;
let alice = '';
let aliceSid = '';
type FetchApp = { request: (path: string, init?: RequestInit) => Promise<Response> };
let app: FetchApp;
let signTestToken: (userId: string, sessionId: string) => Promise<string>;

beforeAll(async () => {
  if (!ENABLED) return;
  pgFx = await startPg();
  minio = await startMinio('harpa-test');

  // Repoint env at MinIO BEFORE reloading any module that imports
  // env.ts. The static `import` at the top of this file already
  // triggered an env.ts parse for the FixtureStorage default, so we
  // must reset and re-import every env-touching module fresh below.
  process.env.DATABASE_URL = pgFx.url;
  process.env.R2_FIXTURE_MODE = 'live';
  process.env.R2_ACCESS_KEY_ID = minio.accessKeyId;
  process.env.R2_SECRET_ACCESS_KEY = minio.secretAccessKey;
  process.env.R2_ACCOUNT_ID = 'minio-test';
  process.env.R2_ENDPOINT = minio.endpoint;
  process.env.R2_BUCKET = minio.bucket;
  delete process.env.R2_PUBLIC_ENDPOINT;

  vi.resetModules();
  const { resetPool, getPool } = await import('../db/client.js');
  await resetPool();
  getPool(pgFx.url);

  alice = makeUserId();
  aliceSid = makeSessionId();
  const admin = new pg.Client({ connectionString: pgFx.url });
  await admin.connect();
  await admin.query(`INSERT INTO auth.users(id, phone) VALUES ($1, $2)`, [alice, '+15551400001']);
  await admin.query(
    `INSERT INTO auth.sessions(id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')`,
    [aliceSid, alice],
  );
  await admin.end();

  // Late, fresh imports so env.ts reparses against the temporary
  // process.env values above. Crucial: the top-level imports captured
  // the boot-time env (default replay → FixtureStorage); dynamic
  // imports under `vi.resetModules()` get the live-mode wiring.
  const { createApp } = await import('../app.js');
  ({ signTestToken } = await import('../middleware/auth.js'));
  app = createApp() as FetchApp;
}, 180_000);

afterAll(async () => {
  if (!ENABLED) return;
  await pgFx?.stop();
  await minio?.stop();
}, 60_000);

const headers = (tok: string) => ({
  authorization: `Bearer ${tok}`,
  'content-type': 'application/json',
});

describe.skipIf(!ENABLED)('/files/* against real MinIO (R2_FIXTURE_MODE=live)', () => {
  it('mints a real signed PUT URL, and the PUT lands with the signed Content-Type/Length', async () => {
    const tok = await signTestToken(alice, aliceSid);
    const body = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]); // tiny "image"
    const contentType = 'image/jpeg';

    const presignRes = await app.request('/files/presign', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        kind: 'image',
        contentType,
        sizeBytes: body.length,
      }),
    });
    expect(presignRes.status).toBe(200);
    const presign = (await presignRes.json()) as {
      uploadUrl: string;
      fileKey: string;
      expiresAt: string;
    };
    expect(presign.fileKey.startsWith(`users/${alice}/image/`)).toBe(true);
    expect(presign.fileKey.endsWith('.jpg')).toBe(true);

    // Real signed PUT. Headers must match what the URL was signed
    // with (Content-Type + Content-Length) or MinIO returns
    // SignatureDoesNotMatch.
    const put = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: {
        'content-type': contentType,
        'content-length': String(body.length),
      },
      body,
    });
    expect(put.status, await put.text()).toBe(200);

    // HEAD the object directly to confirm the bytes landed and the
    // server-side metadata matches what the signed URL declared.
    const head = await minio.client.send(
      new HeadObjectCommand({ Bucket: minio.bucket, Key: presign.fileKey }),
    );
    expect(head.ContentType).toBe(contentType);
    expect(Number(head.ContentLength)).toBe(body.length);
  }, 60_000);

  it('rejects a signed PUT whose Content-Type was swapped after the URL was minted', async () => {
    const tok = await signTestToken(alice, aliceSid);
    const presignRes = await app.request('/files/presign', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        kind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: 4,
      }),
    });
    expect(presignRes.status).toBe(200);
    const presign = (await presignRes.json()) as { uploadUrl: string };

    const tampered = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: {
        // signed for image/jpeg — swap to a doc type
        'content-type': 'application/pdf',
        'content-length': '4',
      },
      body: new Uint8Array([1, 2, 3, 4]),
    });
    // MinIO + R2 both return 403 SignatureDoesNotMatch when a signed
    // header is mutated client-side.
    expect(tampered.status).toBe(403);
  }, 60_000);
});
