/**
 * Scope test for notes — paired own/cross + negative-control + author-only.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { startPg, type PgFixture } from '../setup-pg.js';
import { createApp } from '../../app.js';
import { withScopedConnection } from '../../db/scope.js';
import { signTestSession } from '../../middleware/auth.js';
import { resetPool, getPool } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { makeUserId, makeSessionId, makeProjectId, makeReportId, makeNoteId } from '../factories/index.js';

let fx: PgFixture;
let alice: string;
let bob: string;
let carol: string;
let aliceSid: string;
let bobSid: string;
let carolSid: string;
let sharedReport: string;
let aliceNote: string;
let bobOnlyNote: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  alice = makeUserId();
  bob = makeUserId();
  carol = makeUserId();
  aliceSid = makeSessionId();
  bobSid = makeSessionId();
  carolSid = makeSessionId();

  const sharedProj = makeProjectId();
  sharedReport = makeReportId();
  const bobProj = makeProjectId();
  const bobReport = makeReportId();
  aliceNote = makeNoteId();
  bobOnlyNote = makeNoteId();

  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES ($1, 'Alice', $2, true, now(), now()), ($3, 'Bob', $4, true, now(), now()), ($5, 'Carol', $6, true, now(), now())`,
    [alice, '+15550900001', bob, '+15550900002', carol, '+15550900003'],
  );
  // Shared project: alice owner, bob editor. Carol is outsider.
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'Shared', $2)`,
    [sharedProj, alice],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'editor')`,
    [sharedProj, alice, bob],
  );
  await admin.query(
    `INSERT INTO app.reports(id, project_id, author_id, number) VALUES ($1, $2, $3, 1)`,
    [sharedReport, sharedProj, alice],
  );
  // Bob-only project + report so we have a cross-tenant note for the
  // negative-control check.
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'BobOnly', $2)`,
    [bobProj, bob],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [bobProj, bob],
  );
  await admin.query(
    `INSERT INTO app.reports(id, project_id, author_id, number) VALUES ($1, $2, $3, 1)`,
    [bobReport, bobProj, bob],
  );
  // Seed notes.
  await admin.query(
    `INSERT INTO app.notes(id, report_id, author_id, kind, body) VALUES ($1, $2, $3, 'text', 'alice-note')`,
    [aliceNote, sharedReport, alice],
  );
  await admin.query(
    `INSERT INTO app.notes(id, report_id, author_id, kind, body) VALUES ($1, $2, $3, 'text', 'bob-only')`,
    [bobOnlyNote, bobReport, bob],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: notes', () => {
  it('member bob can see alice note in shared report', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(bob);
    const res = await app.request(`/reports/${sharedReport}/notes`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items.find((n) => n.id === aliceNote)).toBeTruthy();
  });

  it('non-member carol cannot list notes (404 on report)', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(carol);
    const res = await app.request(`/reports/${sharedReport}/notes`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(404);
  });

  it('paired — bob cannot PATCH alice note (author-only RLS denies)', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(bob);
    const res = await app.request(`/notes/${aliceNote}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'hijack' }),
    });
    expect(res.status).toBe(404);
    // Confirm body unchanged.
    const conn = await getPool().connect();
    try {
      const r = await conn.query<{ body: string }>(`SELECT body FROM app.notes WHERE id = $1`, [aliceNote]);
      expect(r.rows[0]?.body).not.toBe('hijack');
    } finally {
      conn.release();
    }
  });

  it('paired — carol cannot DELETE bob-only note (cross-tenant)', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(carol);
    const res = await app.request(`/notes/${bobOnlyNote}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(404);
  });

  it('scope wrapper — direct SELECT under carol scope sees no notes from shared/bob report', async () => {
    const ids = await withScopedConnection({ sub: carol, sid: carolSid }, async (db) => {
      const r = await db.execute<{ id: string }>(sql`SELECT id FROM app.notes`);
      return r.rows.map((row) => row.id);
    });
    expect(ids).not.toContain(aliceNote);
    expect(ids).not.toContain(bobOnlyNote);
  });

  it('negative control — same SELECT WITHOUT scope sees both notes', async () => {
    const conn = await getPool().connect();
    try {
      const r = await drizzle(conn, { schema }).execute(
        sql`SELECT count(*)::int AS count FROM app.notes WHERE id IN (${sql.raw(`'${aliceNote}', '${bobOnlyNote}'`)})`,
      );
      const count = Number((r.rows[0] as { count: number }).count);
      expect(count).toBe(2);
    } finally {
      conn.release();
    }
  });
});
