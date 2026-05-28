/**
 * Scope test for /files/* — project-scoped membership model (migration 0011).
 *
 * The new RLS layer:
 *   - files_member_read  (SELECT)         : owner OR project member
 *   - files_owner_insert (INSERT)         : owner only
 *   - files_member_write (UPDATE)         : owner OR project member
 *   - files_member_delete (DELETE)        : owner OR project member
 *
 * Personal scopes (avatar / scratch) carry NULL project_id and stay
 * owner-only. Project files become visible + mutable to every member of
 * the attached project.
 *
 * Coverage layout:
 *   - Project P: alice (owner) + bob (editor). carol = non-member.
 *   - Project Q: alice (owner only) — used to drive the "report belongs
 *     to a different project" presign mismatch case.
 *   - Reports R (in P) and R2 (in Q) for the project-scope files.
 *   - Seeded files: project (alice in P), avatar (alice), scratch (alice).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { startPg, type PgFixture } from '../setup-pg.js';
import { createApp } from '../../app.js';
import { withScopedConnection } from '../../db/scope.js';
import { signTestToken } from '../../middleware/auth.js';
import { resetPool, getPool } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import {
  makeUserId,
  makeSessionId,
  makeProjectId,
  makeReportId,
  makeFileId,
} from '../factories/index.js';

let fx: PgFixture;
let alice: string;
let bob: string;
let carol: string;
let aliceSid: string;
let bobSid: string;
let carolSid: string;

let projectP: string;
let projectQ: string;
let reportR: string;
let reportR2: string;

let projectFileAlice: string; // project P, alice owner
let avatarFileAlice: string;  // avatar (NULL project)
let scratchFileAlice: string; // scratch (NULL project)

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  process.env.R2_FIXTURE_MODE = 'replay';
  await resetPool();
  getPool(fx.url);

  alice = makeUserId();
  bob = makeUserId();
  carol = makeUserId();
  aliceSid = makeSessionId();
  bobSid = makeSessionId();
  carolSid = makeSessionId();

  projectP = makeProjectId();
  projectQ = makeProjectId();
  reportR = makeReportId();
  reportR2 = makeReportId();

  projectFileAlice = makeFileId();
  avatarFileAlice = makeFileId();
  scratchFileAlice = makeFileId();

  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO auth.users(id, phone) VALUES ($1, $2), ($3, $4), ($5, $6)`,
    [alice, '+15551300001', bob, '+15551300002', carol, '+15551300003'],
  );
  await admin.query(
    `INSERT INTO auth.sessions(id, user_id, expires_at) VALUES
       ($1, $2, now() + interval '7 days'),
       ($3, $4, now() + interval '7 days'),
       ($5, $6, now() + interval '7 days')`,
    [aliceSid, alice, bobSid, bob, carolSid, carol],
  );

  // Project P: alice owner, bob editor. Carol is outsider.
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'ProjectP', $2)`,
    [projectP, alice],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES
       ($1, $2, 'owner'),
       ($1, $3, 'editor')`,
    [projectP, alice, bob],
  );
  await admin.query(
    `INSERT INTO app.reports(id, project_id, author_id, number) VALUES ($1, $2, $3, 1)`,
    [reportR, projectP, alice],
  );

  // Project Q: alice-only — used to manufacture a cross-project report id
  // that alice CAN see but doesn't belong to project P.
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'ProjectQ', $2)`,
    [projectQ, alice],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [projectQ, alice],
  );
  await admin.query(
    `INSERT INTO app.reports(id, project_id, author_id, number) VALUES ($1, $2, $3, 1)`,
    [reportR2, projectQ, alice],
  );

  // Seed files. file_key shape mirrors what services/storage.ts buildKey
  // would have produced — but the route only re-parses keys on register,
  // never on GET, so any stable string is fine for read-side tests.
  await admin.query(
    `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type, project_id, report_id)
     VALUES ($1, $2, 'voice', $3, 1024, 'audio/m4a', $4, $5)`,
    [
      projectFileAlice,
      alice,
      `projects/${projectP}/reports/${reportR}/${projectFileAlice}.m4a`,
      projectP,
      reportR,
    ],
  );
  await admin.query(
    `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type)
     VALUES ($1, $2, 'image', $3, 2048, 'image/jpeg')`,
    [avatarFileAlice, alice, `users/${alice}/avatar/${avatarFileAlice}.jpg`],
  );
  await admin.query(
    `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type)
     VALUES ($1, $2, 'voice', $3, 1024, 'audio/m4a')`,
    [scratchFileAlice, alice, `users/${alice}/scratch/${scratchFileAlice}.m4a`],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: /files/* (project-scoped permissions)', () => {
  // ---------- READ ----------
  it('owner reads own project file → 200', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/files/${projectFileAlice}/url`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(200);
  });

  it('cross-member read → 200 (bob sees alice file in shared project)', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/files/${projectFileAlice}/url`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(200);
  });

  it('non-member read → 404 (carol cannot see project file)', async () => {
    const app = createApp();
    const tok = await signTestToken(carol, carolSid);
    const res = await app.request(`/files/${projectFileAlice}/url`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(404);
  });

  // ---------- WRITE/DELETE ----------
  it('cross-member DELETE under scoped db: bob can delete alice project file', async () => {
    // No REST endpoint for file deletion yet — exercise the RLS policy
    // directly under bob's scoped connection. files_member_delete must
    // allow it because bob is a member of the file's project.
    const victim = makeFileId();
    const conn = await getPool().connect();
    try {
      await conn.query(
        `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type, project_id, report_id)
         VALUES ($1, $2, 'image', $3, 100, 'image/jpeg', $4, $5)`,
        [victim, alice, `projects/${projectP}/reports/${reportR}/${victim}.jpg`, projectP, reportR],
      );
    } finally {
      conn.release();
    }
    const deleted = await withScopedConnection({ sub: bob, sid: bobSid }, async (db) => {
      const r = await db.execute<{ id: string }>(
        sql`DELETE FROM app.files WHERE id = ${victim} RETURNING id`,
      );
      return r.rows.length;
    });
    expect(deleted).toBe(1);
  });

  it('non-member DELETE under scoped db: carol cannot delete alice project file', async () => {
    const victim = makeFileId();
    const conn = await getPool().connect();
    try {
      await conn.query(
        `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type, project_id, report_id)
         VALUES ($1, $2, 'image', $3, 100, 'image/jpeg', $4, $5)`,
        [victim, alice, `projects/${projectP}/reports/${reportR}/${victim}.jpg`, projectP, reportR],
      );
    } finally {
      conn.release();
    }
    const deleted = await withScopedConnection({ sub: carol, sid: carolSid }, async (db) => {
      const r = await db.execute<{ id: string }>(
        sql`DELETE FROM app.files WHERE id = ${victim} RETURNING id`,
      );
      return r.rows.length;
    });
    expect(deleted).toBe(0);
    // Confirm row still exists under the admin pool.
    const conn2 = await getPool().connect();
    try {
      const r = await conn2.query<{ id: string }>(`SELECT id FROM app.files WHERE id = $1`, [victim]);
      expect(r.rows).toHaveLength(1);
    } finally {
      conn2.release();
    }
  });

  // ---------- PERSONAL SCOPES STAY OWNER-ONLY ----------
  it('avatar (project_id NULL) stays owner-only — bob (project mate) cannot see it', async () => {
    const ids = await withScopedConnection({ sub: bob, sid: bobSid }, async (db) => {
      const r = await db.execute<{ id: string }>(
        sql`SELECT id FROM app.files WHERE id = ${avatarFileAlice}`,
      );
      return r.rows.map((row) => row.id);
    });
    expect(ids).not.toContain(avatarFileAlice);
    // And it's NOT bob-readable via the route either.
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/files/${avatarFileAlice}/url`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(404);
  });

  it('scratch (project_id NULL) stays owner-only — bob cannot see it', async () => {
    const ids = await withScopedConnection({ sub: bob, sid: bobSid }, async (db) => {
      const r = await db.execute<{ id: string }>(
        sql`SELECT id FROM app.files WHERE id = ${scratchFileAlice}`,
      );
      return r.rows.map((row) => row.id);
    });
    expect(ids).not.toContain(scratchFileAlice);
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/files/${scratchFileAlice}/url`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(404);
  });

  // ---------- PRESIGN ----------
  it('presign scope=project requires membership (carol → 404)', async () => {
    const app = createApp();
    const tok = await signTestToken(carol, carolSid);
    const res = await app.request('/files/presign', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        scope: 'project',
        projectId: projectP,
        reportId: reportR,
        kind: 'voice',
        contentType: 'audio/m4a',
        sizeBytes: 1024,
      }),
    });
    expect(res.status).toBe(404);
  });

  it('presign scope=project rejects report from another project (alice, P + R2) → 404', async () => {
    // Alice is a member of BOTH P and Q, so the project-membership
    // check passes; the route then asserts report.projectId === body.projectId
    // which catches this mismatch.
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/files/presign', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        scope: 'project',
        projectId: projectP,
        reportId: reportR2, // belongs to Q
        kind: 'voice',
        contentType: 'audio/m4a',
        sizeBytes: 1024,
      }),
    });
    expect(res.status).toBe(404);
  });

  it('presign scope=avatar rejects non-image content-type → 400', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/files/presign', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        scope: 'avatar',
        contentType: 'application/pdf',
        sizeBytes: 1024,
      }),
    });
    expect(res.status).toBe(400);
  });

  it('presign scope=project mints a key under projects/<projectId>/reports/<reportId>/', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/files/presign', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        scope: 'project',
        projectId: projectP,
        reportId: reportR,
        kind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: 4096,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { fileKey: string };
    expect(body.fileKey.startsWith(`projects/${projectP}/reports/${reportR}/`)).toBe(true);
  });

  // ---------- REGISTER ----------
  it('register: claimed scope must match key prefix (project key + avatar body → 400)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const ps = await app.request('/files/presign', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        scope: 'project',
        projectId: projectP,
        reportId: reportR,
        kind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: 4096,
      }),
    });
    expect(ps.status).toBe(200);
    const { fileKey } = (await ps.json()) as { fileKey: string };

    const res = await app.request('/files', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        scope: 'avatar',
        fileKey,
        sizeBytes: 4096,
        contentType: 'image/jpeg',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('register: project key ids must match body ids (project Q reportId in P body → 400)', async () => {
    // Forge a key string with mismatched ids (using a valid prj_/rpt_/fil_
    // triple so parseKeyScope succeeds and the id-mismatch branch fires).
    const forged = `projects/${projectQ}/reports/${reportR2}/${makeFileId()}.jpg`;
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/files', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        scope: 'project',
        projectId: projectP,
        reportId: reportR,
        kind: 'image',
        fileKey: forged,
        sizeBytes: 1,
        contentType: 'image/jpeg',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('register: scratch key under another user prefix → 400 (prefix-spoof)', async () => {
    const forged = `users/${bob}/scratch/${makeFileId()}.m4a`;
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/files', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        scope: 'scratch',
        kind: 'voice',
        fileKey: forged,
        sizeBytes: 1,
        contentType: 'audio/m4a',
      }),
    });
    expect(res.status).toBe(400);
  });

  // ---------- NEGATIVE CONTROL ----------
  it('negative control — direct unscoped SELECT sees ALL files (RLS bypassed by superuser)', async () => {
    const conn = await getPool().connect();
    try {
      const r = await drizzle(conn, { schema }).execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM app.files
            WHERE id IN (${projectFileAlice}, ${avatarFileAlice}, ${scratchFileAlice})`,
      );
      const count = Number(r.rows[0]!.count);
      expect(count).toBe(3);
    } finally {
      conn.release();
    }
  });
});
