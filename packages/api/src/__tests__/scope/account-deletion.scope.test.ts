/**
 * Scope test for account deletion. The route must delete only the
 * caller's account and project memberships; a bearer token for Alice
 * must never touch Bob's user row or projects.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../../app.js';
import { resetPool, getPool } from '../../db/client.js';
import { signTestToken } from '../../middleware/auth.js';
import { startPg, seedAuthUsers, type PgFixture } from '../setup-pg.js';
import { makeProjectId, makeSessionId, makeUserId } from '../factories/index.js';

let fx: PgFixture;
let admin: pg.Client;
let alice: string;
let bob: string;
let aliceSid: string;
let bobProject: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  alice = makeUserId();
  bob = makeUserId();
  aliceSid = makeSessionId();
  bobProject = makeProjectId();

  await seedAuthUsers(fx.url, [
    { id: alice, email: 'alice-scope-delete@example.com' },
    { id: bob, email: 'bob-scope-delete@example.com' },
  ]);

  admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'Bob keeps this', $2)`,
    [bobProject, bob],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [bobProject, bob],
  );
}, 120_000);

afterAll(async () => {
  await admin?.end();
  await fx?.stop();
}, 60_000);

describe('scope: DELETE /me', () => {
  it('deletes alice while leaving bob and bob-owned projects intact', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);

    const res = await app.request('/me', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(204);

    const users = await admin.query<{ id: string }>(
      `SELECT id FROM public."user" ORDER BY id`,
    );
    expect(users.rows.map((r) => r.id)).toEqual([bob]);

    const project = await admin.query<{ owner_id: string }>(
      `SELECT owner_id FROM app.projects WHERE id = $1`,
      [bobProject],
    );
    expect(project.rows[0]?.owner_id).toBe(bob);

    const members = await admin.query<{ user_id: string; role: string }>(
      `SELECT user_id, role FROM app.project_members WHERE project_id = $1`,
      [bobProject],
    );
    expect(members.rows).toEqual([{ user_id: bob, role: 'owner' }]);
  });
});
