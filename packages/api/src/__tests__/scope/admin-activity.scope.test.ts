/**
 * Scope test for GET /admin/activity and the dedicated admin-auth tables.
 *
 * Proves that neither a regular app session nor the legacy is_admin flag can
 * authorize the browser console. The admin identity/session tables must also
 * stay unreadable through app-scoped database connections.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { getAdminPool } from '../../db/admin-client.js';
import { getPool, rawDb, resetPool } from '../../db/client.js';
import { withAnonConnection, withScopedConnection } from '../../db/scope.js';
import { newId } from '../../lib/ids.js';
import { signTestToken } from '../../middleware/auth.js';
import { hashAdminPassword } from '../../services/admin-auth.js';
import { makeSessionId, makeUserId } from '../factories/index.js';
import { startAdminPg, type AdminPgFixture } from '../setup-admin-pg.js';
import { seedAuthUsers, startPg, type PgFixture } from '../setup-pg.js';

const ADMIN_ORIGIN = 'http://localhost:3102';
const CONSOLE_EMAIL = 'activity-scope@harpapro.com';
const CONSOLE_PASSWORD = 'activity scope password is deliberately long';

let fx: PgFixture;
let adminFx: AdminPgFixture;
let legacyAdminId: string;
let legacyAdminSessionId: string;
let regularId: string;
let regularSessionId: string;
let activityId: string;
let adminCookie: string;

beforeAll(async () => {
  [fx, adminFx] = await Promise.all([startPg(), startAdminPg()]);
  process.env.DATABASE_URL = fx.url;
  process.env.ADMIN_DATABASE_URL = adminFx.url;
  await resetPool();
  getPool(fx.url);
  getAdminPool(adminFx.url);

  legacyAdminId = makeUserId();
  legacyAdminSessionId = makeSessionId();
  regularId = makeUserId();
  regularSessionId = makeSessionId();
  activityId = newId('aud');

  await seedAuthUsers(fx.url, [
    {
      id: legacyAdminId,
      email: 'legacy-activity-admin@example.com',
      displayName: 'Legacy Activity Admin',
      isAdmin: true,
    },
    {
      id: regularId,
      email: 'activity-scope-regular@example.com',
      displayName: 'Activity Scope Regular',
    },
  ]);

  await getAdminPool().query(
    `INSERT INTO admin.identities (id, email, password_hash)
     VALUES ($1, $2, $3)`,
    ['adm_123456789abc', CONSOLE_EMAIL, await hashAdminPassword(CONSOLE_PASSWORD)],
  );

  await rawDb().execute(sql`
    INSERT INTO app.activity_events
      (id, event_type, actor_user_id, subject_type, subject_id, dedupe_key, metadata)
    VALUES
      (${activityId}, 'user.signed_up', ${regularId}, 'user', ${regularId},
       ${`user.signed_up:${regularId}`}, '{"method":"email_otp"}')
  `);

  const login = await createApp().request('/admin/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ADMIN_ORIGIN,
    },
    body: JSON.stringify({
      email: CONSOLE_EMAIL,
      password: CONSOLE_PASSWORD,
    }),
  });
  if (login.status !== 200) {
    throw new Error(`dedicated admin login failed with ${login.status}`);
  }
  const setCookie = login.headers.get('set-cookie');
  if (!setCookie) throw new Error('dedicated admin login did not set a cookie');
  adminCookie = setCookie.split(';')[0]!;
}, 120_000);

afterAll(async () => {
  await Promise.all([fx?.stop(), adminFx?.stop()]);
}, 60_000);

describe('scope: GET /admin/activity', () => {
  it('rejects an anonymous request', async () => {
    const response = await createApp().request('/admin/activity');
    expect(response.status).toBe(401);
  });

  it('rejects a regular app bearer session', async () => {
    const token = await signTestToken(regularId, regularSessionId);
    const response = await createApp().request('/admin/activity', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
  });

  it('rejects a legacy app admin bearer session', async () => {
    const token = await signTestToken(legacyAdminId, legacyAdminSessionId);
    const response = await createApp().request('/admin/activity', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
  });

  it('allows the dedicated admin session to read retained activity', async () => {
    const response = await createApp().request('/admin/activity', {
      headers: {
        cookie: adminCookie,
        origin: ADMIN_ORIGIN,
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: Array<{ id: string }> };
    expect(body.items.map((item) => item.id)).toContain(activityId);
  });

  it('keeps activity events unreadable to anonymous DB scope', async () => {
    await expect(
      withAnonConnection(async (db) => {
        await db.execute(sql`SELECT id FROM app.activity_events`);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps activity events unreadable to app-user DB scope', async () => {
    await expect(
      withScopedConnection({ sub: regularId, sid: regularSessionId }, async (db) => {
        await db.execute(sql`SELECT id FROM app.activity_events`);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('does not create admin-auth tables in the application database', async () => {
    const result = await rawDb().execute<{
      identities: string | null;
      sessions: string | null;
    }>(sql`
      SELECT
        to_regclass('admin.identities')::text AS identities,
        to_regclass('admin.sessions')::text AS sessions
    `);
    expect(result.rows).toEqual([{ identities: null, sessions: null }]);
  });

  it('does not grant PUBLIC access to the admin schema or tables', async () => {
    await getAdminPool().query('CREATE ROLE admin_auth_privilege_probe NOLOGIN');
    const result = await getAdminPool().query<{
      schema_usage: boolean;
      identities_select: boolean;
      sessions_select: boolean;
    }>(
      `SELECT
         has_schema_privilege(
           'admin_auth_privilege_probe',
           'admin',
           'USAGE'
         ) AS schema_usage,
         has_table_privilege(
           'admin_auth_privilege_probe',
           'admin.identities',
           'SELECT'
         ) AS identities_select,
         has_table_privilege(
           'admin_auth_privilege_probe',
           'admin.sessions',
           'SELECT'
         ) AS sessions_select`,
    );
    expect(result.rows).toEqual([
      {
        schema_usage: false,
        identities_select: false,
        sessions_select: false,
      },
    ]);
  });

  it('negative control: superuser scope can read the dedicated identity', async () => {
    const result = await getAdminPool().query<{ email: string }>(
      `SELECT email FROM admin.identities WHERE email = $1`,
      [CONSOLE_EMAIL],
    );
    expect(result.rows).toEqual([{ email: CONSOLE_EMAIL }]);
  });
});
