/**
 * Integration test for GET /admin/waitlist.csv (M1.6).
 * Covers:
 *   - anonymous → 401
 *   - non-admin JWT → 403
 *   - admin JWT → 200 with CSV body containing exactly the expected
 *     rows in created_at order
 *   - CSV escaping (commas, quotes, newlines) in optional fields
 *   - Cache-Control: no-store so signups don't get cached anywhere
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { startPg, type PgFixture } from './setup-pg.js';
import { createApp } from '../app.js';
import { rawDb, resetPool, getPool } from '../db/client.js';
import { signTestSession } from '../middleware/auth.js';
import { makeUserId, makeWaitlistId } from './factories/index.js';

let fx: PgFixture;
let adminId: string;
let regularId: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  adminId = makeUserId();
  regularId = makeUserId();
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO "user"(id, name, email, email_verified, is_admin, created_at, updated_at) VALUES ($1, 'Admin', $2, true, true, now(), now()), ($3, 'Regular', $4, true, false, now(), now())`,
    [adminId, 'admin@example.com', regularId, 'regular@example.com'],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

beforeEach(async () => {
  await rawDb().execute(sql`TRUNCATE app.waitlist_signups`);
});

describe('GET /admin/waitlist.csv', () => {
  it('401 for unauthenticated request', async () => {
    const app = createApp();
    const res = await app.request('/admin/waitlist.csv');
    expect(res.status).toBe(401);
  });

  it('403 for non-admin authenticated request', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(regularId);
    const res = await app.request('/admin/waitlist.csv', {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(403);
  });

  it('200 for admin; returns CSV in created_at order', async () => {
    const [idA, idB] = [makeWaitlistId(), makeWaitlistId()];
    await rawDb().execute(sql`
      INSERT INTO app.waitlist_signups(id, email, company, role, source, created_at)
      VALUES
        (${idA}, 'a@buildco.com', 'BuildCo', 'Foreman', 'twitter', now() - interval '2 days'),
        (${idB}, 'b@buildco.com', NULL,      'Super',   NULL,      now() - interval '1 day')
    `);
    const app = createApp();
    const { token: tok } = await signTestSession(adminId);
    const res = await app.request('/admin/waitlist.csv', {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/csv/);
    expect(res.headers.get('content-disposition')).toMatch(/waitlist\.csv/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.text();
    const lines = body.trim().split('\n');
    expect(lines[0]).toBe('id,email,company,role,source,confirmed_at,created_at');
    expect(lines.length).toBe(3); // header + 2 rows
    // a@ comes first (older created_at)
    expect(lines[1]).toContain('a@buildco.com');
    expect(lines[1]).toContain('BuildCo');
    expect(lines[2]).toContain('b@buildco.com');
    // empty optional fields render as empty cells, not "null"
    expect(lines[2]).not.toMatch(/null/);
  });

  it('properly CSV-escapes commas, quotes, and newlines in optional fields', async () => {
    await rawDb().execute(sql`
      INSERT INTO app.waitlist_signups(id, email, company, role)
      VALUES (${makeWaitlistId()}, 'c@buildco.com', 'Build, Co "Pro"', E'Foreman\nSupervisor')
    `);
    const app = createApp();
    const { token: tok } = await signTestSession(adminId);
    const res = await app.request('/admin/waitlist.csv', {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    // company: quotes doubled, whole field quoted
    expect(body).toContain('"Build, Co ""Pro"""');
    // role: contains newline → wrapped in quotes
    expect(body).toContain('"Foreman\nSupervisor"');
  });

  it('returns just the header when table is empty', async () => {
    const app = createApp();
    const { token: tok } = await signTestSession(adminId);
    const res = await app.request('/admin/waitlist.csv', {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.trim()).toBe('id,email,company,role,source,confirmed_at,created_at');
  });
});
