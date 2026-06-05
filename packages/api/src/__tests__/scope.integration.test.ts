/**
 * P0 scope integration test: proves migrations apply, the
 * `app_authenticated` role exists, and RLS isolates one user's project
 * from another's.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { startPg, seedAuthUsers, type PgFixture } from './setup-pg.js';
import { withScopedConnection } from '../db/scope.js';
import { resetPool, getPool } from '../db/client.js';
import { makeUserId, makeSessionId, makeProjectId } from './factories/index.js';

let fx: PgFixture;
let alice: string;
let bob: string;
let aliceSid: string;
let bobSid: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url); // prime
  alice = makeUserId();
  bob = makeUserId();
  aliceSid = makeSessionId();
  bobSid = makeSessionId();

  await seedAuthUsers(fx.url, [{ id: alice }, { id: bob }]);
  // Seed users + a project for each via a privileged connection (no RLS).
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  // Insert with explicit ids and memberships (bypassing RLS as superuser).
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'alice-proj', $2)`,
    [makeProjectId(), alice],
  );
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'bob-proj', $2)`,
    [makeProjectId(), bob],
  );
  await admin.query(`
    INSERT INTO app.project_members(project_id, user_id, role)
    SELECT id, owner_id, 'owner' FROM app.projects
  `);
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('per-request scope (RLS)', () => {
  it('alice sees only her project', async () => {
    const rows = await withScopedConnection({ sub: alice, sid: aliceSid }, async (db) => {
      const r = await db.execute(sql`SELECT name FROM app.projects ORDER BY name`);
      return (r.rows as Array<{ name: string }>).map((x) => x.name);
    });
    expect(rows).toEqual(['alice-proj']);
  });

  it('bob sees only his project', async () => {
    const rows = await withScopedConnection({ sub: bob, sid: bobSid }, async (db) => {
      const r = await db.execute(sql`SELECT name FROM app.projects ORDER BY name`);
      return (r.rows as Array<{ name: string }>).map((x) => x.name);
    });
    expect(rows).toEqual(['bob-proj']);
  });

  it('alice cannot insert a project owned by bob', async () => {
    await expect(
      withScopedConnection({ sub: alice, sid: aliceSid }, async (db) => {
        await db.execute(
          sql`INSERT INTO app.projects(name, owner_id) VALUES ('evil', ${bob})`,
        );
      }),
    ).rejects.toThrow();
  });
});
