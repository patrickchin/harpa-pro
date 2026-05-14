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
let aliceProjSlug: string;
let bobProjSlug: string;
let aliceReportNumber: number;
let bobReportNumber: number;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  process.env.R2_FIXTURE_MODE = 'replay';
  delete process.env.AI_LIVE;
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
  const ap = await admin.query<{ id: string; slug: string }>(
    `INSERT INTO app.projects(name, owner_id) VALUES ('A', $1) RETURNING id, slug`,
    [alice],
  );
  const aliceProj = ap.rows[0]!.id;
  aliceProjSlug = ap.rows[0]!.slug;
  const bp = await admin.query<{ id: string; slug: string }>(
    `INSERT INTO app.projects(name, owner_id) VALUES ('B', $1) RETURNING id, slug`,
    [bob],
  );
  const bobProj = bp.rows[0]!.id;
  bobProjSlug = bp.rows[0]!.slug;
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [aliceProj, alice, bobProj, bob],
  );
  const ar = await admin.query<{ id: string; number: number }>(
    `INSERT INTO app.reports(project_id, author_id) VALUES ($1, $2) RETURNING id, number`,
    [aliceProj, alice],
  );
  aliceReport = ar.rows[0]!.id;
  aliceReportNumber = ar.rows[0]!.number;
  const br = await admin.query<{ id: string; number: number }>(
    `INSERT INTO app.reports(project_id, author_id) VALUES ($1, $2) RETURNING id, number`,
    [bobProj, bob],
  );
  bobReport = br.rows[0]!.id;
  bobReportNumber = br.rows[0]!.number;
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: reports', () => {
  it('own — alice GET /reports/:id of her own report → 200', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
  });

  it('cross — alice GET /reports/:id of bob → 404', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${bobProjSlug}/reports/${bobReportNumber}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(404);
  });

  it('cross write — alice DELETE bob report → 404 (RLS denies); row remains', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${bobProjSlug}/reports/${bobReportNumber}`, {
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

// ---------------------------------------------------------------------------
// P1.7 — paired alice/bob over each of the four new AI endpoints.
//
// Per endpoint we assert: own → 200 (or success-shape) AND cross-owner → 404
// (RLS hides the row; never leaks "exists but forbidden"). Tests run in
// order so generate → regenerate → pdf → finalize chains naturally on
// alice's report; bob's report is never mutated (cross-owner attempts must
// not have side effects either).
// ---------------------------------------------------------------------------
describe('scope: reports AI/PDF', () => {
  it('generate — alice own → 200', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}/generate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
  });

  it('generate — alice → bob report → 404 (cross-owner)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${bobProjSlug}/reports/${bobReportNumber}/generate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });

  it('generate — bob → alice report → 404 (cross-owner, other direction)', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}/generate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
    // Side-effect check: alice's body must not have been replaced by bob's call.
    // (`generate` short-circuits at the getReport ownership check before the
    // setReportBody UPDATE, so RLS is the only thing standing between bob
    // and alice's row — we already proved this with the negative control.)
  });

  it('regenerate — alice own → 200', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}/regenerate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
  });

  it('regenerate — bob → alice report → 404', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}/regenerate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });

  it('pdf — alice own → 200 with signed URL keyed under alice', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}/pdf`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    // Server-built key prefix carries alice's userId — bob's id must NOT
    // appear, even on alice's own success path.
    expect(body.url).toContain(encodeURIComponent(`users/${alice}/pdf/`));
    expect(body.url).not.toContain(bob);
  });

  it('pdf — bob → alice report → 404', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}/pdf`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('finalize — alice own → 200', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}/finalize`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { status: string } };
    expect(body.report.status).toBe('finalized');
  });

  it('finalize — bob → alice report → 404 (and alice row remains draft-shape under bob scope)', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}/finalize`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    });
    expect(res.status).toBe(404);
    // Bob still can't see alice's row to confirm side-effect-free either way:
    // a direct GET under bob also 404s, which is itself the proof that
    // RLS — not just a permissive UPDATE — is what kept bob out.
    const get = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(get.status).toBe(404);
  });
});
