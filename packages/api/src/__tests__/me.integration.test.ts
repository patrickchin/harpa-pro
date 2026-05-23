/**
 * Integration tests for /me PATCH + /me/usage. Boots Testcontainers
 * Postgres so the per-request scope path is exercised end-to-end.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { startPg, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import { makeUserId, makeSessionId, makeProjectId, makeReportId, makeNoteId } from './factories/index.js';

let fx: PgFixture;
let alice: string;
let bob: string;
let aliceSid: string;
let bobSid: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  alice = makeUserId();
  bob = makeUserId();
  aliceSid = makeSessionId();
  bobSid = makeSessionId();

  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO auth.users(id, phone, display_name) VALUES ($1, $2, 'Alice'), ($3, $4, 'Bob')`,
    [alice, '+15550300001', bob, '+15550300002'],
  );
  await admin.query(
    `INSERT INTO auth.sessions(id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days'), ($3, $4, now() + interval '7 days')`,
    [aliceSid, alice, bobSid, bob],
  );

  // Seed alice with one project, one report, one voice note in 2026-04
  // and another report in 2026-05; bob with a separate project so that
  // RLS can demonstrate isolation in /me/usage.
  const aliceProj = makeProjectId();
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'A-proj', $2)`,
    [aliceProj, alice],
  );
  const bobProj = makeProjectId();
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'B-proj', $2)`,
    [bobProj, bob],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [aliceProj, alice, bobProj, bob],
  );

  const aliceReport1 = makeReportId();
  await admin.query(
    `INSERT INTO app.reports(id, project_id, author_id, number, created_at) VALUES ($1, $2, $3, 1, '2026-04-15T10:00:00Z')`,
    [aliceReport1, aliceProj, alice],
  );
  await admin.query(
    `INSERT INTO app.reports(id, project_id, author_id, number, created_at) VALUES ($1, $2, $3, 2, '2026-05-02T10:00:00Z')`,
    [makeReportId(), aliceProj, alice],
  );
  await admin.query(
    `INSERT INTO app.notes(id, report_id, author_id, kind, body, created_at) VALUES ($1, $2, $3, 'voice', 'v1', '2026-04-15T10:01:00Z')`,
    [makeNoteId(), aliceReport1, alice],
  );
  await admin.query(
    `INSERT INTO app.notes(id, report_id, author_id, kind, body, created_at) VALUES ($1, $2, $3, 'voice', 'v2', '2026-04-15T10:02:00Z')`,
    [makeNoteId(), aliceReport1, alice],
  );
  await admin.query(
    `INSERT INTO app.notes(id, report_id, author_id, kind, body, created_at) VALUES ($1, $2, $3, 'text', 't1', '2026-04-15T10:03:00Z')`,
    [makeNoteId(), aliceReport1, alice],
  );
  // Bob's data — alice should never see it via /me/usage.
  const bobReport = makeReportId();
  await admin.query(
    `INSERT INTO app.reports(id, project_id, author_id, number, created_at) VALUES ($1, $2, $3, 1, '2026-04-15T10:00:00Z')`,
    [bobReport, bobProj, bob],
  );
  await admin.query(
    `INSERT INTO app.notes(id, report_id, author_id, kind, body) VALUES ($1, $2, $3, 'voice', 'b-voice')`,
    [makeNoteId(), bobReport, bob],
  );

  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('PATCH /me', () => {
  it('updates the caller display_name + company_name', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request('/me', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Alice Anderson', companyName: 'ACME' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { displayName: string; companyName: string } };
    expect(body.user.displayName).toBe('Alice Anderson');
    expect(body.user.companyName).toBe('ACME');
  });

  it('rejects without a bearer token (401)', async () => {
    const app = createApp();
    const res = await app.request('/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'x' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects invalid body (400)', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request('/me', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: '' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /me/usage', () => {
  it('returns alice usage filtered to her own author_id (RLS enforced)', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request('/me/usage', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      months: Array<{ month: string; reports: number; voiceNotes: number }>;
      totals: {
        reports: number;
        voiceNotes: number;
        inputTokens: number;
        outputTokens: number;
        cachedTokens: number;
        calls: number;
      };
      usageTokens: Array<{
        month: string;
        inputTokens: number;
        outputTokens: number;
        cachedTokens: number;
        calls: number;
      }>;
      usageByModel: Array<{
        vendor: string;
        model: string;
        operation: string;
        calls: number;
        inputTokens: number;
        outputTokens: number;
        cachedTokens: number;
      }>;
    };
    expect(body.totals.reports).toBe(2);
    expect(body.totals.voiceNotes).toBe(2);
    expect(body.totals.inputTokens).toBe(0);
    expect(body.totals.outputTokens).toBe(0);
    expect(body.totals.calls).toBe(0);
    expect(Array.isArray(body.usageTokens)).toBe(true);
    expect(Array.isArray(body.usageByModel)).toBe(true);
    const m04 = body.months.find((m) => m.month === '2026-04')!;
    const m05 = body.months.find((m) => m.month === '2026-05')!;
    expect(m04).toEqual({ month: '2026-04', reports: 1, voiceNotes: 2 });
    expect(m05).toEqual({ month: '2026-05', reports: 1, voiceNotes: 0 });
  });

  it('bob sees only his own usage', async () => {
    const app = createApp();
    const token = await signTestToken(bob, bobSid);
    const res = await app.request('/me/usage', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totals: { reports: number; voiceNotes: number; inputTokens: number; outputTokens: number; calls: number } };
    expect(body.totals.reports).toBe(1);
    expect(body.totals.voiceNotes).toBe(1);
    expect(body.totals.calls).toBe(0);
  });

  it('rejects without a bearer token (401)', async () => {
    const app = createApp();
    const res = await app.request('/me/usage');
    expect(res.status).toBe(401);
  });
});
