/**
 * Integration tests for /admin/readyz against the dedicated admin database.
 *
 * The probe is intentionally unauthenticated so deployment automation can
 * verify the independent admin migration stream without an admin session.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { getAdminPool, resetAdminPool } from '../db/admin-client.js';
import { migrateAdmin } from '../db/admin-migrate.js';
import { resetAdminReadyzCache } from '../routes/admin-readyz.js';
import { startAdminPg, type AdminPgFixture } from './setup-admin-pg.js';

let adminFx: AdminPgFixture;

beforeAll(async () => {
  adminFx = await startAdminPg();
}, 120_000);

afterAll(async () => {
  delete process.env.ADMIN_MIGRATIONS_REQUIRED_HEAD;
  await adminFx?.stop();
}, 60_000);

beforeEach(async () => {
  await resetAdminPool();
  await migrateAdmin(adminFx.url);
  getAdminPool(adminFx.url);
  resetAdminReadyzCache();
  delete process.env.ADMIN_MIGRATIONS_REQUIRED_HEAD;
});

describe('GET /admin/readyz', () => {
  it('returns 200 with the applied head without an admin session', async () => {
    process.env.ADMIN_MIGRATIONS_REQUIRED_HEAD = '0002_admin_rate_limit_buckets.sql';

    const response = await createApp().request('/admin/readyz');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      db: 'up',
      head: '0002_admin_rate_limit_buckets.sql',
    });
  });

  it('returns 503 when the admin migration ledger is missing', async () => {
    await getAdminPool().query('DROP SCHEMA admin CASCADE');
    resetAdminReadyzCache();

    const response = await createApp().request('/admin/readyz');

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      db: 'schema-missing',
    });
  });

  it('returns 503 when the applied admin head differs from the image head', async () => {
    process.env.ADMIN_MIGRATIONS_REQUIRED_HEAD = '999912312359_not_a_real_migration.sql';
    resetAdminReadyzCache();

    const response = await createApp().request('/admin/readyz');

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      db: 'head-mismatch',
      expected: '999912312359_not_a_real_migration.sql',
      actual: '0002_admin_rate_limit_buckets.sql',
    });
  });

  it('returns 503 when the admin database is unreachable', async () => {
    await resetAdminPool();
    getAdminPool('postgres://test:test@127.0.0.1:1/nope');
    resetAdminReadyzCache();

    const response = await createApp().request('/admin/readyz');

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      db: 'down',
    });
  });

  it('reuses a recent healthy probe within the short cache window', async () => {
    const first = await createApp().request('/admin/readyz');
    expect(first.status).toBe(200);

    await resetAdminPool();
    getAdminPool('postgres://test:test@127.0.0.1:1/nope');

    const cached = await createApp().request('/admin/readyz');
    expect(cached.status).toBe(200);
    expect(await cached.json()).toEqual(await first.json());
  });

  it('coalesces concurrent cache misses into one admin DB probe', async () => {
    const query = vi.spyOn(getAdminPool(), 'query');
    resetAdminReadyzCache();

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => createApp().request('/admin/readyz')),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: 20 }, () => 200),
    );
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('briefly caches a failed probe instead of hammering an unavailable DB', async () => {
    await resetAdminPool();
    const unavailable = getAdminPool('postgres://test:test@127.0.0.1:1/nope');
    const query = vi.spyOn(unavailable, 'query');
    resetAdminReadyzCache();

    const first = await createApp().request('/admin/readyz');
    const cachedFailure = await createApp().request('/admin/readyz');

    expect(first.status).toBe(503);
    expect(cachedFailure.status).toBe(503);
    expect(await cachedFailure.json()).toEqual(await first.json());
    expect(query).toHaveBeenCalledOnce();
  });
});
