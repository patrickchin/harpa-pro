/**
 * Default-wiring proof for account-deletion object cleanup.
 *
 * The route runs against real Postgres plus MinIO with
 * `R2_FIXTURE_MODE=live`; no storage collaborator is injected.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import pg from 'pg';

import { startMinio, type MinioFixture } from './helpers/r2-container.js';
import {
  makeFileId,
  makeProjectId,
  makeReportId,
  makeSessionId,
  makeUserId,
} from './factories/index.js';
import { seedAuthUsers, startPg, type PgFixture } from './setup-pg.js';

const ENABLED = process.env.CI_R2_LIVE !== '0';

let pgFx: PgFixture;
let minio: MinioFixture;
let admin: pg.Client;
let app: {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>;
};
let signTestToken: (userId: string, sessionId: string) => Promise<string>;

let alice = '';
let bob = '';
let aliceSid = '';
let soloProject = '';
let soloReport = '';
let sharedProject = '';
let sharedReport = '';
let lateUploadUrl = '';
let lateUploadKey = '';

const keys = {
  avatar: '',
  scratch: '',
  sharedOwned: '',
  scratchOrphan: '',
  soloOrphan: '',
  bobSharedControl: '',
};

beforeAll(async () => {
  if (!ENABLED) return;
  pgFx = await startPg();
  minio = await startMinio('harpa-account-delete');

  process.env.DATABASE_URL = pgFx.url;
  process.env.R2_FIXTURE_MODE = 'live';
  process.env.R2_ACCESS_KEY_ID = minio.accessKeyId;
  process.env.R2_SECRET_ACCESS_KEY = minio.secretAccessKey;
  process.env.R2_ACCOUNT_ID = 'minio-test';
  process.env.R2_ENDPOINT = minio.endpoint;
  process.env.R2_BUCKET = minio.bucket;
  delete process.env.R2_PUBLIC_ENDPOINT;

  vi.resetModules();
  const { getPool, resetPool } = await import('../db/client.js');
  await resetPool();
  getPool(pgFx.url);
  const { createApp } = await import('../app.js');
  ({ signTestToken } = await import('../middleware/auth.js'));
  app = createApp();

  alice = makeUserId();
  bob = makeUserId();
  aliceSid = makeSessionId();
  soloProject = makeProjectId();
  soloReport = makeReportId();
  sharedProject = makeProjectId();
  sharedReport = makeReportId();

  await seedAuthUsers(pgFx.url, [
    { id: alice, email: 'alice-r2-delete@example.com' },
    { id: bob, email: 'bob-r2-keeper@example.com' },
  ]);

  admin = new pg.Client({ connectionString: pgFx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id)
     VALUES ($1, 'Solo cleanup', $3), ($2, 'Shared survives', $3)`,
    [soloProject, sharedProject, alice],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role)
     VALUES
       ($1, $3, 'owner'),
       ($2, $3, 'owner'),
       ($2, $4, 'editor')`,
    [soloProject, sharedProject, alice, bob],
  );
  await admin.query(
    `INSERT INTO app.reports(id, project_id, author_id, number, body)
     VALUES
       ($1, $3, $5, 1, '{"summary":"solo"}'::jsonb),
       ($2, $4, $5, 1, '{"summary":"shared"}'::jsonb)`,
    [soloReport, sharedReport, soloProject, sharedProject, alice],
  );

  const avatarId = makeFileId();
  const scratchId = makeFileId();
  const sharedOwnedId = makeFileId();
  const bobControlId = makeFileId();
  keys.avatar = `users/${alice}/avatar/${avatarId}.jpg`;
  keys.scratch = `users/${alice}/scratch/${scratchId}.m4a`;
  keys.sharedOwned =
    `projects/${sharedProject}/reports/${sharedReport}/${sharedOwnedId}.pdf`;
  keys.scratchOrphan =
    `users/${alice}/scratch/${makeFileId()}.m4a`;
  keys.soloOrphan =
    `projects/${soloProject}/reports/${soloReport}/${makeFileId()}.jpg`;
  keys.bobSharedControl =
    `projects/${sharedProject}/reports/${sharedReport}/${bobControlId}.jpg`;

  await admin.query(
    `INSERT INTO app.files
       (id, owner_id, kind, file_key, size_bytes, content_type, project_id, report_id)
     VALUES
       ($1, $5, 'image', $6, 3, 'image/jpeg', NULL, NULL),
       ($2, $5, 'voice', $7, 3, 'audio/m4a', NULL, NULL),
       ($3, $5, 'document', $8, 3, 'application/pdf', $9, $10),
       ($4, $11, 'image', $12, 3, 'image/jpeg', $9, $10)`,
    [
      avatarId,
      scratchId,
      sharedOwnedId,
      bobControlId,
      alice,
      keys.avatar,
      keys.scratch,
      keys.sharedOwned,
      sharedProject,
      sharedReport,
      bob,
      keys.bobSharedControl,
    ],
  );

  for (const Key of Object.values(keys)) {
    await minio.client.send(
      new PutObjectCommand({
        Bucket: minio.bucket,
        Key,
        Body: new Uint8Array([1, 2, 3]),
      }),
    );
  }
}, 180_000);

afterAll(async () => {
  if (!ENABLED) return;
  await admin?.end();
  const { resetPool } = await import('../db/client.js');
  await resetPool();
  await pgFx?.stop();
  await minio?.stop();
}, 60_000);

async function expectObjectMissing(Key: string): Promise<void> {
  await expect(
    minio.client.send(
      new HeadObjectCommand({ Bucket: minio.bucket, Key }),
    ),
  ).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
}

describe.skipIf(!ENABLED)('DELETE /me R2 lifecycle', () => {
  it('keeps and prunes the exact PDF key when registration fails after a real PUT', async () => {
    await admin.query(
      `CREATE OR REPLACE FUNCTION app.test_fail_pdf_registration()
       RETURNS trigger
       LANGUAGE plpgsql
       AS $$
       BEGIN
         IF NEW.kind = 'pdf' THEN
           RAISE EXCEPTION 'test_pdf_registration_failure';
         END IF;
         RETURN NEW;
       END
       $$;

       CREATE TRIGGER test_fail_pdf_registration
       BEFORE INSERT ON app.files
       FOR EACH ROW
       EXECUTE FUNCTION app.test_fail_pdf_registration()`,
    );

    let orphanKey = '';
    try {
      const token = await signTestToken(alice, aliceSid);
      const response = await app.request(
        `/projects/${sharedProject}/reports/1/pdf`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
        },
      );
      expect(response.status).toBe(500);

      const reservation = await admin.query<{
        file_id: string;
        file_key: string;
      }>(
        `SELECT file_id, file_key
         FROM app.file_upload_leases
         WHERE owner_id = $1
           AND report_id = $2
           AND consumed_at IS NULL`,
        [alice, sharedReport],
      );
      expect(reservation.rows).toHaveLength(1);
      orphanKey = reservation.rows[0]!.file_key;

      const uploaded = await minio.client.send(
        new HeadObjectCommand({
          Bucket: minio.bucket,
          Key: orphanKey,
        }),
      );
      expect(uploaded.ContentType).toBe('application/pdf');
      expect(Number(uploaded.ContentLength)).toBeGreaterThan(0);

      await admin.query(
        `UPDATE app.file_upload_leases
         SET presign_expires_at = now() - interval '31 seconds'
         WHERE file_id = $1`,
        [reservation.rows[0]!.file_id],
      );
      const { pruneExpiredFileUploadLeases } = await import(
        '../services/storage-delete-jobs.js'
      );
      await expect(pruneExpiredFileUploadLeases()).resolves.toMatchObject({
        unconsumedLeasesPruned: 1,
        orphanObjectsDeleted: 1,
      });
      await expectObjectMissing(orphanKey);
    } finally {
      await admin.query(
        `DROP TRIGGER IF EXISTS test_fail_pdf_registration ON app.files;
         DROP FUNCTION IF EXISTS app.test_fail_pdf_registration()`,
      );
      await admin.query(
        `DELETE FROM app.file_upload_leases
         WHERE owner_id = $1
           AND report_id = $2
           AND consumed_at IS NULL`,
        [alice, sharedReport],
      );
    }
  }, 60_000);

  it('deletes exact keys, safe-prefix orphans, and a late PUT without sweeping a shared project', async () => {
    const token = await signTestToken(alice, aliceSid);

    const presignResponse = await app.request('/files/presign', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        scope: 'project',
        projectId: sharedProject,
        reportId: sharedReport,
        kind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: 3,
      }),
    });
    expect(presignResponse.status).toBe(200);
    const presign = (await presignResponse.json()) as {
      uploadUrl: string;
      fileKey: string;
    };
    lateUploadUrl = presign.uploadUrl;
    lateUploadKey = presign.fileKey;

    const response = await app.request('/me', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(204);
    await expectObjectMissing(keys.avatar);
    await expectObjectMissing(keys.scratch);
    await expectObjectMissing(keys.sharedOwned);
    await expectObjectMissing(keys.scratchOrphan);
    await expectObjectMissing(keys.soloOrphan);

    const aliceRows = await admin.query(
      `SELECT id FROM app.files WHERE owner_id = $1`,
      [alice],
    );
    expect(aliceRows.rowCount).toBe(0);

    const latePut = await fetch(lateUploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: new Uint8Array([7, 8, 9]),
    });
    expect(latePut.status).toBe(200);

    const lateObject = await minio.client.send(
      new HeadObjectCommand({
        Bucket: minio.bucket,
        Key: lateUploadKey,
      }),
    );
    expect(Number(lateObject.ContentLength)).toBe(3);

    await admin.query(
      `UPDATE app.storage_delete_jobs
       SET run_after = now(), locked_at = NULL
       WHERE user_id = $1
         AND job_kind = 'account_delete_final'`,
      [alice],
    );
    const { drainStorageDeleteJobs } = await import(
      '../services/storage-delete-jobs.js'
    );
    const drain = await drainStorageDeleteJobs({ maxJobs: 10 });
    expect(drain.failed).toBe(0);
    expect(drain.completed).toBeGreaterThanOrEqual(1);
    await expectObjectMissing(lateUploadKey);

    const bobObject = await minio.client.send(
      new HeadObjectCommand({
        Bucket: minio.bucket,
        Key: keys.bobSharedControl,
      }),
    );
    expect(Number(bobObject.ContentLength)).toBe(3);

    const bobRow = await admin.query(
      `SELECT id FROM app.files WHERE file_key = $1`,
      [keys.bobSharedControl],
    );
    expect(bobRow.rowCount).toBe(1);
  }, 60_000);
});
