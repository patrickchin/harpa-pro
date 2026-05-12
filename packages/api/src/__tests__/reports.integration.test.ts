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
