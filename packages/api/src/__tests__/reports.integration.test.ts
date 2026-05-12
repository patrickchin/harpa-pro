/**
 * Integration tests for /projects/:id/reports + /reports/:reportId.
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
let aliceProj: string;
let bobProj: string;

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
    ['+15550600001', '+15550600002'],
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
  aliceProj = ap.rows[0]!.id;
  const bp = await admin.query<{ id: string }>(
    `INSERT INTO app.projects(name, owner_id) VALUES ('B', $1) RETURNING id`,
    [bob],
  );
  bobProj = bp.rows[0]!.id;
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [aliceProj, alice, bobProj, bob],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

const headers = (tok: string) => ({ authorization: `Bearer ${tok}`, 'content-type': 'application/json' });

describe('reports CRUD', () => {
  let aliceReport: string;

  it('POST creates a draft report under alice project', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProj}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ visitDate: '2026-05-12T08:00:00.000Z' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string; projectId: string };
    expect(body.status).toBe('draft');
    expect(body.projectId).toBe(aliceProj);
    aliceReport = body.id;
  });

  it('POST 404 when caller is not member of the project', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/projects/${aliceProj}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it('POST 401 without auth', async () => {
    const app = createApp();
    const res = await app.request(`/projects/${aliceProj}/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it('POST 400 on invalid visitDate', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProj}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ visitDate: 'not-a-date' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET list under project', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProj}/reports?limit=10`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items.find((r) => r.id === aliceReport)).toBeTruthy();
  });

  it('GET list 404 when not member', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/projects/${aliceProj}/reports`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(404);
  });

  it('GET /reports/:id returns the report', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${aliceReport}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(aliceReport);
  });

  it('GET /reports/:id 404 for non-member', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/reports/${aliceReport}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(404);
  });

  it('PATCH updates visitDate', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${aliceReport}`, {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ visitDate: '2026-06-01T10:00:00.000Z' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { visitDate: string };
    expect(body.visitDate).toBe('2026-06-01T10:00:00.000Z');
  });

  it('PATCH can clear visitDate (null)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${aliceReport}`, {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ visitDate: null }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { visitDate: string | null };
    expect(body.visitDate).toBeNull();
  });

  it('DELETE returns 204 then GET returns 404', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const del = await app.request(`/reports/${aliceReport}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(del.status).toBe(204);
    const get = await app.request(`/reports/${aliceReport}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(get.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// P1.7 — generate / regenerate / finalize / pdf
//
// All four endpoints run against @harpa/ai-fixtures replay (no real provider,
// no R2). Tests share one report row so state transitions chain naturally:
//
//   draft (no body) → generate → draft (full body)
//                   → regenerate (incomplete fixture) → draft (sparse body)
//                   → pdf → signed URL (body untouched)
//                   → finalize → finalized
//                   → regenerate → 409
// ---------------------------------------------------------------------------
describe('reports AI/PDF', () => {
  let reportId: string;

  beforeAll(async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProj}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ visitDate: '2026-05-12T08:00:00.000Z' }),
    });
    expect(res.status).toBe(201);
    reportId = ((await res.json()) as { id: string }).id;
  });

  it('POST /reports/:id/generate returns the recorded full body', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${reportId}/generate`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: { status: string; body: { workers: unknown[]; weather: unknown }; generatedAt: string | null };
    };
    expect(body.report.status).toBe('draft');
    expect(body.report.body).toBeTruthy();
    expect(body.report.body.weather).toBeTruthy();
    expect(body.report.body.workers.length).toBeGreaterThan(0);
    expect(body.report.generatedAt).not.toBeNull();
  });

  it('POST /reports/:id/regenerate replaces body with the named fixture', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${reportId}/regenerate`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fixtureName: 'generate-report.incomplete' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: { body: { workers: unknown[]; summarySections: { title: string }[] } };
    };
    expect(body.report.body.workers).toEqual([]);
    expect(body.report.body.summarySections[0]?.title).toBe('Notes captured');
  });

  it('POST /reports/:id/pdf returns a signed URL pointing at the rendered key', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${reportId}/pdf`, {
      method: 'POST',
      headers: headers(tok),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; expiresAt: string };
    // FixtureStorage builds keys as users/<userId>/pdf/<uuid>.pdf — the
    // signed GET URL must reflect that server-built prefix (no client input).
    expect(body.url).toContain(encodeURIComponent(`users/${alice}/pdf/`));
    expect(body.url).toContain('.pdf');
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('POST /reports/:id/finalize freezes the report', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${reportId}/finalize`, {
      method: 'POST',
      headers: headers(tok),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { status: string; finalizedAt: string | null } };
    expect(body.report.status).toBe('finalized');
    expect(body.report.finalizedAt).not.toBeNull();
  });

  it('POST /reports/:id/finalize is idempotent (200 on already-finalized)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${reportId}/finalize`, {
      method: 'POST',
      headers: headers(tok),
    });
    expect(res.status).toBe(200);
  });

  it('POST /reports/:id/regenerate 409 once finalized', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${reportId}/regenerate`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });

  it('POST /reports/:id/finalize 409 when report has no body', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    // Fresh draft, never generated.
    const created = await app.request(`/projects/${aliceProj}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    const empty = ((await created.json()) as { id: string }).id;
    const res = await app.request(`/reports/${empty}/finalize`, {
      method: 'POST',
      headers: headers(tok),
    });
    expect(res.status).toBe(409);
  });

  it('POST /reports/:id/pdf 409 when report has no body', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const created = await app.request(`/projects/${aliceProj}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    const empty = ((await created.json()) as { id: string }).id;
    const res = await app.request(`/reports/${empty}/pdf`, {
      method: 'POST',
      headers: headers(tok),
    });
    expect(res.status).toBe(409);
  });

  it('all four endpoints 401 without auth', async () => {
    const app = createApp();
    for (const path of ['generate', 'regenerate', 'finalize', 'pdf']) {
      const res = await app.request(`/reports/${reportId}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(401);
    }
  });

  it('all four endpoints 404 on unknown reportId', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const missing = '00000000-0000-0000-0000-000000000000';
    for (const path of ['generate', 'regenerate', 'finalize', 'pdf']) {
      const res = await app.request(`/reports/${missing}/${path}`, {
        method: 'POST',
        headers: headers(tok),
        body: '{}',
      });
      expect(res.status).toBe(404);
    }
  });

  it('generate 400 rejects path-traversal-shaped fixtureName at the contract boundary', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${reportId}/generate`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fixtureName: '../../../etc/passwd' }),
    });
    expect(res.status).toBe(400);
  });

  it('generate 502 with code=ai_provider_error on unknown fixtureName (no provider/fixture leak)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    // Need a fresh draft (current `reportId` is finalized; would 409).
    const created = await app.request(`/projects/${aliceProj}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    const fresh = ((await created.json()) as { id: string }).id;
    const res = await app.request(`/reports/${fresh}/generate`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fixtureName: 'generate-report.does-not-exist' }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('ai_provider_error');
    expect(body.error.message).not.toContain('does-not-exist');
    expect(body.error.message).not.toContain('fixture');
    expect(body.error.message).not.toContain('openai');
  });
});
