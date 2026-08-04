/**
 * Scope test for dedicated admin session routes.
 *
 * Proves that application bearer sessions never authorize the separate admin
 * session endpoints, while a provisioned admin cookie does.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { getAdminPool } from '../../db/admin-client.js';
import { getPool, rawDb, resetPool } from '../../db/client.js';
import { withAnonConnection, withScopedConnection } from '../../db/scope.js';
import { newId } from '../../lib/ids.js';
import { getPgError } from '../../lib/pg-error.js';
import { signTestToken } from '../../middleware/auth.js';
import { hashAdminPassword } from '../../services/admin-auth.js';
import { makeSessionId, makeUserId } from '../factories/index.js';
import { startAdminPg, type AdminPgFixture } from '../setup-admin-pg.js';
import { seedAuthUsers, startPg, type PgFixture } from '../setup-pg.js';

const ADMIN_ORIGIN = 'http://localhost:3102';
const ADMIN_EMAIL = 'auth-scope@harpapro.com';
const ADMIN_PASSWORD = 'auth scope password is deliberately long';

let fx: PgFixture;
let adminFx: AdminPgFixture;
let legacyAdminId: string;
let legacyAdminSessionId: string;
let regularId: string;
let regularSessionId: string;
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

  await seedAuthUsers(fx.url, [
    {
      id: legacyAdminId,
      email: 'legacy-admin-auth@example.com',
      displayName: 'Legacy Admin Auth',
      isAdmin: true,
    },
    {
      id: regularId,
      email: 'regular-admin-auth@example.com',
      displayName: 'Regular Admin Auth',
    },
  ]);

  await getAdminPool().query(
    `INSERT INTO admin.identities (id, email, password_hash)
     VALUES ($1, $2, $3)`,
    [newId('adm'), ADMIN_EMAIL, await hashAdminPassword(ADMIN_PASSWORD)],
  );

  const login = await createApp().request('/admin/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ADMIN_ORIGIN,
    },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
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

describe('scope: admin auth routes', () => {
  it('rejects an anonymous admin-session lookup', async () => {
    const response = await createApp().request('/admin/auth/session');
    expect(response.status).toBe(401);
  });

  it('rejects a regular app bearer session for admin-session lookup', async () => {
    const token = await signTestToken(regularId, regularSessionId);
    const response = await createApp().request('/admin/auth/session', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
  });

  it('rejects a legacy app admin bearer session for admin-session lookup', async () => {
    const token = await signTestToken(legacyAdminId, legacyAdminSessionId);
    const response = await createApp().request('/admin/auth/session', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
  });

  it('allows the dedicated admin cookie to read the admin session', async () => {
    const response = await createApp().request('/admin/auth/session', {
      headers: {
        cookie: adminCookie,
        origin: ADMIN_ORIGIN,
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      email: ADMIN_EMAIL,
    });
  });

  it('rejects a regular app bearer session for admin logout', async () => {
    const token = await signTestToken(regularId, regularSessionId);
    const response = await createApp().request('/admin/auth/logout', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        origin: ADMIN_ORIGIN,
      },
    });
    expect(response.status).toBe(401);
  });

  it('keeps the admin schema unreadable to anonymous DB scope', async () => {
    const error = await withAnonConnection(async (db) => {
      await db.execute(sql`SELECT * FROM admin.identities`);
    }).catch((caught: unknown) => caught);

    expect(getPgError(error)?.message).toMatch(
      /permission denied|relation .* does not exist/i,
    );
  });

  it('keeps the admin schema unreadable to app-user DB scope', async () => {
    const error = await withScopedConnection(
      { sub: regularId, sid: regularSessionId },
      async (db) => {
        await db.execute(sql`SELECT * FROM admin.identities`);
      },
    ).catch((caught: unknown) => caught);

    expect(getPgError(error)?.message).toMatch(
      /permission denied|relation .* does not exist/i,
    );
  });

  it('negative control: the application database has no admin schema tables', async () => {
    const result = await rawDb().execute<{ identities: string | null }>(sql`
      SELECT to_regclass('admin.identities')::text AS identities
    `);
    expect(result.rows).toEqual([{ identities: null }]);
  });
});
