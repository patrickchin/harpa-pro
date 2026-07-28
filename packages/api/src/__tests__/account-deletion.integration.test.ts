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
let aliceSid: string;

let soloProject: string;
let transferProject: string;
let memberProject: string;
let sharedReport: string;

const aliceEmail = 'alice-delete@example.com';
const bobEmail = 'bob-delete@example.com';
const carolEmail = 'carol-delete@example.com';

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  alice = makeUserId();
  bob = makeUserId();
  carol = makeUserId();
  aliceSid = makeSessionId();

  await seedAuthUsers(fx.url, [
    { id: alice, email: aliceEmail, displayName: 'Alice Delete' },
    { id: bob, email: bobEmail, displayName: 'Bob Keeper' },
    { id: carol, email: carolEmail, displayName: 'Carol Keeper' },
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
    `INSERT INTO app.activity_events
       (id, event_type, actor_user_id, subject_type, subject_id, project_id,
        dedupe_key, metadata)
     VALUES
       ($1, 'user.signed_up', $2, 'user', $3, NULL, $4, '{"method":"email_otp"}'),
       ($5, 'project.created', $6, 'project', $7, $8, $9, '{}'),
       ($10, 'user.signed_up', $11, 'user', $12, NULL, $13, '{"method":"email_otp"}')`,
    [
      newId('aud'),
      alice,
      alice,
      `user.signed_up:${alice}`,
      newId('aud'),
      alice,
      transferProject,
      transferProject,
      `project.created:${transferProject}`,
      newId('aud'),
      bob,
      bob,
      `user.signed_up:${bob}`,
    ],
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
    const aliceUsage = await admin.query(`SELECT id FROM app.llm_usage_events WHERE user_id = $1`, [alice]);
    expect(aliceUsage.rowCount).toBe(0);
    const aliceActivity = await admin.query<{
      event_type: string;
      actor_user_id: string | null;
      subject_id: string | null;
    }>(
      `SELECT event_type, actor_user_id, subject_id
       FROM app.activity_events
       WHERE dedupe_key IN ($1, $2)
       ORDER BY event_type`,
      [`user.signed_up:${alice}`, `project.created:${transferProject}`],
    );
    expect(aliceActivity.rows).toEqual([
      {
        event_type: 'project.created',
        actor_user_id: null,
        subject_id: transferProject,
      },
      {
        event_type: 'user.signed_up',
        actor_user_id: null,
        subject_id: null,
      },
    ]);
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
    const bobActivity = await admin.query<{
      actor_user_id: string | null;
      subject_id: string | null;
    }>(
      `SELECT actor_user_id, subject_id
       FROM app.activity_events
       WHERE dedupe_key = $1`,
      [`user.signed_up:${bob}`],
    );
    expect(bobActivity.rows).toEqual([{ actor_user_id: bob, subject_id: bob }]);
  });
});
