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
      ADMIN_CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
      ADMIN_CLOUDFLARE_R2_OBSERVER_API_TOKEN: 'route-default-r2-observer-token',
    },
  };
});

const ADMIN_ORIGIN = 'http://localhost:3102';
const ADMIN_EMAIL = 'r2-capacity-operations@harpapro.com';
const ADMIN_PASSWORD = 'r2 capacity operations admin password deliberately long';
const CLOUDFLARE_ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const CLOUDFLARE_TOKEN = 'route-default-r2-observer-token';

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

function bucketResponse() {
  return {
    success: true,
    errors: [],
    messages: [],
    result: {
      buckets: [
        {
          name: 'harpa-pro-integration',
          jurisdiction: 'default',
          location: 'apac',
          storage_class: 'Standard',
          creation_date: '2026-07-01T09:00:00.000Z',
        },
      ],
    },
    result_info: { cursor: '', per_page: 100 },
  };
}

function metricsResponse() {
  return {
    success: true,
    errors: [],
    messages: [],
    result: {
      standard: {
        published: { payloadSize: 1024, metadataSize: 128, objects: 3 },
        uploaded: { payloadSize: 10, metadataSize: 2, objects: 1 },
      },
      infrequentAccess: {
        published: { payloadSize: 2048, metadataSize: 256, objects: 4 },
        uploaded: { payloadSize: 20, metadataSize: 4, objects: 2 },
      },
    },
  };
}

function operationsResponse() {
  return {
    data: {
      viewer: {
        accounts: [
          {
            r2OperationsAdaptiveGroups: [
              {
                dimensions: { actionType: 'PutObject', actionStatus: 'success' },
                sum: { requests: 25 },
              },
              {
                dimensions: { actionType: 'GetObject', actionStatus: 'success' },
                sum: { requests: 40 },
              },
              {
                dimensions: { actionType: 'DeleteObject', actionStatus: 'success' },
                sum: { requests: 5 },
              },
              {
                dimensions: { actionType: 'PutObject', actionStatus: 'userError' },
                sum: { requests: 999 },
              },
            ],
          },
        ],
      },
    },
  };
}

function defaultProviderFetch() {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = requestUrl(input);
    if (
      init?.method === 'GET' &&
      url.pathname === `/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets`
    ) {
      return jsonResponse(bucketResponse());
    }
    if (
      init?.method === 'GET' &&
      url.pathname === `/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/metrics`
    ) {
      return jsonResponse(metricsResponse());
    }
    if (init?.method === 'POST' && url.pathname === '/client/v4/graphql') {
      return jsonResponse(operationsResponse());
    }
    return jsonResponse({ message: 'unexpected provider request' }, 404);
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

describe('GET /admin/operations/r2-capacity', () => {
  it('uses the default outbound fetch wiring and returns only the redacted contract', async () => {
    const response = await createApp().request('/admin/operations/r2-capacity', {
      headers: {
        cookie: adminCookie,
        origin: ADMIN_ORIGIN,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = (await response.json()) as { caveats: unknown[] } & Record<string, unknown>;
    expect(body).toMatchObject({
      status: 'available',
      observedAt: expect.any(String),
      freeTierReference: {
        storageGbMonth: 10,
        classAOperations: 1_000_000,
        classBOperations: 10_000_000,
        appliesTo: 'standard_only',
      },
      buckets: {
        status: 'available',
        truncated: false,
        items: [
          {
            name: 'harpa-pro-integration',
            jurisdiction: 'default',
            location: 'apac',
            defaultStorageClass: 'standard',
            createdAt: '2026-07-01T09:00:00.000Z',
          },
        ],
      },
      storage: {
        status: 'available',
        standard: {
          publishedPayloadBytes: 1024,
          publishedMetadataBytes: 128,
          publishedObjects: 3,
          uploadingPayloadBytes: 10,
          uploadingMetadataBytes: 2,
          uploadingObjects: 1,
        },
        infrequentAccess: {
          publishedPayloadBytes: 2048,
          publishedMetadataBytes: 256,
          publishedObjects: 4,
          uploadingPayloadBytes: 20,
          uploadingMetadataBytes: 4,
          uploadingObjects: 2,
        },
      },
      operations: {
        status: 'available',
        windowStart: expect.any(String),
        windowEnd: expect.any(String),
        classA: {
          estimatedUsed: 25,
          publishedAllowance: 1_000_000,
          estimatedRemaining: 999_975,
        },
        classB: {
          estimatedUsed: 40,
          publishedAllowance: 10_000_000,
          estimatedRemaining: 9_999_960,
        },
        freeRequests: 5,
        unclassifiedRequests: 0,
      },
    });
    expect(body.caveats).toHaveLength(4);
    expect(body.caveats).toEqual(
      expect.arrayContaining([
        'storage_snapshot_not_gb_month',
        'storage_metrics_may_lag',
        'infrequent_access_not_covered_by_free_tier',
        'operations_estimated_from_analytics',
      ]),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [bucketCall, metricsCall, graphqlCall] = fetchImpl.mock.calls;
    expect(bucketCall).toBeDefined();
    expect(metricsCall).toBeDefined();
    expect(graphqlCall).toBeDefined();

    const [bucketInput, bucketInit] = bucketCall!;
    const bucketUrl = requestUrl(bucketInput);
    expect(bucketUrl).toMatchObject({
      origin: 'https://api.cloudflare.com',
      pathname: `/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets`,
    });
    expect(Object.fromEntries(bucketUrl.searchParams)).toEqual({
      per_page: '100',
      direction: 'asc',
      order: 'name',
    });
    expect(bucketInit?.method).toBe('GET');

    const [metricsInput, metricsInit] = metricsCall!;
    const metricsUrl = requestUrl(metricsInput);
    expect(metricsUrl).toMatchObject({
      origin: 'https://api.cloudflare.com',
      pathname: `/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/metrics`,
      search: '',
    });
    expect(metricsInit?.method).toBe('GET');

    const [graphqlInput, graphqlInit] = graphqlCall!;
    expect(requestUrl(graphqlInput)).toMatchObject({
      origin: 'https://api.cloudflare.com',
      pathname: '/client/v4/graphql',
      search: '',
    });
    expect(graphqlInit?.method).toBe('POST');
    expect(new Headers(graphqlInit?.headers).get('content-type')).toBe('application/json');
    const graphqlBody = JSON.parse(String(graphqlInit?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    expect(Object.keys(graphqlBody).sort()).toEqual(['query', 'variables']);
    expect(graphqlBody.query).toContain('r2OperationsAdaptiveGroups');
    expect(graphqlBody.query).toContain('limit: 10000');
    expect(graphqlBody.query).toContain('actionType');
    expect(graphqlBody.query).toContain('actionStatus');
    expect(graphqlBody.query).toContain('requests');
    expect(graphqlBody.variables.accountTag).toBe(CLOUDFLARE_ACCOUNT_ID);
    expect(graphqlBody.variables.startDate).toEqual(expect.any(String));
    expect(graphqlBody.variables.endDate).toEqual(expect.any(String));

    for (const [, init] of fetchImpl.mock.calls) {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${CLOUDFLARE_TOKEN}`);
      expect(new Headers(init?.headers).get('accept')).toBe('application/json');
    }
    expect(bucketInit?.signal).toBeDefined();
    expect(metricsInit?.signal).toBe(bucketInit?.signal);
    expect(graphqlInit?.signal).toBe(bucketInit?.signal);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(CLOUDFLARE_TOKEN);
    expect(serialized).not.toContain(CLOUDFLARE_ACCOUNT_ID);
    expect(serialized).not.toContain('PutObject');
    expect(serialized).not.toContain('userError');
    expect(serialized).not.toContain('dimensions');
    expect(serialized).not.toContain('sum');

    expect(
      adminRateLimiter.calls.find(({ key }) => key.startsWith('admin.auth.ip.1m:fn:')),
    ).toMatchObject({ limit: 120, windowMs: 60_000 });
    expect(
      adminRateLimiter.calls.find(({ key }) =>
        key.startsWith('admin.operations.r2-capacity.read.1m:fn:'),
      ),
    ).toMatchObject({ limit: 12, windowMs: 60_000 });
  });

  it('keeps private no-store when a dedicated admin cookie is absent', async () => {
    const response = await createApp().request('/admin/operations/r2-capacity');

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps private no-store on an isolated route-specific rate-limit response', async () => {
    class RejectingR2CapacityLimiter extends RecordingRateLimiter {
      override async consume(
        key: string,
        limit: number,
        windowMs: number,
      ): Promise<RateLimiterResult> {
        const result = await super.consume(key, limit, windowMs);
        return key.startsWith('admin.operations.r2-capacity.read.1m:')
          ? { ...result, success: false, remaining: 0 }
          : result;
      }
    }
    setAdminRateLimiter(new RejectingR2CapacityLimiter());

    const response = await createApp().request('/admin/operations/r2-capacity', {
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
