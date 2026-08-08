import { operations } from '@harpa/api-contract';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { getAdminPool, resetAdminPool } from '../db/admin-client.js';
import { resetAdminRateLimiter, setAdminRateLimiter } from '../lib/adminRateLimiter.js';
import {
  resetRateLimiter,
  setRateLimiter,
  type RateLimiter,
  type RateLimiterResult,
} from '../lib/rateLimiter.js';
import { setAdminPassword } from '../services/admin-auth.js';
import { startAdminPg, type AdminPgFixture } from './setup-admin-pg.js';

vi.mock('../env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../env.js')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      ADMIN_NEON_VIEWER_API_KEY: 'route-default-neon-usage-viewer-key',
      ADMIN_NEON_ORG_ID: 'org-harpa-pro',
    },
  };
});

const ADMIN_ORIGIN = 'http://localhost:3102';
const ADMIN_EMAIL = 'neon-usage-operations@harpapro.com';
const ADMIN_PASSWORD = 'neon usage operations admin password deliberately long';
const NEON_API_KEY = 'route-default-neon-usage-viewer-key';
const ORGANIZATION_ID = 'org-harpa-pro';
const PROJECT_ID = 'project-usage-integration';
const PERIOD_START = '2026-08-01T00:00:00.000Z';
const PERIOD_END = '2026-09-01T00:00:00.000Z';
const EXPECTED_CAVEATS = [
  'provider_values_may_lag',
  'free_plan_published_reference',
  'storage_uses_published_reference',
  'transfer_requires_complete_project_coverage',
  'not_invoice_or_credit_balance',
  'published_allowances_can_change',
] as const;

let adminFx: AdminPgFixture;
let adminCookie: string;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
let adminRateLimiter: RecordingRateLimiter;

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

function organizationResponse() {
  return {
    id: ORGANIZATION_ID,
    name: 'Secret Harpa organization name',
    handle: 'secret-harpa-handle',
    plan: 'free',
    created_at: '2026-07-01T09:00:00Z',
    members: [{ id: 'secret-member-id', email: 'secret-member@example.com' }],
  };
}

function projectsResponse() {
  return {
    projects: [
      {
        id: PROJECT_ID,
        name: 'Harpa Pro usage integration',
        org_id: ORGANIZATION_ID,
        effective_project_permission: 'VIEWER',
        owner_id: 'secret-owner-id',
        proxy_host: 'secret-project-host.neon.tech',
        connection_uri: 'postgres://secret:password@secret.neon.tech/db',
      },
    ],
    unavailable_project_ids: [],
    pagination: {},
    applications: { [PROJECT_ID]: ['secret-application-id'] },
    integrations: { [PROJECT_ID]: ['secret-integration-id'] },
  };
}

function projectDetailResponse() {
  return {
    project: {
      id: PROJECT_ID,
      name: 'Harpa Pro usage integration',
      org_id: ORGANIZATION_ID,
      effective_project_permission: 'VIEWER',
      compute_time_seconds: 180_000,
      synthetic_storage_size: 125_000_000,
      data_transfer_bytes: 1_000_000_000,
      consumption_period_start: PERIOD_START,
      consumption_period_end: PERIOD_END,
      owner_id: 'secret-owner-id',
      proxy_host: 'secret-detail-host.neon.tech',
      connection_uri: 'postgres://secret:password@secret-detail.neon.tech/db',
      settings: { secret_setting: true },
      endpoints: [{ id: 'secret-endpoint-id', host: 'secret-endpoint.neon.tech' }],
    },
  };
}

function defaultProviderFetch() {
  return vi.fn<typeof fetch>(async (input) => {
    const url = requestUrl(input);
    if (url.pathname === `/api/v2/organizations/${ORGANIZATION_ID}`) {
      return jsonResponse(organizationResponse());
    }
    if (url.pathname === '/api/v2/projects') return jsonResponse(projectsResponse());
    if (url.pathname === `/api/v2/projects/${PROJECT_ID}`) {
      return jsonResponse(projectDetailResponse());
    }
    return jsonResponse({ message: 'unexpected provider request with secret body' }, 404);
  });
}

function limiterName(key: string): string {
  return key.slice(0, key.indexOf(':fn:'));
}

beforeAll(async () => {
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
  await adminFx?.stop();
}, 60_000);

describe('GET /admin/operations/neon-usage', () => {
  it('uses the default outbound wiring and returns the strict redacted shared contract', async () => {
    const response = await createApp().request('/admin/operations/neon-usage', {
      headers: {
        cookie: adminCookie,
        origin: ADMIN_ORIGIN,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = operations.neonUsageObservation.parse(await response.json());
    expect(body).toEqual({
      observedAt: expect.any(String),
      status: 'available',
      organizationId: ORGANIZATION_ID,
      plan: 'free',
      projectsTruncated: false,
      unavailableProjectCount: 0,
      projects: [
        {
          status: 'available',
          id: PROJECT_ID,
          name: 'Harpa Pro usage integration',
          effectivePermission: 'VIEWER',
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          compute: { used: 180_000, allowance: 360_000, unit: 'cu_seconds' },
          storage: { used: 125_000_000, allowance: 500_000_000, unit: 'bytes' },
          transferBytes: 1_000_000_000,
        },
      ],
      organizationTransfer: {
        status: 'available',
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        used: 1_000_000_000,
        allowance: 5_000_000_000,
        unit: 'bytes',
      },
      caveats: EXPECTED_CAVEATS,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [organizationCall, projectsCall, projectDetailCall] = fetchImpl.mock.calls;
    expect(organizationCall).toBeDefined();
    expect(projectsCall).toBeDefined();
    expect(projectDetailCall).toBeDefined();

    const [organizationInput, organizationInit] = organizationCall!;
    expect(requestUrl(organizationInput)).toMatchObject({
      origin: 'https://console.neon.tech',
      pathname: `/api/v2/organizations/${ORGANIZATION_ID}`,
      search: '',
    });

    const [projectsInput, projectsInit] = projectsCall!;
    const projectsUrl = requestUrl(projectsInput);
    expect(projectsUrl).toMatchObject({
      origin: 'https://console.neon.tech',
      pathname: '/api/v2/projects',
    });
    expect(Object.fromEntries(projectsUrl.searchParams)).toEqual({
      org_id: ORGANIZATION_ID,
      limit: '20',
      timeout: '5000',
    });

    const [projectDetailInput, projectDetailInit] = projectDetailCall!;
    expect(requestUrl(projectDetailInput)).toMatchObject({
      origin: 'https://console.neon.tech',
      pathname: `/api/v2/projects/${PROJECT_ID}`,
      search: '',
    });

    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({ method: 'GET', redirect: 'error' });
      expect(init?.body).toBeUndefined();
      expect(new Headers(init?.headers).get('accept')).toBe('application/json');
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${NEON_API_KEY}`);
    }
    expect(organizationInit?.signal).toBeDefined();
    expect(projectsInit?.signal).toBe(organizationInit?.signal);
    expect(projectDetailInit?.signal).toBe(organizationInit?.signal);

    expect(adminRateLimiter.calls.map(({ key }) => limiterName(key))).toEqual([
      'admin.auth.ip.1m',
      'admin.operations.neon-usage.read.1m',
    ]);
    expect(adminRateLimiter.calls).toEqual([
      expect.objectContaining({ limit: 120, windowMs: 60_000 }),
      expect.objectContaining({ limit: 12, windowMs: 60_000 }),
    ]);

    const serialized = JSON.stringify(body);
    for (const secret of [
      NEON_API_KEY,
      'Secret Harpa organization name',
      'secret-harpa-handle',
      'secret-member-id',
      'secret-member@example.com',
      'secret-owner-id',
      'secret-project-host',
      'secret-detail-host',
      'secret-endpoint-id',
      'secret-endpoint.neon.tech',
      'secret-application-id',
      'secret-integration-id',
      'postgres://secret:password',
      'secret_setting',
      'unexpected provider request with secret body',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('runs no-store and the shared IP window before rejecting an absent admin cookie', async () => {
    const response = await createApp().request('/admin/operations/neon-usage');

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(adminRateLimiter.calls.map(({ key }) => limiterName(key))).toEqual(['admin.auth.ip.1m']);
  });

  it('keeps no-store and rejects on an isolated 12/min session budget before Neon', async () => {
    class RejectingNeonUsageLimiter extends RecordingRateLimiter {
      override async consume(
        key: string,
        limit: number,
        windowMs: number,
      ): Promise<RateLimiterResult> {
        const result = await super.consume(key, limit, windowMs);
        return key.startsWith('admin.operations.neon-usage.read.1m:')
          ? { ...result, success: false, remaining: 0 }
          : result;
      }
    }
    const rejectingLimiter = new RejectingNeonUsageLimiter();
    setAdminRateLimiter(rejectingLimiter);

    const response = await createApp().request('/admin/operations/neon-usage', {
      headers: {
        cookie: adminCookie,
        origin: ADMIN_ORIGIN,
      },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(rejectingLimiter.calls.map(({ key }) => limiterName(key))).toEqual([
      'admin.auth.ip.1m',
      'admin.operations.neon-usage.read.1m',
    ]);
    expect(rejectingLimiter.calls[1]).toMatchObject({ limit: 12, windowMs: 60_000 });
  });
});
