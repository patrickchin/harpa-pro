import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { getPool, resetPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import {
  drainStorageDeleteJobs,
  getNextStorageDeleteJobWakeAt,
  pruneExpiredFileUploadLeases,
} from '../services/storage-delete-jobs.js';
import type { Storage } from '../services/storage.js';
import {
  makeFileId,
  makeSessionId,
  makeUserId,
} from './factories/index.js';
import { seedAuthUsers, startPg, type PgFixture } from './setup-pg.js';

let fixture: PgFixture;
let admin: pg.Client;
let userId: string;
let sessionId: string;

beforeAll(async () => {
  fixture = await startPg();
  process.env.DATABASE_URL = fixture.url;
  await resetPool();
  getPool(fixture.url);
  userId = makeUserId();
  sessionId = makeSessionId();
  await seedAuthUsers(fixture.url, [{ id: userId }]);
  admin = new pg.Client({ connectionString: fixture.url });
  await admin.connect();
}, 120_000);

afterAll(async () => {
  await admin?.end();
  await fixture?.stop();
}, 60_000);

describe('storage delete job claims', () => {
  it('reports the earliest delayed job wake time', async () => {
    const runAfter = new Date(Date.now() + 120_000);
    await insertDeleteJob('account_delete_final', runAfter);

    const wakeAt = await getNextStorageDeleteJobWakeAt();

    expect(wakeAt).not.toBeNull();
    expect(Math.abs((wakeAt?.getTime() ?? 0) - runAfter.getTime())).toBeLessThan(
      10,
    );
    await admin.query(
      `DELETE FROM app.storage_delete_jobs
       WHERE user_id = $1
         AND job_kind = 'account_delete_final'`,
      [userId],
    );
  });

  it('removes a successfully completed claim from real Postgres', async () => {
    await insertDeleteJob('account_delete_initial');

    await expect(
      drainStorageDeleteJobs({ maxJobs: 1, userId }),
    ).resolves.toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
    });
    expect(
      (
        await admin.query(
          `SELECT 1
           FROM app.storage_delete_jobs
           WHERE user_id = $1
             AND job_kind = 'account_delete_initial'`,
          [userId],
        )
      ).rowCount,
    ).toBe(0);
  });

  it('releases a failed claim with durable retry state', async () => {
    await insertDeleteJob('account_delete_initial');
    const storage = {
      deleteObjects: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
      listPrefix: vi.fn(),
    } as unknown as Storage;

    await expect(
      drainStorageDeleteJobs({ maxJobs: 1, userId, storage }),
    ).resolves.toEqual({
      claimed: 1,
      completed: 0,
      failed: 1,
    });
    const retry = await admin.query<{
      attempt_count: number;
      locked_at: Date | null;
      last_error: string;
      delayed: boolean;
    }>(
      `SELECT
         attempt_count,
         locked_at,
         last_error,
         run_after > now() AS delayed
       FROM app.storage_delete_jobs
       WHERE user_id = $1
         AND job_kind = 'account_delete_initial'`,
      [userId],
    );
    expect(retry.rows[0]).toMatchObject({
      attempt_count: 1,
      locked_at: null,
      delayed: true,
    });
    expect(retry.rows[0]?.last_error).toContain('delete_exact');
    await admin.query(
      `DELETE FROM app.storage_delete_jobs
       WHERE user_id = $1
         AND job_kind = 'account_delete_initial'`,
      [userId],
    );
  });
});

describe('expired upload lease pruning', () => {
  it('drops expired consumed metadata without deleting the registered file', async () => {
    const fileId = makeFileId();
    const fileKey = `users/${userId}/scratch/${fileId}.jpg`;
    await admin.query(
      `INSERT INTO app.files(
         id, owner_id, kind, file_key, size_bytes, content_type
       )
       VALUES ($1, $2, 'image', $3, 3, 'image/jpeg')`,
      [fileId, userId, fileKey],
    );
    await insertExpiredLease({
      fileId,
      fileKey,
      consumed: true,
    });
    const deleteObjects = vi.fn();

    const result = await pruneExpiredFileUploadLeases({
      maxLeases: 10,
      storage: { deleteObjects } as unknown as Storage,
    });

    expect(result.consumedLeasesPruned).toBe(1);
    expect(deleteObjects).not.toHaveBeenCalled();
    expect(
      (
        await admin.query(`SELECT 1 FROM app.files WHERE id = $1`, [
          fileId,
        ])
      ).rowCount,
    ).toBe(1);
  });

  it('locks an expired unconsumed lease until its orphan is deleted', async () => {
    const fileId = makeFileId();
    const fileKey = `users/${userId}/scratch/${fileId}.jpg`;
    await insertExpiredLease({
      fileId,
      fileKey,
      consumed: false,
    });

    let releaseDelete = (): void => {};
    let deletionStarted = (_keys: string[]): void => {};
    const holdDelete = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    const waitForDelete = new Promise<string[]>((resolve) => {
      deletionStarted = resolve;
    });
    const storage = {
      deleteObjects: vi.fn(async (keys: string[]) => {
        deletionStarted(keys);
        await holdDelete;
      }),
    } as unknown as Storage;

    const pruning = pruneExpiredFileUploadLeases({
      maxLeases: 10,
      storage,
    });
    await expect(waitForDelete).resolves.toEqual([fileKey]);

    const app = createApp();
    const token = await signTestToken(userId, sessionId);
    let registrationSettled = false;
    const registration = Promise.resolve(
      app.request('/files', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          scope: 'scratch',
          kind: 'image',
          fileKey,
          sizeBytes: 3,
          contentType: 'image/jpeg',
        }),
      }),
    )
      .finally(() => {
        registrationSettled = true;
      });

    await waitForRegistrationLock();
    expect(registrationSettled).toBe(false);
    releaseDelete();

    await expect(pruning).resolves.toMatchObject({
      unconsumedLeasesPruned: 1,
      orphanObjectsDeleted: 1,
    });
    expect((await registration).status).toBe(409);
    expect(
      (
        await admin.query(
          `SELECT 1
           FROM app.file_upload_leases
           WHERE file_id = $1`,
          [fileId],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await admin.query(`SELECT 1 FROM app.files WHERE id = $1`, [
          fileId,
        ])
      ).rowCount,
    ).toBe(0);
  });

  it('keeps an expired unconsumed lease when object deletion fails', async () => {
    const fileId = makeFileId();
    const fileKey = `users/${userId}/scratch/${fileId}.jpg`;
    await insertExpiredLease({
      fileId,
      fileKey,
      consumed: false,
    });
    const storage = {
      deleteObjects: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
    } as unknown as Storage;

    await expect(
      pruneExpiredFileUploadLeases({ maxLeases: 10, storage }),
    ).rejects.toThrow('R2 unavailable');
    expect(
      (
        await admin.query(
          `SELECT 1
           FROM app.file_upload_leases
           WHERE file_id = $1`,
          [fileId],
        )
      ).rowCount,
    ).toBe(1);
  });
});

async function insertExpiredLease(input: {
  fileId: string;
  fileKey: string;
  consumed: boolean;
}): Promise<void> {
  await admin.query(
    `INSERT INTO app.file_upload_leases(
       file_id,
       owner_id,
       file_key,
       scope,
       content_type,
       size_bytes,
       presign_expires_at,
       consumed_at
     )
     VALUES (
       $1,
       $2,
       $3,
       'scratch',
       'image/jpeg',
       3,
       now() - interval '2 minutes',
       CASE WHEN $4 THEN now() - interval '1 minute' ELSE NULL END
     )`,
    [input.fileId, userId, input.fileKey, input.consumed],
  );
}

async function insertDeleteJob(
  jobKind: 'account_delete_initial' | 'account_delete_final',
  runAfter?: Date,
): Promise<void> {
  await admin.query(
    `INSERT INTO app.storage_delete_jobs(
       user_id,
       job_kind,
       run_after,
       payload
     )
     VALUES (
       $1::app.usr_id,
       $2,
       COALESCE($3::timestamptz, now()),
       jsonb_build_object(
         'userId', ($1::app.usr_id)::text,
         'exactKeys', jsonb_build_array(
           format('users/%s/scratch/orphan.jpg', ($1::app.usr_id)::text)
         ),
         'sweepPrefixes', jsonb_build_array()
       )
     )`,
    [userId, jobKind, runAfter ?? null],
  );
}

async function waitForRegistrationLock(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const waiting = await admin.query<{ waiting: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_stat_activity
         WHERE wait_event_type = 'Lock'
           AND query LIKE '%WITH consumed_lease%'
       ) AS waiting`,
    );
    if (waiting.rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('registration did not block on the claimed lease');
}
