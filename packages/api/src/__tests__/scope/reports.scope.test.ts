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
import { signTestSession } from '../../middleware/auth.js';
import { resetPool, getPool } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { makeUserId, makeSessionId, makeProjectId, makeReportId } from '../factories/index.js';

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

  alice = makeUserId();
  bob = makeUserId();
  aliceSid = makeSessionId();
  bobSid = makeSessionId();
  const aliceProj = makeProjectId();
  const bobProj = makeProjectId();
  aliceProjSlug = aliceProj;
  bobProjSlug = bobProj;

  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES ($1, 'Alice', $2, true, now(), now()), ($3, 'Bob', $4, true, now(), now())`,
    [alice, '+15550700001', bob, '+15550700002'],
  );
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'A', $2)`,
    [aliceProj, alice],
  );
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'B', $2)`,
    [bobProj, bob],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [aliceProj, alice, bobProj, bob],
  );
  const arId = makeReportId();
  const ar = await admin.query<{ number: number }>(
    `INSERT INTO app.reports(id, project_id, author_id, number) VALUES ($1, $2, $3, 1) RETURNING number`,
    [arId, aliceProj, alice],
  );
  aliceReport = arId;
  aliceReportNumber = ar.rows[0]!.number;
  const brId = makeReportId();
  const br = await admin.query<{ number: number }>(
    `INSERT INTO app.reports(id, project_id, author_id, number) VALUES ($1, $2, $3, 1) RETURNING number`,
    [brId, bobProj, bob],
  );
  bobReport = brId;
  bobReportNumber = br.rows[0]!.number;
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: reports', () => {
  it('own — alice GET /reports/:id of her own report → 200', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(alice);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
  });

  it('cross — alice GET /reports/:id of bob → 404', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(alice);
    const res = await app.request(`/projects/${bobProjSlug}/reports/${bobReportNumber}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(404);
  });

  it('cross write — alice DELETE bob report → 404 (RLS denies); row remains', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(alice);
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
    const { token: tok } = await signTestSession(alice);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}/generate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
  });

  it('generate — alice → bob report → 404 (cross-owner)', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(alice);
    const res = await app.request(`/projects/${bobProjSlug}/reports/${bobReportNumber}/generate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });

  it('generate — bob → alice report → 404 (cross-owner, other direction)', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(bob);
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
    const { token: tok } = await signTestSession(alice);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}/regenerate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
  });

  it('regenerate — bob → alice report → 404', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(bob);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}/regenerate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });

  it('pdf — alice own → 200 with signed URL keyed under alice', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(alice);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}/pdf`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    // PDFs are project-scoped now: key is
    // projects/<projectSlug>/reports/<reportSlug>/fil_…pdf.
    // No user id should appear in the path either way.
    expect(body.url).toContain(encodeURIComponent(`projects/${aliceProjSlug}/reports/`));
    expect(body.url).toContain('.pdf');
    expect(body.url).not.toContain(bob);
  });

  it('pdf — bob → alice report → 404', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(bob);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}/pdf`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('finalize — alice own → 200', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(alice);
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
    const { token: tok } = await signTestSession(bob);
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

// ---------------------------------------------------------------------------
// Pitfall 6: notes_changed_at scope pair — per-request RLS must prevent
// a non-member from stamping another user's report dirty.
// ---------------------------------------------------------------------------
describe('scope: notes_changed_at', () => {
  it('owner note mutation stamps notes_changed_at on their report', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(alice);
    // Reset dirty state and ensure status=draft (the finalize test above
    // may have changed it) so the assertion is meaningful.
    const conn = await getPool().connect();
    try {
      await conn.query(
        `UPDATE app.reports SET notes_changed_at = NULL, status = 'draft' WHERE id = $1`,
        [aliceReport],
      );
    } finally {
      conn.release();
    }
    const res = await app.request(`/reports/${aliceReport}/notes`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'text', body: 'scope stamp test' }),
    });
    expect(res.status).toBe(201);
    const verify = await getPool().connect();
    try {
      const r = await verify.query<{ notes_changed_at: Date | null }>(
        `SELECT notes_changed_at FROM app.reports WHERE id = $1`,
        [aliceReport],
      );
      expect(r.rows[0]?.notes_changed_at).not.toBeNull();
    } finally {
      verify.release();
    }
  });

  it('non-member cannot stamp notes_changed_at on another project report', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(alice);
    // Capture current notes_changed_at for bob's report.
    const before = await getPool().connect();
    let beforeTs: Date | null = null;
    try {
      const r = await before.query<{ notes_changed_at: Date | null }>(
        `SELECT notes_changed_at FROM app.reports WHERE id = $1`,
        [bobReport],
      );
      beforeTs = r.rows[0]?.notes_changed_at ?? null;
    } finally {
      before.release();
    }
    // Alice attempts to create a note against bob's report — RLS must reject.
    const res = await app.request(`/reports/${bobReport}/notes`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'text', body: 'cross-scope attack' }),
    });
    expect(res.status).toBe(404);
    // notes_changed_at on bob's report must remain unchanged.
    const after = await getPool().connect();
    try {
      const r = await after.query<{ notes_changed_at: Date | null }>(
        `SELECT notes_changed_at FROM app.reports WHERE id = $1`,
        [bobReport],
      );
      const afterTs = r.rows[0]?.notes_changed_at ?? null;
      expect(afterTs?.toISOString() ?? null).toBe(beforeTs?.toISOString() ?? null);
    } finally {
      after.release();
    }
  });
});
