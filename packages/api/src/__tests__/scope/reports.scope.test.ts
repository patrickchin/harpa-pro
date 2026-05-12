/**
 * Scope test for reports — paired own/cross + negative-control.
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
let aliceSid: string;
let bobSid: string;
let aliceReport: string;
let bobReport: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  const u = await admin.query<{ id: string }>(
    `INSERT INTO auth.users(phone) VALUES ($1), ($2) RETURNING id`,
    ['+15550700001', '+15550700002'],
  );
  alice = u.rows[0]!.id;
  bob = u.rows[1]!.id;
  const s = await admin.query<{ id: string }>(
    `INSERT INTO auth.sessions(user_id, expires_at) VALUES ($1, now() + interval '7 days'), ($2, now() + interval '7 days') RETURNING id`,
    [alice, bob],
  );
  aliceSid = s.rows[0]!.id;
  bobSid = s.rows[1]!.id;
  const ap = await admin.query<{ id: string }>(
    `INSERT INTO app.projects(name, owner_id) VALUES ('A', $1) RETURNING id`,
    [alice],
  );
  const aliceProj = ap.rows[0]!.id;
  const bp = await admin.query<{ id: string }>(
    `INSERT INTO app.projects(name, owner_id) VALUES ('B', $1) RETURNING id`,
    [bob],
  );
  const bobProj = bp.rows[0]!.id;
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [aliceProj, alice, bobProj, bob],
  );
  const ar = await admin.query<{ id: string }>(
    `INSERT INTO app.reports(project_id, author_id) VALUES ($1, $2) RETURNING id`,
    [aliceProj, alice],
  );
  aliceReport = ar.rows[0]!.id;
  const br = await admin.query<{ id: string }>(
    `INSERT INTO app.reports(project_id, author_id) VALUES ($1, $2) RETURNING id`,
    [bobProj, bob],
  );
  bobReport = br.rows[0]!.id;
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: reports', () => {
  it('own — alice GET /reports/:id of her own report → 200', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${aliceReport}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
  });

  it('cross — alice GET /reports/:id of bob → 404', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${bobReport}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(404);
  });

  it('cross write — alice DELETE bob report → 404 (RLS denies); row remains', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${bobReport}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(404);
    const conn = await getPool().connect();
    try {
      const r = await conn.query(`SELECT id FROM app.reports WHERE id = $1`, [bobReport]);
      expect(r.rows.length).toBe(1);
    } finally {
      conn.release();
    }
  });

  it('scope wrapper — direct SELECT under alice scope returns only her report', async () => {
    const ids = await withScopedConnection({ sub: alice, sid: aliceSid }, async (db) => {
      const r = await db.execute<{ id: string }>(sql`SELECT id FROM app.reports`);
      return r.rows.map((row) => row.id);
    });
    expect(ids).toContain(aliceReport);
    expect(ids).not.toContain(bobReport);
  });

  it('negative control — same SELECT WITHOUT scope sees both reports', async () => {
    const conn = await getPool().connect();
    try {
      const r = await drizzle(conn, { schema }).execute(
        sql`SELECT count(*)::int AS count FROM app.reports WHERE id IN (${sql.raw(`'${aliceReport}', '${bobReport}'`)})`,
      );
      const count = Number((r.rows[0] as { count: number }).count);
      expect(count).toBe(2);
    } finally {
      conn.release();
    }
  });
});
