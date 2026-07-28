/**
 * Scope test for GET /admin/activity.
 *
 * Proves that the route is available only to admins and that the retained
 * activity table cannot be queried through anonymous or regular-user DB
 * scopes. The superuser read is the negative control for the DB checks.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { getPool, rawDb, resetPool } from '../../db/client.js';
import { withAnonConnection, withScopedConnection } from '../../db/scope.js';
import { newId } from '../../lib/ids.js';
import { signTestToken } from '../../middleware/auth.js';
import { makeSessionId, makeUserId } from '../factories/index.js';
import { seedAuthUsers, startPg, type PgFixture } from '../setup-pg.js';

let fx: PgFixture;
let adminId: string;
let adminSessionId: string;
let regularId: string;
let regularSessionId: string;
let activityId: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  adminId = makeUserId();
  adminSessionId = makeSessionId();
  regularId = makeUserId();
  regularSessionId = makeSessionId();
  activityId = newId('aud');

  await seedAuthUsers(fx.url, [
    {
      id: adminId,
      email: 'activity-scope-admin@example.com',
      displayName: 'Activity Scope Admin',
      isAdmin: true,
    },
    {
      id: regularId,
      email: 'activity-scope-regular@example.com',
      displayName: 'Activity Scope Regular',
    },
  ]);

  await rawDb().execute(sql`
    INSERT INTO app.activity_events
      (id, event_type, actor_user_id, subject_type, subject_id, dedupe_key, metadata)
    VALUES
      (${activityId}, 'user.signed_up', ${regularId}, 'user', ${regularId},
       ${`user.signed_up:${regularId}`}, '{"method":"email_otp"}')
  `);
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: GET /admin/activity', () => {
  it('anonymous request is rejected', async () => {
    const response = await createApp().request('/admin/activity');
    expect(response.status).toBe(401);
  });

  it('regular authenticated user is rejected', async () => {
    const token = await signTestToken(regularId, regularSessionId);
    const response = await createApp().request('/admin/activity', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(403);
  });

  it('admin user can read the retained activity event', async () => {
    const token = await signTestToken(adminId, adminSessionId);
    const response = await createApp().request('/admin/activity', {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: Array<{ id: string }> };
    expect(body.items.map((item) => item.id)).toContain(activityId);
  });

  it('activity events stay unreadable to anonymous DB scope', async () => {
    await expect(
      withAnonConnection(async (db) => {
        await db.execute(sql`SELECT id FROM app.activity_events`);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('activity events stay unreadable to regular-user DB scope', async () => {
    await expect(
      withScopedConnection({ sub: regularId, sid: regularSessionId }, async (db) => {
        await db.execute(sql`SELECT id FROM app.activity_events`);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('negative control: superuser scope can read the seeded event', async () => {
    const result = await rawDb().execute<{ id: string }>(
      sql`SELECT id::text AS id FROM app.activity_events WHERE id = ${activityId}`,
    );
    expect(result.rows).toEqual([{ id: activityId }]);
  });
});
