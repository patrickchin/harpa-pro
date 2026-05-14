/**
 * Scope test for short-URL resolvers — paired own/cross.
 *
 * Per design-p30-ids-slugs.md §5 every new lookup needs paired tests:
 * the caller resolves their OWN slug → 200, then attempts to resolve
 * a CROSS-USER slug → 404. RLS hides the row identically to the
 * "missing" case so 404 is the only observable outcome (Pitfall 6).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { startPg, type PgFixture } from '../setup-pg.js';
import { createApp } from '../../app.js';
import { signTestToken } from '../../middleware/auth.js';
import { resetPool, getPool } from '../../db/client.js';

let fx: PgFixture;
let alice: string;
let bob: string;
let aliceSid: string;
let bobSid: string;
let aliceProjSlug: string;
let bobProjSlug: string;
let aliceReportSlug: string;
let bobReportSlug: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  const u = await admin.query<{ id: string }>(
    `INSERT INTO auth.users(phone) VALUES ($1), ($2) RETURNING id`,
    ['+15551000001', '+15551000002'],
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
  const aliceProj = ap.rows[0]!.id;
  aliceProjSlug = ap.rows[0]!.slug;
  const bp = await admin.query<{ id: string; slug: string }>(
    `INSERT INTO app.projects(name, owner_id) VALUES ('bob-proj', $1) RETURNING id, slug`,
    [bob],
  );
  const bobProj = bp.rows[0]!.id;
  bobProjSlug = bp.rows[0]!.slug;
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [aliceProj, alice, bobProj, bob],
  );

  const ar = await admin.query<{ slug: string }>(
    `INSERT INTO app.reports(project_id, author_id) VALUES ($1, $2) RETURNING slug`,
    [aliceProj, alice],
  );
  aliceReportSlug = ar.rows[0]!.slug;
  const br = await admin.query<{ slug: string }>(
    `INSERT INTO app.reports(project_id, author_id) VALUES ($1, $2) RETURNING slug`,
    [bobProj, bob],
  );
  bobReportSlug = br.rows[0]!.slug;
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: /p/:projectSlug resolver', () => {
  it('own — alice resolves her own project slug → 200', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/p/${aliceProjSlug}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; projectSlug: string };
    expect(body.type).toBe('project');
    expect(body.projectSlug).toBe(aliceProjSlug);
  });

  it('cross — alice resolves bob project slug → 404', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/p/${bobProjSlug}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(404);
  });

  it('cross — bob resolves alice project slug → 404 (other direction)', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/p/${aliceProjSlug}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(404);
  });

  it('401 without auth', async () => {
    const app = createApp();
    const res = await app.request(`/p/${aliceProjSlug}`);
    expect(res.status).toBe(401);
  });
});

describe('scope: /r/:reportSlug resolver', () => {
  it('own — alice resolves her own report slug → 200 with projectSlug + reportNumber', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/r/${aliceReportSlug}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      type: string;
      projectSlug: string;
      reportSlug: string;
      reportNumber: number;
    };
    expect(body.type).toBe('report');
    expect(body.projectSlug).toBe(aliceProjSlug);
    expect(body.reportSlug).toBe(aliceReportSlug);
    expect(body.reportNumber).toBeGreaterThanOrEqual(1);
  });

  it('cross — alice resolves bob report slug → 404', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/r/${bobReportSlug}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(404);
  });

  it('cross — bob resolves alice report slug → 404 (other direction)', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/r/${aliceReportSlug}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(404);
  });

  it('401 without auth', async () => {
    const app = createApp();
    const res = await app.request(`/r/${aliceReportSlug}`);
    expect(res.status).toBe(401);
  });
});
