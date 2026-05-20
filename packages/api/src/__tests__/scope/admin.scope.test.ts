/**
 * Scope test for /admin/* — proves the actor-isolation contract on the
 * admin surface: only callers with `auth.users.is_admin = true` can
 * reach the privileged read path, and the table itself stays unreadable
 * to anon / regular-user DB scopes.
 *
 * Paired actors (admin / regular) + negative-control proving the
 * `is_admin` flag is what gates the route, not coincidence.
 *
 * See packages/api/src/routes/admin.ts and
 * packages/api/src/middleware/admin.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { startPg, type PgFixture } from '../setup-pg.js';
import { createApp } from '../../app.js';
import { withAnonConnection, withScopedConnection } from '../../db/scope.js';
import { signTestToken } from '../../middleware/auth.js';
import { resetPool, getPool, rawDb } from '../../db/client.js';
import { makeUserId, makeSessionId } from '../factories/index.js';

let fx: PgFixture;
let adminId: string;
let adminSid: string;
let regularId: string;
let regularSid: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  adminId = makeUserId();
  regularId = makeUserId();
  const adminSessionId = makeSessionId();
  const regularSessionId = makeSessionId();

  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO auth.users(id, phone, is_admin) VALUES ($1, $2, true), ($3, $4, false)`,
    [adminId, '+15551500001', regularId, '+15551500002'],
  );
  await admin.query(
    `INSERT INTO auth.sessions(id, user_id, expires_at)
     VALUES ($1, $2, now() + interval '7 days'), ($3, $4, now() + interval '7 days')`,
    [adminSessionId, adminId, regularSessionId, regularId],
  );
  adminSid = adminSessionId;
  regularSid = regularSessionId;
  await admin.end();

  // Seed a signup so the SELECT-denied tests have something to *not* see.
  await rawDb().execute(sql`
    INSERT INTO app.waitlist_signups(id, email, confirmed_at)
    VALUES ('wls_test1234', 'seed@buildco.com', now())
  `);
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: /admin/waitlist.csv', () => {
  it('anonymous request → 401', async () => {
    const app = createApp();
    const res = await app.request('/admin/waitlist.csv');
    expect(res.status).toBe(401);
  });

  it('regular authenticated user → 403 (is_admin = false)', async () => {
    const app = createApp();
    const tok = await signTestToken(regularId, regularSid);
    const res = await app.request('/admin/waitlist.csv', {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(403);
  });

  it('admin user → 200 and CSV includes the seeded signup', async () => {
    const app = createApp();
    const tok = await signTestToken(adminId, adminSid);
    const res = await app.request('/admin/waitlist.csv', {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('seed@buildco.com');
  });

  it('app.waitlist_signups stays unreadable to anon DB scope', async () => {
    await expect(
      withAnonConnection(async (db) => {
        await db.execute(sql`SELECT email FROM app.waitlist_signups`);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('app.waitlist_signups stays unreadable to a regular-user DB scope', async () => {
    await expect(
      withScopedConnection({ sub: regularId, sid: regularSid }, async (db) => {
        await db.execute(sql`SELECT email FROM app.waitlist_signups`);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('negative control — same SELECT without any scope (superuser) sees rows', async () => {
    const r = await rawDb().execute<{ email: string }>(
      sql`SELECT email::text AS email FROM app.waitlist_signups LIMIT 1`,
    );
    // Drizzle .execute returns { rows } on node-postgres
    const rows = (r as unknown as { rows: { email: string }[] }).rows;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
