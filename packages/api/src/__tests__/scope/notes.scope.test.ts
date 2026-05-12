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
import { signTestToken } from '../../middleware/auth.js';
import { resetPool, getPool } from '../../db/client.js';
import * as schema from '../../db/schema.js';

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
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  const u = await admin.query<{ id: string }>(
    `INSERT INTO auth.users(phone) VALUES ($1), ($2), ($3) RETURNING id`,
    ['+15550900001', '+15550900002', '+15550900003'],
  );
  alice = u.rows[0]!.id;
  bob = u.rows[1]!.id;
  carol = u.rows[2]!.id;
  const s = await admin.query<{ id: string }>(
    `INSERT INTO auth.sessions(user_id, expires_at) VALUES ($1, now() + interval '7 days'), ($2, now() + interval '7 days'), ($3, now() + interval '7 days') RETURNING id`,
    [alice, bob, carol],
  );
  aliceSid = s.rows[0]!.id;
  bobSid = s.rows[1]!.id;
  carolSid = s.rows[2]!.id;
  // Shared project: alice owner, bob editor. Carol is outsider.
  const proj = await admin.query<{ id: string }>(
    `INSERT INTO app.projects(name, owner_id) VALUES ('Shared', $1) RETURNING id`,
    [alice],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'editor')`,
    [proj.rows[0]!.id, alice, bob],
  );
  const r = await admin.query<{ id: string }>(
    `INSERT INTO app.reports(project_id, author_id) VALUES ($1, $2) RETURNING id`,
    [proj.rows[0]!.id, alice],
  );
  sharedReport = r.rows[0]!.id;
  // Bob-only project + report so we have a cross-tenant note for the
  // negative-control check.
  const bobProj = await admin.query<{ id: string }>(
    `INSERT INTO app.projects(name, owner_id) VALUES ('BobOnly', $1) RETURNING id`,
    [bob],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [bobProj.rows[0]!.id, bob],
  );
  const bobReport = await admin.query<{ id: string }>(
    `INSERT INTO app.reports(project_id, author_id) VALUES ($1, $2) RETURNING id`,
    [bobProj.rows[0]!.id, bob],
  );
  // Seed notes.
  const an = await admin.query<{ id: string }>(
    `INSERT INTO app.notes(report_id, author_id, kind, body) VALUES ($1, $2, 'text', 'alice-note') RETURNING id`,
    [sharedReport, alice],
  );
  aliceNote = an.rows[0]!.id;
  const bn = await admin.query<{ id: string }>(
    `INSERT INTO app.notes(report_id, author_id, kind, body) VALUES ($1, $2, 'text', 'bob-only') RETURNING id`,
    [bobReport.rows[0]!.id, bob],
  );
  bobOnlyNote = bn.rows[0]!.id;
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: notes', () => {
  it('member bob can see alice note in shared report', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/reports/${sharedReport}/notes`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items.find((n) => n.id === aliceNote)).toBeTruthy();
  });

  it('non-member carol cannot list notes (404 on report)', async () => {
    const app = createApp();
    const tok = await signTestToken(carol, carolSid);
    const res = await app.request(`/reports/${sharedReport}/notes`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(404);
  });

  it('paired — bob cannot PATCH alice note (author-only RLS denies)', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
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
    const tok = await signTestToken(carol, carolSid);
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
