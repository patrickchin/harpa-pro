/**
 * Scope test for GET /admin/readyz.
 *
 * Proves that the isolated-admin readiness probe stays public and does not
 * depend on application bearer auth.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { getAdminPool } from '../../db/admin-client.js';
import { getPool, resetPool } from '../../db/client.js';
import { signTestToken } from '../../middleware/auth.js';
import { resetAdminReadyzCache } from '../../routes/admin-readyz.js';
import { makeSessionId, makeUserId } from '../factories/index.js';
import { startAdminPg, type AdminPgFixture } from '../setup-admin-pg.js';
import { seedAuthUsers, startPg, type PgFixture } from '../setup-pg.js';

let fx: PgFixture;
let adminFx: AdminPgFixture;
let userId: string;
let sessionId: string;
let legacyAdminId: string;
let legacyAdminSessionId: string;

beforeAll(async () => {
  [fx, adminFx] = await Promise.all([startPg(), startAdminPg()]);
  process.env.DATABASE_URL = fx.url;
  process.env.ADMIN_DATABASE_URL = adminFx.url;
  await resetPool();
  getPool(fx.url);
  getAdminPool(adminFx.url);

  userId = makeUserId();
  sessionId = makeSessionId();
  legacyAdminId = makeUserId();
  legacyAdminSessionId = makeSessionId();

  await seedAuthUsers(fx.url, [
    {
      id: userId,
      email: 'readyz-regular@example.com',
      displayName: 'Readyz Regular',
    },
    {
      id: legacyAdminId,
      email: 'readyz-legacy-admin@example.com',
      displayName: 'Readyz Legacy Admin',
      isAdmin: true,
    },
  ]);
}, 120_000);

beforeEach(() => {
  resetAdminReadyzCache();
});

afterAll(async () => {
  await Promise.all([fx?.stop(), adminFx?.stop()]);
}, 60_000);

describe('scope: GET /admin/readyz', () => {
  it('allows an anonymous request', async () => {
    const response = await createApp().request('/admin/readyz');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, db: 'up' });
  });

  it('allows a regular app bearer session without treating it as admin auth', async () => {
    const token = await signTestToken(userId, sessionId);
    const response = await createApp().request('/admin/readyz', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, db: 'up' });
  });

  it('allows a legacy app admin bearer session without depending on app auth', async () => {
    const token = await signTestToken(legacyAdminId, legacyAdminSessionId);
    const response = await createApp().request('/admin/readyz', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, db: 'up' });
  });
});
