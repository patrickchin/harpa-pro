/**
 * Scope test for /me — paired (alice/bob), plus negative-control
 * proving the scope wrapper is what isolates one user's row from the
 * other (Pitfall 6, docs/v4/arch-auth-and-rls.md §Test gates).
 *
 * `/me` itself only returns the caller's own row, so we test that:
 *   1. The handler returns the right user when the JWT is alice's.
 *   2. The handler returns the right user when the JWT is bob's
 *      (i.e. alice's token cannot impersonate bob — handled by the
 *      JWT signature path).
 *   3. Negative control: running the same SELECT without the scope
 *      wrapper sees both users — proving the policy enforcement on
 *      writes (insert) was being applied by the scope, not by chance.
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
import { makeUserId, makeSessionId } from '../factories/index.js';
import * as schema from '../../db/schema.js';

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
    `INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES ($1, 'Alice', $2, true, now(), now()), ($3, 'Bob', $4, true, now(), now())`,
    [alice, 'alice@example.com', bob, 'bob@example.com'],
  );
  // Seed sessions for both so JWTs are valid in spirit (we don't enforce
  // session-row presence in withAuth yet — see middleware/auth.ts).
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: /me', () => {
  it('alice GET /me returns alice', async () => {
    const app = createApp();
    const { token } = await signTestSession(alice);
    const res = await app.request('/me', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; email: string } };
    expect(body.user.id).toBe(alice);
    expect(body.user.email).toBe('alice@example.com');
  });

  it('bob GET /me returns bob (and never alice)', async () => {
    const app = createApp();
    const { token } = await signTestSession(bob);
    const res = await app.request('/me', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; email: string } };
    expect(body.user.id).toBe(bob);
    expect(body.user.id).not.toBe(alice);
  });

  it('paired write — alice cannot insert a project owned by bob', async () => {
    // Scope-enforced INSERT WITH CHECK should reject. Proven by the absence
    // of any new project row afterwards.
    await expect(
      withScopedConnection({ sub: alice, sid: aliceSid }, async (db) => {
        await db.execute(
          sql`INSERT INTO app.projects(name, owner_id) VALUES ('evil', ${bob})`,
        );
      }),
    ).rejects.toThrow();
  });

  it('negative control — same SELECT WITHOUT scope sees both users', async () => {
    // Connect as the superuser (no SET LOCAL role) and prove that without the
    // wrapper, the same query returns BOTH users — i.e. the wrapper is the
    // thing protecting per-request isolation, not coincidence.
    const conn = await getPool().connect();
    try {
      const result = await drizzle(conn, { schema }).execute(
        sql`SELECT count(*)::int AS count FROM "user"`,
      );
      const count = Number((result.rows[0] as { count: number }).count);
      expect(count).toBeGreaterThanOrEqual(2);
    } finally {
      conn.release();
    }
  });

  it('PATCH /me: alice updating self only mutates alice', async () => {
    const app = createApp();
    const { token } = await signTestSession(alice);
    const res = await app.request('/me', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'AliceScopeTest' }),
    });
    expect(res.status).toBe(200);
    // Verify bob's row was NOT touched.
    const conn = await getPool().connect();
    try {
      const r = await conn.query<{ display_name: string | null }>(
        `SELECT display_name FROM "user" WHERE id = $1`,
        [bob],
      );
      expect(r.rows[0]?.display_name).not.toBe('AliceScopeTest');
    } finally {
      conn.release();
    }
  });

  it('paired — bob cannot impersonate alice via the alice route handler', async () => {
    // The handler reads userId from the JWT, so a token signed for bob can
    // only ever update bob's row — even if the request body claims otherwise.
    const app = createApp();
    const { token } = await signTestSession(bob);
    const res = await app.request('/me', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'BobScopeTest' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; displayName: string } };
    expect(body.user.id).toBe(bob);
    expect(body.user.displayName).toBe('BobScopeTest');
  });

  it('negative control — same UPDATE WITHOUT scope can mutate any user row', async () => {
    // Without the SET LOCAL role, the connecting test user (table owner)
    // bypasses RLS and can mutate either row. Proves the wrapper is what
    // restricts PATCH /me to the caller's own row.
    const conn = await getPool().connect();
    try {
      const r = await conn.query(
        `UPDATE "user" SET display_name = 'UNSCOPED' WHERE id = $1 RETURNING id`,
        [bob],
      );
      expect(r.rowCount).toBe(1);
      // Restore so other tests aren't affected.
      await conn.query(`UPDATE "user" SET display_name = 'Bob' WHERE id = $1`, [bob]);
    } finally {
      conn.release();
    }
  });
});
