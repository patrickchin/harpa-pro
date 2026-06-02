/**
 * Integration tests for /me PATCH + /me/usage. Boots Testcontainers
 * Postgres so the per-request scope path is exercised end-to-end.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { startPg, seedAuthUsers, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import { makeUserId, makeSessionId, makeProjectId, makeReportId, makeNoteId } from './factories/index.js';
import { newId } from '../lib/ids.js';

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

  await seedAuthUsers(fx.url, [
    { id: alice, displayName: 'Alice' },
    { id: bob, displayName: 'Bob' },
  ]);

  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();

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

  // Seed llm_usage_events: 3 chat rows + 1 transcribe row + 1 error row for
  // alice, and 1 chat row for bob (RLS isolation check). Distinct
  // created_at values so cursor ordering is deterministic.
  const aliceEvents: Array<[string, string, string, number, number, number, number | null, 'ok' | 'error']> = [
    // [created_at,                vendor,   model,           in,  out, cached, seconds, status]
    ['2026-05-01T10:00:00Z', 'openai', 'gpt-4o-mini',   100, 50, 10, null, 'ok'],
    ['2026-05-02T10:00:00Z', 'openai', 'gpt-4o-mini',   200, 80, 20, null, 'ok'],
    ['2026-05-03T10:00:00Z', 'kimi',   'moonshot-v1-8k', 50, 30, 0,  null, 'ok'],
    ['2026-05-04T10:00:00Z', 'openai', 'whisper-1',       0,  0, 0,  12.5, 'ok'],
    ['2026-05-05T10:00:00Z', 'openai', 'gpt-4o-mini',     0,  0, 0,  null, 'error'],
  ];
  for (const [createdAt, vendor, model, inTok, outTok, cached, seconds, status] of aliceEvents) {
    const op = vendor === 'openai' && model === 'whisper-1' ? 'transcribe' : 'chat';
    await admin.query(
      `INSERT INTO app.llm_usage_events
         (id, user_id, vendor, model, operation,
          input_tokens, output_tokens, cached_tokens, input_seconds,
          latency_ms, fixture_mode, status, created_at)
       VALUES ($1, $2, $3, $4, $5::app.llm_operation,
               $6, $7, $8, $9,
               42, 'replay', $10::app.llm_usage_status, $11::timestamptz)`,
      [newId('lue'), alice, vendor, model, op, inTok, outTok, cached, seconds, status, createdAt],
    );
  }
  await admin.query(
    `INSERT INTO app.llm_usage_events
       (id, user_id, vendor, model, operation,
        input_tokens, output_tokens, cached_tokens, input_seconds,
        latency_ms, fixture_mode, status, created_at)
     VALUES ($1, $2, 'openai', 'gpt-4o-mini', 'chat'::app.llm_operation,
             999, 999, 0, NULL, 1, 'replay', 'ok'::app.llm_usage_status,
             '2026-05-10T10:00:00Z'::timestamptz)`,
    [newId('lue'), bob],
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
    // 3 ok chat rows (100/50/10 + 200/80/20 + 50/30/0) + 1 ok transcribe
    // (zero tokens, 12.5s). Error row excluded from totals.
    expect(body.totals.inputTokens).toBe(350);
    expect(body.totals.outputTokens).toBe(160);
    expect(body.totals.cachedTokens).toBe(30);
    expect(body.totals.calls).toBe(4);
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
    expect(body.totals.inputTokens).toBe(999);
    expect(body.totals.outputTokens).toBe(999);
    expect(body.totals.calls).toBe(1);
  });

  it('rejects without a bearer token (401)', async () => {
    const app = createApp();
    const res = await app.request('/me/usage');
    expect(res.status).toBe(401);
  });
});

describe('GET /me/usage/events', () => {
  type EventItem = {
    id: string;
    createdAt: string;
    vendor: string;
    model: string;
    operation: 'chat' | 'transcribe' | 'generate_report';
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    inputSeconds: number | null;
    latencyMs: number;
    fixtureMode: 'live' | 'replay' | 'record';
    status: 'ok' | 'error';
    projectId: string | null;
    reportId: string | null;
  };

  it('returns alice events newest-first, includes ok + error rows', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request('/me/usage/events', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: EventItem[]; nextCursor: string | null };
    expect(body.items).toHaveLength(5);
    expect(body.nextCursor).toBeNull();
    // Newest first.
    expect(body.items[0]?.createdAt).toBe('2026-05-05T10:00:00.000Z');
    expect(body.items[0]?.status).toBe('error');
    expect(body.items[4]?.createdAt).toBe('2026-05-01T10:00:00.000Z');
    // Transcribe row shape: zero tokens, non-null inputSeconds.
    const transcribe = body.items.find((e) => e.operation === 'transcribe')!;
    expect(transcribe.inputTokens).toBe(0);
    expect(transcribe.outputTokens).toBe(0);
    expect(transcribe.inputSeconds).toBe(12.5);
    // Chat row shape: non-zero tokens, null inputSeconds.
    const chat = body.items.find((e) => e.operation === 'chat' && e.status === 'ok')!;
    expect(chat.inputSeconds).toBeNull();
    expect(chat.inputTokens).toBeGreaterThan(0);
  });

  it('isolates rows by RLS — alice never sees bob events', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request('/me/usage/events?limit=200', { headers: { authorization: `Bearer ${token}` } });
    const body = (await res.json()) as { items: EventItem[] };
    expect(body.items.every((e) => e.inputTokens !== 999)).toBe(true);
  });

  it('paginates with cursor', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const page1 = await app.request('/me/usage/events?limit=2', { headers: { authorization: `Bearer ${token}` } });
    const b1 = (await page1.json()) as { items: EventItem[]; nextCursor: string | null };
    expect(b1.items).toHaveLength(2);
    expect(b1.nextCursor).not.toBeNull();
    const page2 = await app.request(`/me/usage/events?limit=2&cursor=${encodeURIComponent(b1.nextCursor!)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const b2 = (await page2.json()) as { items: EventItem[]; nextCursor: string | null };
    expect(b2.items).toHaveLength(2);
    // No id overlap across pages.
    const ids1 = new Set(b1.items.map((e) => e.id));
    expect(b2.items.every((e) => !ids1.has(e.id))).toBe(true);
  });

  it('filters by operation=transcribe', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request('/me/usage/events?operation=transcribe', { headers: { authorization: `Bearer ${token}` } });
    const body = (await res.json()) as { items: EventItem[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.operation).toBe('transcribe');
  });

  it('filters by vendor=kimi', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request('/me/usage/events?vendor=kimi', { headers: { authorization: `Bearer ${token}` } });
    const body = (await res.json()) as { items: EventItem[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.vendor).toBe('kimi');
  });

  it('rejects an invalid cursor with 400', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request('/me/usage/events?cursor=not-a-real-cursor', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(400);
  });

  it('rejects without a bearer token (401)', async () => {
    const app = createApp();
    const res = await app.request('/me/usage/events');
    expect(res.status).toBe(401);
  });
});
