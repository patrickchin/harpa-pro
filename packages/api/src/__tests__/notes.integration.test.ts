/**
 * Integration tests for /reports/:reportId/notes + /notes/:noteId.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { startPg, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';

let fx: PgFixture;
let alice: string;
let bob: string;
let aliceSid: string;
let bobSid: string;
let report: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  const u = await admin.query<{ id: string }>(
    `INSERT INTO auth.users(phone) VALUES ($1), ($2) RETURNING id`,
    ['+15550800001', '+15550800002'],
  );
  alice = u.rows[0]!.id;
  bob = u.rows[1]!.id;
  const s = await admin.query<{ id: string }>(
    `INSERT INTO auth.sessions(user_id, expires_at) VALUES ($1, now() + interval '7 days'), ($2, now() + interval '7 days') RETURNING id`,
    [alice, bob],
  );
  aliceSid = s.rows[0]!.id;
  bobSid = s.rows[1]!.id;
  const proj = await admin.query<{ id: string }>(
    `INSERT INTO app.projects(name, owner_id) VALUES ('NotesProj', $1) RETURNING id`,
    [alice],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [proj.rows[0]!.id, alice],
  );
  const r = await admin.query<{ id: string }>(
    `INSERT INTO app.reports(project_id, author_id) VALUES ($1, $2) RETURNING id`,
    [proj.rows[0]!.id, alice],
  );
  report = r.rows[0]!.id;
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

const headers = (tok: string) => ({ authorization: `Bearer ${tok}`, 'content-type': 'application/json' });

describe('notes CRUD', () => {
  let noteId: string;

  it('POST creates a text note and bumps notes_since_last_generation', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const before = await getPool().connect();
    let beforeCount = 0;
    try {
      const r = await before.query<{ n: number }>(
        `SELECT notes_since_last_generation AS n FROM app.reports WHERE id = $1`,
        [report],
      );
      beforeCount = Number(r.rows[0]?.n ?? 0);
    } finally {
      before.release();
    }
    const res = await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ kind: 'text', body: 'first observation' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; kind: string; body: string; authorId: string };
    expect(body.kind).toBe('text');
    expect(body.body).toBe('first observation');
    expect(body.authorId).toBe(alice);
    noteId = body.id;

    const after = await getPool().connect();
    try {
      const r = await after.query<{ n: number }>(
        `SELECT notes_since_last_generation AS n FROM app.reports WHERE id = $1`,
        [report],
      );
      expect(Number(r.rows[0]?.n)).toBe(beforeCount + 1);
    } finally {
      after.release();
    }
  });

  it('POST 404 when caller cannot see the report', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ kind: 'text', body: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST 401 without auth', async () => {
    const app = createApp();
    const res = await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'text', body: 'x' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST 400 on invalid kind', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ kind: 'bogus' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET timeline list returns notes ascending', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    // Add a second note so we can verify ordering.
    await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ kind: 'text', body: 'second' }),
    });
    const res = await app.request(`/reports/${report}/notes`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ body: string | null }> };
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    expect(body.items[0]!.body).toBe('first observation');
  });

  it('PATCH updates body for the author', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/notes/${noteId}`, {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ body: 'updated text' }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { body: string }).body).toBe('updated text');
  });

  it('DELETE returns 204 then list no longer contains it', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const del = await app.request(`/notes/${noteId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(del.status).toBe(204);
    const list = await app.request(`/reports/${report}/notes`, { headers: { authorization: `Bearer ${tok}` } });
    const body = (await list.json()) as { items: Array<{ id: string }> };
    expect(body.items.find((n) => n.id === noteId)).toBeFalsy();
  });
});
