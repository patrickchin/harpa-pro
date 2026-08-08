/**
 * Scope tests for read-only GET /admin/operations provider observations.
 *
 * The provider observation must begin only after the dedicated browser-admin
 * session succeeds. Better Auth and the legacy app is_admin bit are not admin
 * console credentials and must never trigger an outbound provider request.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { getAdminPool, resetAdminPool } from '../../db/admin-client.js';
import { getPool, resetPool } from '../../db/client.js';
import { resetAdminRateLimiter } from '../../lib/adminRateLimiter.js';
import { resetRateLimiter } from '../../lib/rateLimiter.js';
import { signTestToken } from '../../middleware/auth.js';
import { setAdminPassword } from '../../services/admin-auth.js';
import { makeSessionId, makeUserId } from '../factories/index.js';
import { startAdminPg, type AdminPgFixture } from '../setup-admin-pg.js';
import { seedAuthUsers, startPg, type PgFixture } from '../setup-pg.js';

vi.mock('../../env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../env.js')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      ADMIN_CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
      ADMIN_CLOUDFLARE_R2_OBSERVER_API_TOKEN: 'scope-r2-observer-token',
      ADMIN_NEON_VIEWER_API_KEY: 'scope-neon-viewer-key',
      ADMIN_NEON_ORG_ID: 'org-harpa-pro',
    },
  };
});

const ADMIN_ORIGIN = 'http://localhost:3102';
const ADMIN_EMAIL = 'neon-operations-scope@harpapro.com';
const ADMIN_PASSWORD = 'neon operations scope password deliberately long';

let fx: PgFixture;
let adminFx: AdminPgFixture;
let regularId: string;
let regularSessionId: string;
let legacyAdminId: string;
let legacyAdminSessionId: string;
let adminCookie: string;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;

beforeAll(async () => {
  [fx, adminFx] = await Promise.all([startPg(), startAdminPg()]);
  process.env.DATABASE_URL = fx.url;
  process.env.ADMIN_DATABASE_URL = adminFx.url;
  await resetPool();
  await resetAdminPool();
  getPool(fx.url);
  getAdminPool(adminFx.url);

  regularId = makeUserId();
  regularSessionId = makeSessionId();
  legacyAdminId = makeUserId();
  legacyAdminSessionId = makeSessionId();
  await seedAuthUsers(fx.url, [
    {
      id: regularId,
      email: 'neon-operations-regular@example.com',
      displayName: 'Neon Operations Regular',
    },
    {
      id: legacyAdminId,
      email: 'neon-operations-legacy-admin@example.com',
      displayName: 'Neon Operations Legacy Admin',
      isAdmin: true,
    },
  ]);

  await setAdminPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
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
  if (login.status !== 200) throw new Error(`dedicated admin login failed with ${login.status}`);
  const setCookie = login.headers.get('set-cookie');
  if (!setCookie) throw new Error('dedicated admin login did not set a cookie');
  adminCookie = setCookie.split(';')[0]!;
}, 120_000);

beforeEach(() => {
  resetRateLimiter();
  resetAdminRateLimiter();
  fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ projects: [], unavailable_project_ids: [], pagination: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchImpl);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await Promise.all([fx?.stop(), adminFx?.stop()]);
}, 60_000);

async function expectRejectedBeforeProviderCall(response: Response): Promise<void> {
  expect(response.status).toBe(401);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(fetchImpl).not.toHaveBeenCalled();
}

describe('scope: GET /admin/operations/neon', () => {
  it('rejects an anonymous request before observing Neon', async () => {
    const response = await createApp().request('/admin/operations/neon');

    await expectRejectedBeforeProviderCall(response);
  });

  it('rejects a regular Better Auth bearer session before observing Neon', async () => {
    const token = await signTestToken(regularId, regularSessionId);
    const response = await createApp().request('/admin/operations/neon', {
      headers: { authorization: `Bearer ${token}` },
    });

    await expectRejectedBeforeProviderCall(response);
  });

  it('rejects a legacy app-admin bearer session before observing Neon', async () => {
    const token = await signTestToken(legacyAdminId, legacyAdminSessionId);
    const response = await createApp().request('/admin/operations/neon', {
      headers: { authorization: `Bearer ${token}` },
    });

    await expectRejectedBeforeProviderCall(response);
  });

  it('allows a dedicated admin session to start the read-only observation', async () => {
    const response = await createApp().request('/admin/operations/neon', {
      headers: {
        cookie: adminCookie,
        origin: ADMIN_ORIGIN,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({
      status: 'available',
      projectsTruncated: false,
      unavailableProjectCount: 0,
      projects: [],
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [input, init] = fetchImpl.mock.calls[0]!;
    const url = input instanceof Request ? new URL(input.url) : new URL(input.toString());
    expect(url).toMatchObject({
      origin: 'https://console.neon.tech',
      pathname: '/api/v2/projects',
    });
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer scope-neon-viewer-key');
  });
});

describe('scope: GET /admin/operations/r2-capacity', () => {
  it('rejects an anonymous request before observing Cloudflare', async () => {
    const response = await createApp().request('/admin/operations/r2-capacity');

    await expectRejectedBeforeProviderCall(response);
  });

  it('rejects a regular Better Auth bearer session before observing Cloudflare', async () => {
    const token = await signTestToken(regularId, regularSessionId);
    const response = await createApp().request('/admin/operations/r2-capacity', {
      headers: { authorization: `Bearer ${token}` },
    });

    await expectRejectedBeforeProviderCall(response);
  });

  it('rejects a legacy app-admin bearer session before observing Cloudflare', async () => {
    const token = await signTestToken(legacyAdminId, legacyAdminSessionId);
    const response = await createApp().request('/admin/operations/r2-capacity', {
      headers: { authorization: `Bearer ${token}` },
    });

    await expectRejectedBeforeProviderCall(response);
  });
});

describe('scope: POST /admin/operations/report-generate', () => {
  it('rejects a regular application bearer session before starting the diagnostic runner', async () => {
    const token = await signTestToken(regularId, regularSessionId);
    const response = await createApp().request('/admin/operations/report-generate', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        origin: ADMIN_ORIGIN,
        'x-admin-csrf': 'A'.repeat(43),
      },
    });

    await expectRejectedBeforeProviderCall(response);
  });

  it('rejects a legacy app-admin bearer session before starting the diagnostic runner', async () => {
    const token = await signTestToken(legacyAdminId, legacyAdminSessionId);
    const response = await createApp().request('/admin/operations/report-generate', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        origin: ADMIN_ORIGIN,
        'x-admin-csrf': 'A'.repeat(43),
      },
    });

    await expectRejectedBeforeProviderCall(response);
  });
});
