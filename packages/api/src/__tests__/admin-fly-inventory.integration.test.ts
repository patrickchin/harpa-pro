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
      ADMIN_FLY_APP_NAMES: 'harpa-pro-api',
      ADMIN_FLY_ORG_SLUG: 'harpa-pro',
      ADMIN_FLY_READ_ONLY_API_TOKEN: 'route-default-fly-read-only-token',
    },
  };
});

const ADMIN_ORIGIN = 'http://localhost:3102';
const ADMIN_EMAIL = 'fly-inventory-operations@harpapro.com';
const ADMIN_PASSWORD = 'fly inventory operations admin password deliberately long';
const ADMIN_CLIENT_IP = '203.0.113.91';
const FLY_APP_NAME = 'harpa-pro-api';
const FLY_ORG_SLUG = 'harpa-pro';
const FLY_TOKEN = 'route-default-fly-read-only-token';

let adminFx: AdminPgFixture;
let adminCookie: string;
let adminIdentityId: string;
let adminSessionId: string;
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

function limiterName(key: string): string {
  const separator = key.indexOf(':fn:');
  return separator === -1 ? key : key.slice(0, separator);
}

function expectExactFlyIdentitySessionLimit(
  call: { key: string; limit: number; windowMs: number } | undefined,
): void {
  const expectedPrefix = 'admin.operations.fly-inventory.read.1m:fn:';
  expect(call).toEqual({
    key: `${expectedPrefix}${adminIdentityId}:${adminSessionId}`,
    limit: 12,
    windowMs: 60_000,
  });
  expect(call?.key).not.toBe(`${expectedPrefix}${ADMIN_CLIENT_IP}`);
  expect(call?.key).not.toBe(`${expectedPrefix}${adminIdentityId}`);
}

function adminRequest(cookie = adminCookie): RequestInit {
  return {
    headers: {
      cookie,
      origin: ADMIN_ORIGIN,
      'fly-client-ip': ADMIN_CLIENT_IP,
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-provider-secret': 'provider-response-header-must-not-leak',
    },
  });
}

function requestUrl(input: string | URL | Request): URL {
  if (input instanceof Request) return new URL(input.url);
  return new URL(input.toString());
}

function organizationAppsResponse() {
  return {
    total_apps: 2,
    apps: [
      {
        id: FLY_APP_NAME,
        name: FLY_APP_NAME,
        status: 'deployed',
        network: 'default',
        organization: {
          slug: FLY_ORG_SLUG,
          name: 'Harpa Pro provider organization display name',
        },
        machine_count: 1,
        volume_count: 1,
      },
      {
        id: 'secret-shadow-app',
        name: 'secret-shadow-app',
        status: 'deployed',
        network: 'secret-shadow-network',
        organization: { slug: FLY_ORG_SLUG },
        machine_count: 99,
        volume_count: 99,
      },
    ],
  };
}

function appResponse() {
  return {
    id: FLY_APP_NAME,
    name: FLY_APP_NAME,
    status: 'deployed',
    network: 'default',
    organization: {
      slug: FLY_ORG_SLUG,
      name: 'Harpa Pro provider organization display name',
      billing_email: 'provider-billing-secret@example.com',
    },
    secrets: ['app-detail-secret'],
  };
}

function machinesResponse() {
  return [
    {
      id: 'machine-integration',
      name: 'api-primary',
      state: 'started',
      region: 'sin',
      instance_id: 'secret-instance-id',
      private_ip: 'fdaa:0:secret::2',
      image_ref: {
        registry: 'registry.fly.io',
        repository: 'secret-image-repository',
        tag: 'secret-image-tag',
        digest: 'sha256:secret-image-digest',
      },
      config: {
        env: { SECRET_ENVIRONMENT_VALUE: 'secret-machine-env' },
        guest: { cpu_kind: 'shared', cpus: 1, memory_mb: 512 },
        metadata: {
          fly_process_group: 'worker',
          secret: 'secret-machine-metadata',
        },
        services: [{ protocol: 'tcp', internal_port: 8080 }],
        checks: { readiness: { path: '/secret-readiness-path' } },
      },
      events: [{ type: 'start', request: { secret: 'secret-machine-event' } }],
      created_at: '2026-08-01T01:02:03Z',
      updated_at: '2026-08-08T04:05:06Z',
    },
  ];
}

function volumesResponse() {
  return [
    {
      id: 'volume-integration',
      name: 'data',
      state: 'created',
      size_gb: 10,
      region: 'sin',
      zone: 'secret-volume-zone',
      encrypted: true,
      attached_machine_id: 'machine-integration',
      created_at: '2026-08-02T02:03:04Z',
      snapshot_retention: 5,
      auto_backup_enabled: true,
      attached_alloc_id: 'secret-attached-allocation-id',
      host_dedication_key: 'secret-host-dedication-key',
      fstype: 'secret-filesystem-type',
      blocks: 1_000,
      block_size: 4096,
      blocks_free: 500,
      blocks_avail: 400,
    },
  ];
}

function defaultProviderFetch() {
  return vi.fn<typeof fetch>(async (input) => {
    const url = requestUrl(input);
    if (url.pathname === '/v1/apps' && url.searchParams.get('org_slug') === FLY_ORG_SLUG) {
      return jsonResponse(organizationAppsResponse());
    }
    if (url.pathname === `/v1/apps/${FLY_APP_NAME}`) return jsonResponse(appResponse());
    if (
      url.pathname === `/v1/apps/${FLY_APP_NAME}/machines` &&
      url.searchParams.get('include_deleted') === 'false'
    ) {
      return jsonResponse(machinesResponse());
    }
    if (url.pathname === `/v1/apps/${FLY_APP_NAME}/volumes`) {
      return jsonResponse(volumesResponse());
    }
    return jsonResponse({ message: 'unexpected provider request with secret body' }, 404);
  });
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
      'fly-client-ip': ADMIN_CLIENT_IP,
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

  const activeSession = await getAdminPool().query<{
    identity_id: string;
    session_id: string;
  }>(
    `SELECT identity.id::text AS identity_id,
            session.id::text AS session_id
     FROM admin.sessions AS session
     JOIN admin.identities AS identity
       ON identity.id = session.admin_identity_id
     WHERE identity.email = $1
       AND session.revoked_at IS NULL
     ORDER BY session.created_at DESC
     LIMIT 1`,
    [ADMIN_EMAIL],
  );
  const loggedInSession = activeSession.rows[0];
  if (!loggedInSession) throw new Error('dedicated admin login did not persist an active session');
  adminIdentityId = loggedInSession.identity_id;
  adminSessionId = loggedInSession.session_id;
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
  await resetAdminPool();
  await adminFx?.stop();
}, 60_000);

describe('GET /admin/operations/fly-inventory', () => {
  it('uses the default env and global fetch wiring and returns only the strict redacted contract', async () => {
    const response = await createApp().request('/admin/operations/fly-inventory', adminRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body).toEqual({
      observedAt: expect.any(String),
      status: 'available',
      organizationSlug: FLY_ORG_SLUG,
      configuredAppCount: 1,
      unavailableConfiguredAppCount: 0,
      apps: [
        {
          id: FLY_APP_NAME,
          name: FLY_APP_NAME,
          status: 'deployed',
          network: 'default',
          reportedMachineCount: 1,
          reportedVolumeCount: 1,
          machines: {
            status: 'available',
            truncated: false,
            items: [
              {
                id: 'machine-integration',
                name: 'api-primary',
                state: 'started',
                processGroup: 'worker',
                region: 'sin',
                cpuKind: 'shared',
                cpus: 1,
                memoryMb: 512,
                createdAt: '2026-08-01T01:02:03.000Z',
                updatedAt: '2026-08-08T04:05:06.000Z',
              },
            ],
          },
          volumes: {
            status: 'available',
            truncated: false,
            returnedAllocatedGb: 10,
            items: [
              {
                id: 'volume-integration',
                name: 'data',
                state: 'created',
                sizeGb: 10,
                region: 'sin',
                encrypted: true,
                attachedMachineId: 'machine-integration',
                createdAt: '2026-08-02T02:03:04.000Z',
                snapshotRetentionDays: 5,
                autoBackupEnabled: true,
              },
            ],
          },
        },
      ],
    });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const calledUrls = fetchImpl.mock.calls.map(([input]) => requestUrl(input).toString());
    expect(calledUrls[0]).toBe(`https://api.machines.dev/v1/apps?org_slug=${FLY_ORG_SLUG}`);
    expect(calledUrls.slice(1).sort()).toEqual(
      [
        `https://api.machines.dev/v1/apps/${FLY_APP_NAME}`,
        `https://api.machines.dev/v1/apps/${FLY_APP_NAME}/machines?include_deleted=false`,
        `https://api.machines.dev/v1/apps/${FLY_APP_NAME}/volumes`,
      ].sort(),
    );

    const sharedSignal = fetchImpl.mock.calls[0]?.[1]?.signal;
    expect(sharedSignal).toBeDefined();
    for (const [input, init] of fetchImpl.mock.calls) {
      expect(requestUrl(input).origin).toBe('https://api.machines.dev');
      expect(init).toMatchObject({ method: 'GET', redirect: 'error' });
      expect(init?.body).toBeUndefined();
      expect(init?.signal).toBe(sharedSignal);
      const headers = new Headers(init?.headers);
      expect(headers.get('accept')).toBe('application/json');
      expect(headers.get('authorization')).toBe(`Bearer ${FLY_TOKEN}`);
    }

    const serialized = JSON.stringify(body);
    for (const secret of [
      FLY_TOKEN,
      'provider-response-header-must-not-leak',
      'secret-shadow-app',
      'secret-shadow-network',
      'provider-billing-secret@example.com',
      'app-detail-secret',
      'secret-instance-id',
      'fdaa:0:secret::2',
      'secret-image-repository',
      'secret-image-tag',
      'secret-image-digest',
      'secret-machine-env',
      'secret-machine-metadata',
      'fly_process_group',
      'secret-readiness-path',
      'secret-machine-event',
      'secret-volume-zone',
      'secret-attached-allocation-id',
      'secret-host-dedication-key',
      'secret-filesystem-type',
      'blocks_free',
    ]) {
      expect(serialized).not.toContain(secret);
    }

    expect(adminRateLimiter.calls.map(({ key }) => limiterName(key))).toEqual([
      'admin.auth.ip.1m',
      'admin.operations.fly-inventory.read.1m',
    ]);
    expect(adminRateLimiter.calls[0]).toEqual({
      key: `admin.auth.ip.1m:fn:${ADMIN_CLIENT_IP}`,
      limit: 120,
      windowMs: 60_000,
    });
    expectExactFlyIdentitySessionLimit(adminRateLimiter.calls[1]);
  });

  it('runs no-store and the shared IP window before rejecting an absent admin cookie', async () => {
    const response = await createApp().request('/admin/operations/fly-inventory', {
      headers: { 'fly-client-ip': ADMIN_CLIENT_IP },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(adminRateLimiter.calls).toEqual([
      {
        key: `admin.auth.ip.1m:fn:${ADMIN_CLIENT_IP}`,
        limit: 120,
        windowMs: 60_000,
      },
    ]);
  });

  it('keeps no-store and rejects on an isolated 12/min session budget before Fly', async () => {
    class RejectingFlyInventoryLimiter extends RecordingRateLimiter {
      override async consume(
        key: string,
        limit: number,
        windowMs: number,
      ): Promise<RateLimiterResult> {
        const result = await super.consume(key, limit, windowMs);
        return key.startsWith('admin.operations.fly-inventory.read.1m:')
          ? { ...result, success: false, remaining: 0 }
          : result;
      }
    }
    const rejectingLimiter = new RejectingFlyInventoryLimiter();
    setAdminRateLimiter(rejectingLimiter);

    const response = await createApp().request('/admin/operations/fly-inventory', adminRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(rejectingLimiter.calls.map(({ key }) => limiterName(key))).toEqual([
      'admin.auth.ip.1m',
      'admin.operations.fly-inventory.read.1m',
    ]);
    expectExactFlyIdentitySessionLimit(rejectingLimiter.calls[1]);
  });
});
