/**
 * Scope test for /projects — paired own/cross + negative-control.
 * Per docs/v4/arch-auth-and-rls.md §Test gates and Pitfall 6.
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
let aliceProj: string;
let bobProj: string;
let aliceProjSlug: string;
let bobProjSlug: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  const u = await admin.query<{ id: string }>(
    `INSERT INTO auth.users(phone) VALUES ($1), ($2) RETURNING id`,
    ['+15550500001', '+15550500002'],
  );
  alice = u.rows[0]!.id;
  bob = u.rows[1]!.id;
  const s = await admin.query<{ id: string }>(
    `INSERT INTO auth.sessions(user_id, expires_at) VALUES ($1, now() + interval '7 days'), ($2, now() + interval '7 days') RETURNING id`,
    [alice, bob],
  );
  aliceSid = s.rows[0]!.id;
  bobSid = s.rows[1]!.id;

  const ap = await admin.query<{ id: string; slug: string }>(
    `INSERT INTO app.projects(name, owner_id) VALUES ('alice-proj', $1) RETURNING id, slug`,
    [alice],
  );
  aliceProj = ap.rows[0]!.id;
  aliceProjSlug = ap.rows[0]!.slug;
  const bp = await admin.query<{ id: string; slug: string }>(
    `INSERT INTO app.projects(name, owner_id) VALUES ('bob-proj', $1) RETURNING id, slug`,
    [bob],
  );
  bobProj = bp.rows[0]!.id;
  bobProjSlug = bp.rows[0]!.slug;
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [aliceProj, alice, bobProj, bob],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: /projects', () => {
  it('alice GET /projects/:id returns her own project', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; ownerId: string };
    expect(body.id).toBe(aliceProj);
    expect(body.ownerId).toBe(alice);
  });

  it('paired — alice GET /projects/:id of bob returns 404', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${bobProjSlug}`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(404);
  });

  it('paired write — alice cannot DELETE bob project (RLS denies)', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${bobProjSlug}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
    // Confirm bob's project still exists.
    const conn = await getPool().connect();
    try {
      const r = await conn.query<{ id: string }>(`SELECT id FROM app.projects WHERE id = $1`, [bobProj]);
      expect(r.rows.length).toBe(1);
    } finally {
      conn.release();
    }
  });

  it('paired list — alice GET /projects only sees her own row(s)', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request('/projects?limit=100', { headers: { authorization: `Bearer ${token}` } });
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items.find((p) => p.id === aliceProj)).toBeTruthy();
    expect(body.items.find((p) => p.id === bobProj)).toBeFalsy();
  });

  it('scope wrapper — direct SELECT under alice scope returns only her project', async () => {
    const ids = await withScopedConnection({ sub: alice, sid: aliceSid }, async (db) => {
      const r = await db.execute<{ id: string }>(sql`SELECT id FROM app.projects ORDER BY name`);
      return r.rows.map((row) => row.id);
    });
    expect(ids).toEqual([aliceProj]);
  });

  it('negative control — same SELECT WITHOUT scope sees BOTH projects', async () => {
    // Connect as the test (table-owning) user — RLS bypassed. If this saw
    // only one row, the previous tests would tell us nothing about scope.
    const conn = await getPool().connect();
    try {
      const r = await drizzle(conn, { schema }).execute(
        sql`SELECT count(*)::int AS count FROM app.projects WHERE id IN (${sql.raw(`'${aliceProj}', '${bobProj}'`)})`,
      );
      const count = Number((r.rows[0] as { count: number }).count);
      expect(count).toBe(2);
    } finally {
      conn.release();
    }
  });
});
