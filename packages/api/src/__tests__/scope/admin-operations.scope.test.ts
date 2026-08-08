/**
 * Scope test for GET /admin/operations/neon and the dedicated admin-auth tables.
 *
 * Proves that the read-only Neon inventory stays behind the browser-admin
 * session boundary and does not fall back to legacy app bearer sessions.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { getAdminPool } from '../../db/admin-client.js';
import { getPool, rawDb, resetPool } from '../../db/client.js';
import { env } from '../../env.js';
import { signTestToken } from '../../middleware/auth.js';
import { hashAdminPassword } from '../../services/admin-auth.js';
import { makeSessionId, makeUserId } from '../factories/index.js';
import { startAdminPg, type AdminPgFixture } from '../setup-admin-pg.js';
import { seedAuthUsers, startPg, type PgFixture } from '../setup-pg.js';

const ADMIN_ORIGIN = 'http://localhost:3102';
const CONSOLE_EMAIL = 'operations-scope@harpapro.com';
const CONSOLE_PASSWORD = 'operations scope password is deliberately long';
const runtimeEnv = env as typeof env & {
  ADMIN_NEON_VIEWER_API_KEY?: string;
  ADMIN_NEON_ORG_ID?: string;
};

let fx: PgFixture;
let adminFx: AdminPgFixture;
let legacyAdminId: string;
let legacyAdminSessionId: string;
let regularId: string;
let regularSessionId: string;
let adminCookie: string;
let originalNeonViewerApiKey: string | undefined;
let originalNeonOrgId: string | undefined;

beforeAll(async () => {
  [fx, adminFx] = await Promise.all([startPg(), startAdminPg()]);
  process.env.DATABASE_URL = fx.url;
  process.env.ADMIN_DATABASE_URL = adminFx.url;
  await resetPool();
  getPool(fx.url);

  legacyAdminId = makeUserId();
  legacyAdminSessionId = makeSessionId();
  regularId = makeUserId();
  regularSessionId = makeSessionId();

  await seedAuthUsers(fx.url, [
    {
      id: legacyAdminId,
      email: 'legacy-operations-admin@example.com',
      displayName: 'Legacy Operations Admin',
      isAdmin: true,
    },
    {
      id: regularId,
      email: 'operations-scope-regular@example.com',
      displayName: 'Operations Scope Regular',
    },
  ]);

  await getAdminPool(adminFx.url).query(
    `INSERT INTO admin.identities (id, email, password_hash)
     VALUES ($1, $2, $3)`,
    ['adm_123456789abd', CONSOLE_EMAIL, await hashAdminPassword(CONSOLE_PASSWORD)],
  );

  originalNeonViewerApiKey = runtimeEnv.ADMIN_NEON_VIEWER_API_KEY;
  originalNeonOrgId = runtimeEnv.ADMIN_NEON_ORG_ID;
  runtimeEnv.ADMIN_NEON_VIEWER_API_KEY = 'scope-neon-viewer-key';
  runtimeEnv.ADMIN_NEON_ORG_ID = 'org-harpa-pro';

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

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === '/api/v2/projects') {
        return new Response(
          JSON.stringify({
            projects: [
              {
                id: 'project-scope',
                name: 'Scope inventory',
                region_id: 'aws-eu-central-1',
                pg_version: 17,
                created_at: '2026-07-01T09:00:00Z',
                updated_at: '2026-08-08T07:59:00Z',
                org_id: 'org-harpa-pro',
                effective_project_permission: 'VIEWER',
              },
            ],
            unavailable_project_ids: [],
            pagination: {},
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.pathname === '/api/v2/projects/project-scope/branches/count') {
        return new Response(JSON.stringify({ count: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.pathname === '/api/v2/projects/project-scope/branches') {
        return new Response(
          JSON.stringify({
            branches: [
              {
                id: 'branch-scope-main',
                project_id: 'project-scope',
                name: 'main',
                current_state: 'ready',
                created_at: '2026-07-02T09:00:00Z',
                updated_at: '2026-08-08T07:58:00Z',
                default: true,
                protected: true,
              },
            ],
            pagination: {},
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ message: 'unexpected provider request' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});

afterAll(async () => {
  vi.unstubAllGlobals();
  runtimeEnv.ADMIN_NEON_VIEWER_API_KEY = originalNeonViewerApiKey;
  runtimeEnv.ADMIN_NEON_ORG_ID = originalNeonOrgId;
  await Promise.all([fx?.stop(), adminFx?.stop()]);
}, 60_000);

describe('scope: GET /admin/operations/neon', () => {
  it('rejects an anonymous request', async () => {
    const response = await createApp().request('/admin/operations/neon');
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('rejects a regular app bearer session', async () => {
    const token = await signTestToken(regularId, regularSessionId);
    const response = await createApp().request('/admin/operations/neon', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('rejects a legacy app admin bearer session', async () => {
    const token = await signTestToken(legacyAdminId, legacyAdminSessionId);
    const response = await createApp().request('/admin/operations/neon', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('allows the dedicated admin session to read the bounded Neon inventory', async () => {
    const response = await createApp().request('/admin/operations/neon', {
      headers: {
        cookie: adminCookie,
        origin: ADMIN_ORIGIN,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      status: 'available',
      projectsTruncated: false,
      unavailableProjectCount: 0,
      projects: [
        {
          id: 'project-scope',
          name: 'Scope inventory',
          effectivePermission: 'VIEWER',
          branchCount: { status: 'available', count: 1 },
        },
      ],
    });
  });

  it('does not create admin-auth tables in the application database', async () => {
    const result = await rawDb().execute<{
      identities: string | null;
      sessions: string | null;
    }>(`
      SELECT
        to_regclass('admin.identities')::text AS identities,
        to_regclass('admin.sessions')::text AS sessions
    `);
    expect(result.rows).toEqual([{ identities: null, sessions: null }]);
  });
});
