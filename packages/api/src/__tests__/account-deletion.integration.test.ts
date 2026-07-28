/**
 * Integration coverage for App Store-compliant in-app account deletion.
 * Exercises the real Hono app + Testcontainers Postgres path so the
 * `/me` scope wrapper, project ownership rules, and better-auth session
 * revocation are verified together.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import { armStorageLifecycleRollout } from '../../scripts/arm-storage-lifecycle-rollout.js';
import { startPg, seedAuthUsers, type PgFixture } from './setup-pg.js';
import {
  makeFileId,
  makeNoteId,
  makeProjectId,
  makeReportId,
  makeSessionId,
  makeUserId,
} from './factories/index.js';
import { newId } from '../lib/ids.js';

let fx: PgFixture;
let admin: pg.Client;

let alice: string;
let bob: string;
let carol: string;
let dave: string;
let aliceSid: string;

let soloProject: string;
let transferProject: string;
let memberProject: string;
let sharedReport: string;

const aliceEmail = 'alice-delete@example.com';
const bobEmail = 'bob-delete@example.com';
const carolEmail = 'carol-delete@example.com';
const daveEmail = 'dave-delete@example.com';

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  alice = makeUserId();
  bob = makeUserId();
  carol = makeUserId();
  dave = makeUserId();
  aliceSid = makeSessionId();

  await seedAuthUsers(fx.url, [
    { id: alice, email: aliceEmail, displayName: 'Alice Delete' },
    { id: bob, email: bobEmail, displayName: 'Bob Keeper' },
    { id: carol, email: carolEmail, displayName: 'Carol Keeper' },
    { id: dave, email: daveEmail, displayName: 'Dave Joiner' },
  ]);

  admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();

  soloProject = makeProjectId();
  transferProject = makeProjectId();
  memberProject = makeProjectId();
  sharedReport = makeReportId();

  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id)
     VALUES
       ($1, 'Solo delete', $4),
       ($2, 'Transfer shared', $4),
       ($3, 'Member only shared', $5)`,
    [soloProject, transferProject, memberProject, alice, bob],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role, joined_at)
     VALUES
       ($1, $4, 'owner', '2026-06-01T10:00:00Z'),
       ($2, $4, 'owner', '2026-06-01T10:00:00Z'),
       ($2, $5, 'editor', '2026-06-01T10:05:00Z'),
       ($2, $6, 'viewer', '2026-06-01T10:10:00Z'),
       ($3, $5, 'owner', '2026-06-01T10:00:00Z'),
       ($3, $4, 'editor', '2026-06-01T10:15:00Z')`,
    [soloProject, transferProject, memberProject, alice, bob, carol],
  );

  await admin.query(
    `INSERT INTO app.reports(id, project_id, author_id, number)
     VALUES ($1, $2, $3, 1)`,
    [sharedReport, transferProject, alice],
  );
  await admin.query(
    `INSERT INTO app.notes(id, report_id, author_id, kind, body)
     VALUES ($1, $2, $3, 'text', 'Shared note stays with project')`,
    [makeNoteId(), sharedReport, alice],
  );

  await admin.query(
    `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type, project_id, report_id)
     VALUES
       ($1, $4, 'image', 'account-delete/personal.jpg', 12, 'image/jpeg', NULL, NULL),
       ($2, $4, 'document', 'account-delete/shared.pdf', 34, 'application/pdf', $5, $6),
       ($3, $7, 'image', 'account-delete/bob.jpg', 56, 'image/jpeg', $5, $6)`,
    [makeFileId(), makeFileId(), makeFileId(), alice, transferProject, sharedReport, bob],
  );

  await admin.query(
    `INSERT INTO app.user_settings(user_id, ai_vendor, ai_model)
     VALUES ($1, 'openai', 'gpt-4o')`,
    [alice],
  );
  await admin.query(
    `INSERT INTO app.llm_usage_events
       (id, user_id, vendor, model, operation, input_tokens, output_tokens,
        cached_tokens, latency_ms, fixture_mode, status)
     VALUES
       ($1, $2, 'openai', 'gpt-4o', 'chat', 10, 5, 0, 100, 'replay', 'ok'),
       ($3, $4, 'openai', 'gpt-4o', 'chat', 20, 10, 0, 100, 'replay', 'ok')`,
    [newId('lue'), alice, newId('lue'), bob],
  );
  await admin.query(
    `INSERT INTO public."account"
       (id, account_id, provider_id, user_id, created_at, updated_at)
     VALUES ($1, $2, 'credential', $3, now(), now())`,
    [newId('idn'), aliceEmail, alice],
  );
  await admin.query(
    `INSERT INTO public."verification"(id, identifier, value, expires_at, created_at, updated_at)
     VALUES ($1, $2, '123456', now() + interval '5 minutes', now(), now())`,
    [newId('vrf'), `sign-in-otp-${aliceEmail}`],
  );
}, 120_000);

afterAll(async () => {
  await admin?.end();
  await fx?.stop();
}, 60_000);

describe('GET /me/deletion-preview', () => {
  it('summarizes projects and personal file rows affected by deletion', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);

    const res = await app.request('/me/deletion-preview', {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      email: string;
      soloProjectsDeleted: Array<{ id: string; name: string }>;
      sharedProjectsTransferred: Array<{
        id: string;
        name: string;
        newOwnerId: string;
        newOwnerEmail: string;
      }>;
      sharedProjectsLeft: Array<{ id: string; name: string }>;
      personalFilesDeleted: number;
    };
    expect(body.email).toBe(aliceEmail);
    expect(body.soloProjectsDeleted).toEqual([
      { id: soloProject, name: 'Solo delete' },
    ]);
    expect(body.sharedProjectsTransferred).toEqual([
      {
        id: transferProject,
        name: 'Transfer shared',
        newOwnerId: bob,
        newOwnerEmail: bobEmail,
      },
    ]);
    expect(body.sharedProjectsLeft).toEqual([
      { id: memberProject, name: 'Member only shared' },
    ]);
    expect(body.personalFilesDeleted).toBe(2);
  });
});

describe('storage lifecycle rollout gate', () => {
  it('arms lease enforcement once without reopening grace on later deploys', async () => {
    await admin.query(
      `UPDATE app.storage_lifecycle_rollout
       SET enforce_after = NULL,
           armed_at = NULL,
           account_delete_enabled = false,
           updated_at = now()
       WHERE singleton`,
    );
    try {
      const first = await armStorageLifecycleRollout({
        databaseUrl: fx.url,
        graceSeconds: 60,
        accountDeleteEnabled: true,
      });
      const second = await armStorageLifecycleRollout({
        databaseUrl: fx.url,
        graceSeconds: 330,
        accountDeleteEnabled: true,
      });
      expect(second.toISOString()).toBe(first.toISOString());
      const state = await admin.query<{
        account_delete_enabled: boolean;
      }>(
        `SELECT account_delete_enabled
         FROM app.storage_lifecycle_rollout
         WHERE singleton`,
      );
      expect(state.rows[0]?.account_delete_enabled).toBe(true);
    } finally {
      await admin.query(
        `UPDATE app.storage_lifecycle_rollout
         SET enforce_after = now(),
             account_delete_enabled = true,
             updated_at = now()
         WHERE singleton`,
      );
    }
  });

  it('fails account deletion closed while legacy presigns may still exist', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    await admin.query(
      `UPDATE app.storage_lifecycle_rollout
       SET enforce_after = NULL,
           account_delete_enabled = false,
           updated_at = now()
       WHERE singleton`,
    );
    try {
      const response = await app.request('/me', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(503);
      const user = await admin.query(
        `SELECT id FROM public."user" WHERE id = $1`,
        [alice],
      );
      expect(user.rowCount).toBe(1);
    } finally {
      await admin.query(
        `UPDATE app.storage_lifecycle_rollout
         SET enforce_after = now(),
             account_delete_enabled = true,
             updated_at = now()
         WHERE singleton`,
      );
    }
  });

  it('keeps deletion disabled when a preview arms leases without a worker', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    await admin.query(
      `UPDATE app.storage_lifecycle_rollout
       SET enforce_after = NULL,
           armed_at = NULL,
           account_delete_enabled = false,
           updated_at = now()
       WHERE singleton`,
    );
    try {
      await armStorageLifecycleRollout({
        databaseUrl: fx.url,
        graceSeconds: 0,
        accountDeleteEnabled: false,
      });
      const enforcement = await admin.query<{
        leases_enforced: boolean;
        account_delete_enabled: boolean;
      }>(
        `SELECT
           app.file_upload_leases_enforced() AS leases_enforced,
           account_delete_enabled
         FROM app.storage_lifecycle_rollout
         WHERE singleton`,
      );
      expect(enforcement.rows[0]).toEqual({
        leases_enforced: true,
        account_delete_enabled: false,
      });

      const response = await app.request('/me', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(503);
    } finally {
      await admin.query(
        `UPDATE app.storage_lifecycle_rollout
         SET enforce_after = now(),
             account_delete_enabled = true,
             updated_at = now()
         WHERE singleton`,
      );
    }
  });
});

describe('account deletion cleanup transaction', () => {
  it('atomically enqueues cleanup and locks membership decisions until commit', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const presign = await app.request('/files/presign', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        scope: 'project',
        projectId: transferProject,
        reportId: sharedReport,
        kind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: 3,
      }),
    });
    expect(presign.status).toBe(200);
    const lease = (await presign.json()) as {
      fileKey: string;
      expiresAt: string;
    };

    const deletion = new pg.Client({ connectionString: fx.url });
    const membershipChange = new pg.Client({ connectionString: fx.url });
    const safetyLeaseId = makeFileId();
    const safetyLeaseKey =
      `users/${alice}/scratch/${safetyLeaseId}.jpg`;
    await deletion.connect();
    await membershipChange.connect();
    try {
      await deletion.query('BEGIN');
      await deletion.query('SET LOCAL ROLE app_authenticated');
      await deletion.query(
        `SELECT set_config('app.user_id', $1, true),
                set_config('app.session_id', $2, true)`,
        [alice, aliceSid],
      );
      // A PUT that began just before signed expiry can finish just after it.
      // Keep leases through the same 30-second safety window used by pruning.
      await deletion.query(
        `INSERT INTO app.file_upload_leases(
           file_id,
           owner_id,
           file_key,
           scope,
           content_type,
           size_bytes,
           presign_expires_at
         )
         VALUES (
           $1,
           $2,
           $3,
           'scratch',
           'image/jpeg',
           3,
           now() - interval '10 seconds'
         )`,
        [safetyLeaseId, alice, safetyLeaseKey],
      );
      await deletion.query(`SELECT app.delete_current_user()`);
      await deletion.query('RESET ROLE');

      const jobs = await deletion.query<{
        job_kind: string;
        run_after: Date;
        payload: {
          userId: string;
          exactKeys: string[];
          sweepPrefixes: string[];
        };
      }>(
        `SELECT job_kind, run_after, payload
         FROM app.storage_delete_jobs
         WHERE user_id = $1
         ORDER BY run_after, job_kind`,
        [alice],
      );
      expect(jobs.rows).toHaveLength(2);
      expect(jobs.rows[0]).toMatchObject({
        job_kind: 'account_delete_initial',
        payload: {
          userId: alice,
          exactKeys: expect.arrayContaining([
            'account-delete/personal.jpg',
            'account-delete/shared.pdf',
            lease.fileKey,
            safetyLeaseKey,
          ]),
          sweepPrefixes: expect.arrayContaining([
            `users/${alice}/avatar/`,
            `users/${alice}/scratch/`,
            `projects/${soloProject}/`,
          ]),
        },
      });
      expect(jobs.rows[0]?.payload.sweepPrefixes).not.toContain(
        `projects/${transferProject}/`,
      );
      expect(jobs.rows[1]).toMatchObject({
        job_kind: 'account_delete_final',
        payload: {
          userId: alice,
          exactKeys: expect.arrayContaining([
            lease.fileKey,
            safetyLeaseKey,
          ]),
          sweepPrefixes: [],
        },
      });
      expect(jobs.rows[1]?.payload.exactKeys).toHaveLength(2);
      expect(jobs.rows[1]!.run_after.getTime()).toBeGreaterThanOrEqual(
        Date.parse(lease.expiresAt) + 30_000,
      );

      const expectMutationBlocked = async (
        query: string,
        parameters: unknown[],
      ): Promise<void> => {
        await membershipChange.query('BEGIN');
        await membershipChange.query('SET LOCAL ROLE app_authenticated');
        await membershipChange.query(
          `SELECT set_config('app.user_id', $1, true),
                  set_config('app.session_id', $2, true)`,
          [alice, makeSessionId()],
        );
        await membershipChange.query(`SET LOCAL lock_timeout = '150ms'`);
        await expect(
          membershipChange.query(query, parameters),
        ).rejects.toMatchObject({ code: '55P03' });
        await membershipChange.query('ROLLBACK');
      };

      await expectMutationBlocked(
        `SELECT app.add_project_member_by_email(
           $1::app.prj_id,
           $2::text,
           'viewer'::app.project_role
         )`,
        [transferProject, daveEmail],
      );
      await expectMutationBlocked(
        `SELECT app.update_member_role(
           $1::app.prj_id,
           $2::app.usr_id,
           'editor'::app.project_role
         )`,
        [transferProject, carol],
      );
      await expectMutationBlocked(
        `SELECT app.remove_project_member(
           $1::app.prj_id,
           $2::app.usr_id
         )`,
        [transferProject, carol],
      );
    } finally {
      await membershipChange.query('ROLLBACK').catch(() => undefined);
      await deletion.query('ROLLBACK').catch(() => undefined);
      await membershipChange.end();
      await deletion.end();
    }

    const membership = await admin.query(
      `SELECT 1
       FROM app.project_members
       WHERE project_id = $1
         AND user_id = $2`,
      [transferProject, carol],
    );
    expect(membership.rowCount).toBe(1);
  });
});

describe('DELETE /me', () => {
  it('deletes the caller account, revokes sessions, and preserves shared projects', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);

    const res = await app.request('/me', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(204);

    const afterMe = await app.request('/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(afterMe.status).toBe(401);

    const users = await admin.query(`SELECT id FROM public."user" WHERE id = $1`, [alice]);
    expect(users.rowCount).toBe(0);
    const sessions = await admin.query(`SELECT id FROM public."session" WHERE user_id = $1`, [alice]);
    expect(sessions.rowCount).toBe(0);
    const accounts = await admin.query(`SELECT id FROM public."account" WHERE user_id = $1`, [alice]);
    expect(accounts.rowCount).toBe(0);
    const settings = await admin.query(`SELECT user_id FROM app.user_settings WHERE user_id = $1`, [alice]);
    expect(settings.rowCount).toBe(0);
    const files = await admin.query(`SELECT id FROM app.files WHERE owner_id = $1`, [alice]);
    expect(files.rowCount).toBe(0);
    const remainingJobs = await admin.query<{ job_kind: string }>(
      `SELECT job_kind
       FROM app.storage_delete_jobs
       WHERE user_id = $1
       ORDER BY job_kind`,
      [alice],
    );
    expect(remainingJobs.rows).toEqual([
      { job_kind: 'account_delete_final' },
    ]);
    const aliceUsage = await admin.query(`SELECT id FROM app.llm_usage_events WHERE user_id = $1`, [alice]);
    expect(aliceUsage.rowCount).toBe(0);
    const aliceVerifications = await admin.query(
      `SELECT id FROM public."verification" WHERE identifier = $1`,
      [`sign-in-otp-${aliceEmail}`],
    );
    expect(aliceVerifications.rowCount).toBe(0);

    const solo = await admin.query(`SELECT id FROM app.projects WHERE id = $1`, [soloProject]);
    expect(solo.rowCount).toBe(0);

    const transfer = await admin.query<{ owner_id: string }>(
      `SELECT owner_id FROM app.projects WHERE id = $1`,
      [transferProject],
    );
    expect(transfer.rows[0]?.owner_id).toBe(bob);
    const transferMembers = await admin.query<{ user_id: string; role: string }>(
      `SELECT user_id, role FROM app.project_members WHERE project_id = $1 ORDER BY joined_at`,
      [transferProject],
    );
    expect(transferMembers.rows).toEqual([
      { user_id: bob, role: 'owner' },
      { user_id: carol, role: 'viewer' },
    ]);

    const memberProjectMembers = await admin.query<{ user_id: string; role: string }>(
      `SELECT user_id, role FROM app.project_members WHERE project_id = $1 ORDER BY joined_at`,
      [memberProject],
    );
    expect(memberProjectMembers.rows).toEqual([{ user_id: bob, role: 'owner' }]);

    const report = await admin.query<{ author_id: string }>(
      `SELECT author_id FROM app.reports WHERE id = $1`,
      [sharedReport],
    );
    expect(report.rows[0]?.author_id).toBe(alice);

    const bobStillExists = await admin.query(`SELECT id FROM public."user" WHERE id = $1`, [bob]);
    expect(bobStillExists.rowCount).toBe(1);
    const bobUsage = await admin.query(`SELECT id FROM app.llm_usage_events WHERE user_id = $1`, [bob]);
    expect(bobUsage.rowCount).toBe(1);
  });
});
