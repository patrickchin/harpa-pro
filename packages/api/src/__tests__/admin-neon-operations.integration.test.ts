import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { getAdminPool, resetAdminPool } from '../db/admin-client.js';
import { env } from '../env.js';
import { resetAdminRateLimiter, setAdminRateLimiter } from '../lib/adminRateLimiter.js';
import {
  resetRateLimiter,
  setRateLimiter,
  type RateLimiter,
  type RateLimiterResult,
} from '../lib/rateLimiter.js';
import { setAdminPassword } from '../services/admin-auth.js';
import { startAdminPg, type AdminPgFixture } from './setup-admin-pg.js';

const ADMIN_ORIGIN = 'http://localhost:3102';
const ADMIN_EMAIL = 'neon-operations@harpapro.com';
const ADMIN_PASSWORD = 'neon operations admin password deliberately long';
const runtimeEnv = env as typeof env & {
  ADMIN_NEON_VIEWER_API_KEY?: string;
  ADMIN_NEON_ORG_ID?: string;
};

let adminFx: AdminPgFixture;
let adminCookie: string;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
let adminRateLimiter: RecordingRateLimiter;
let originalNeonViewerApiKey: string | undefined;
let originalNeonOrgId: string | undefined;

class RecordingRateLimiter implements RateLimiter {
  readonly calls: Array<{ key: string; limit: number; windowMs: number }> = [];

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimiterResult> {
    this.calls.push({ key, limit, windowMs });
    return { success: true, limit, remaining: limit - 1, reset: Date.now() + windowMs };
  }
}

class FailingAppRateLimiter implements RateLimiter {
  async consume(): Promise<RateLimiterResult> {
    throw new Error('application rate limiter must not run for dedicated admin operations');
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestUrl(input: string | URL | Request): URL {
  if (input instanceof Request) return new URL(input.url);
  return new URL(input.toString());
}

function projectResponse() {
  return {
    projects: [
      {
        active_time: 100,
        id: 'project-integration',
        platform_id: 'aws',
        region_id: 'aws-eu-central-1',
        name: 'Harpa Pro integration',
        pg_version: 17,
        proxy_host: 'secret-project-host.neon.tech',
        branch_logical_size_limit: 512,
        branch_logical_size_limit_bytes: 536_870_912,
        provisioner: 'k8s-neonvm',
        store_passwords: true,
        cpu_used_sec: 9,
        creation_source: 'console',
        created_at: '2026-07-01T09:00:00Z',
        updated_at: '2026-08-08T07:59:00Z',
        owner_id: 'secret-owner-id',
        org_id: 'org-harpa-pro',
        effective_project_permission: 'VIEWER',
        connection_uri: 'postgres://secret:password@secret.neon.tech/db',
      },
    ],
    unavailable_project_ids: [],
    pagination: {},
    applications: { 'project-integration': ['secret-application'] },
    integrations: { 'project-integration': ['secret-integration'] },
  };
}

function branchResponse() {
  return {
    branches: [
      {
        id: 'branch-integration-main',
        project_id: 'project-integration',
        name: 'main',
        current_state: 'ready',
        created_at: '2026-07-02T09:00:00Z',
        updated_at: '2026-08-08T07:58:00Z',
        default: true,
        protected: true,
        endpoint_host: 'secret-endpoint.neon.tech',
      },
    ],
    annotations: { 'branch-integration-main': { secret: 'annotation' } },
    pagination: {},
  };
}

function defaultProviderFetch() {
  return vi.fn<typeof fetch>(async (input) => {
    const url = requestUrl(input);
    if (url.pathname === '/api/v2/projects') return jsonResponse(projectResponse());
    if (url.pathname === '/api/v2/projects/project-integration/branches/count') {
      return jsonResponse({ count: 1 });
    }
    if (url.pathname === '/api/v2/projects/project-integration/branches') {
      return jsonResponse(branchResponse());
    }
    return jsonResponse({ message: 'unexpected provider request' }, 404);
  });
}

beforeAll(async () => {
  originalNeonViewerApiKey = runtimeEnv.ADMIN_NEON_VIEWER_API_KEY;
  originalNeonOrgId = runtimeEnv.ADMIN_NEON_ORG_ID;
  runtimeEnv.ADMIN_NEON_VIEWER_API_KEY = 'route-default-neon-viewer-key';
  runtimeEnv.ADMIN_NEON_ORG_ID = 'org-harpa-pro';

  adminFx = await startAdminPg();
  process.env.ADMIN_DATABASE_URL = adminFx.url;
  await resetAdminPool();
  getAdminPool(adminFx.url);

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
  setRateLimiter(new FailingAppRateLimiter());
  adminRateLimiter = new RecordingRateLimiter();
  setAdminRateLimiter(adminRateLimiter);
  fetchImpl = defaultProviderFetch();
  vi.stubGlobal('fetch', fetchImpl);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  resetRateLimiter();
  resetAdminRateLimiter();
  runtimeEnv.ADMIN_NEON_VIEWER_API_KEY = originalNeonViewerApiKey;
  runtimeEnv.ADMIN_NEON_ORG_ID = originalNeonOrgId;
  await adminFx?.stop();
}, 60_000);

describe('GET /admin/operations/neon', () => {
  it('uses the default outbound fetch wiring and returns only the redacted contract', async () => {
    const response = await createApp().request('/admin/operations/neon', {
      headers: {
        cookie: adminCookie,
        origin: ADMIN_ORIGIN,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body).toMatchObject({
      status: 'available',
      projectsTruncated: false,
      unavailableProjectCount: 0,
      projects: [
        {
          id: 'project-integration',
          name: 'Harpa Pro integration',
          effectivePermission: 'VIEWER',
          branchCount: { status: 'available', count: 1 },
          branchDetails: {
            status: 'available',
            truncated: false,
            branches: [{ id: 'branch-integration-main', name: 'main' }],
          },
        },
      ],
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const [input, init] of fetchImpl.mock.calls) {
      const url = requestUrl(input);
      expect(url.origin).toBe('https://console.neon.tech');
      expect(init?.method).toBe('GET');
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer route-default-neon-viewer-key',
      );
    }
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('route-default-neon-viewer-key');
    expect(serialized).not.toContain('secret-owner-id');
    expect(serialized).not.toContain('secret-project-host');
    expect(serialized).not.toContain('secret-endpoint');
    expect(serialized).not.toContain('secret-application');
    expect(serialized).not.toContain('secret-integration');
    expect(serialized).not.toContain('annotation');
    expect(
      adminRateLimiter.calls.find(({ key }) => key.startsWith('admin.auth.ip.1m:fn:')),
    ).toMatchObject({ limit: 120, windowMs: 60_000 });
    expect(
      adminRateLimiter.calls.find(({ key }) => key.startsWith('admin.operations.neon.read.1m:fn:')),
    ).toMatchObject({ limit: 12, windowMs: 60_000 });
  });

  it('keeps private no-store on a route-specific rate-limit response', async () => {
    class RejectingOperationsLimiter extends RecordingRateLimiter {
      override async consume(
        key: string,
        limit: number,
        windowMs: number,
      ): Promise<RateLimiterResult> {
        const result = await super.consume(key, limit, windowMs);
        return key.startsWith('admin.operations.neon.read.1m:')
          ? { ...result, success: false, remaining: 0 }
          : result;
      }
    }
    setAdminRateLimiter(new RejectingOperationsLimiter());

    const response = await createApp().request('/admin/operations/neon', {
      headers: {
        cookie: adminCookie,
        origin: ADMIN_ORIGIN,
      },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
