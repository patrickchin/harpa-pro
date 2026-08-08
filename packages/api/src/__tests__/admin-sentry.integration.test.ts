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
      ADMIN_SENTRY_ORG_SLUG: 'harpa-pro',
      ADMIN_SENTRY_READ_TOKEN: 'route-default-sentry-read-token',
      ADMIN_SENTRY_PROJECT_SLUGS: 'harpa-pro-api,harpa-pro-mobile',
      ADMIN_SENTRY_MOBILE_PROJECT_SLUG: 'harpa-pro-mobile',
      ADMIN_SENTRY_ENVIRONMENT: 'production',
      ADMIN_SENTRY_REGION: 'global',
    },
  };
});

const ADMIN_ORIGIN = 'http://localhost:3102';
const ADMIN_EMAIL = 'sentry-operations@harpapro.com';
const ADMIN_PASSWORD = 'sentry operations admin password deliberately long';
const ADMIN_CLIENT_IP = '203.0.113.92';
const SENTRY_TOKEN = 'route-default-sentry-read-token';
const PROVIDER_RESPONSE_SECRET = 'provider-response-header-must-not-leak';
const PROVIDER_LINK_HEADER =
  '<https://sentry.io/api/0/organizations/harpa-pro/issues/?cursor=0:0:0>; rel="next"; results="false"';
const SESSION_WINDOW_START = '2026-08-07T05:30:00.000Z';
const SESSION_WINDOW_END = '2026-08-08T05:30:00.000Z';
const EXPECTED_ISSUES_URL =
  'https://sentry.io/api/0/organizations/harpa-pro/issues/' +
  '?project=harpa-pro-api&project=harpa-pro-mobile' +
  '&environment=production&query=is%3Aunresolved&sort=date&limit=100' +
  '&shortIdLookup=0&collapse=filtered&collapse=lifetime&collapse=stats&collapse=unhandled';
const EXPECTED_SESSIONS_URL =
  'https://sentry.io/api/0/organizations/harpa-pro/sessions/' +
  '?project=harpa-pro-mobile&environment=production&statsPeriod=24h&interval=1h' +
  '&field=sum%28session%29&groupBy=session.status&includeTotals=1&includeSeries=0';

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

function expectExactSentryIdentitySessionLimit(
  call: { key: string; limit: number; windowMs: number } | undefined,
): void {
  const expectedPrefix = 'admin.operations.sentry.read.1m:fn:';
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

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-provider-secret': PROVIDER_RESPONSE_SECRET,
      ...headers,
    },
  });
}

function requestUrl(input: string | URL | Request): URL {
  if (input instanceof Request) return new URL(input.url);
  return new URL(input.toString());
}

function sessionIntervals(): string[] {
  const start = Date.parse(SESSION_WINDOW_START);
  return Array.from({ length: 24 }, (_, index) =>
    new Date(start + index * 60 * 60 * 1_000).toISOString(),
  );
}

function defaultProviderFetch() {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = requestUrl(input);
    if (url.toString() === EXPECTED_ISSUES_URL) {
      return jsonResponse(
        [
          {
            issueCategory: 'error',
            id: 'secret-issue-id-1',
            title: 'issue title must not leak',
            culprit: 'private provider culprit',
          },
          { issueCategory: 'performance', id: 'secret-performance-issue' },
          {
            issueCategory: 'error',
            id: 'secret-issue-id-2',
            metadata: { user: { email: 'provider-user@example.com' } },
          },
        ],
        200,
        {
          Link: PROVIDER_LINK_HEADER,
        },
      );
    }
    if (url.toString() === EXPECTED_SESSIONS_URL) {
      return jsonResponse({
        groups: [
          {
            by: { 'session.status': 'healthy' },
            totals: { 'sum(session)': 9 },
            series: { 'sum(session)': ['private-series-must-not-leak'] },
          },
          {
            by: { 'session.status': 'crashed' },
            totals: { 'sum(session)': 1 },
            release: 'com.harpa.pro@private-release',
          },
        ],
        intervals: sessionIntervals(),
        start: SESSION_WINDOW_START,
        end: SESSION_WINDOW_END,
        query: 'private-provider-query',
      });
    }
    return jsonResponse({ message: 'unexpected provider request with private body' }, 404);
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

describe('GET /admin/operations/sentry', () => {
  it('uses the default global fetch wiring for exactly two fixed redacted provider reads', async () => {
    const response = await createApp().request('/admin/operations/sentry', adminRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.has('x-provider-secret')).toBe(false);
    expect(response.headers.has('link')).toBe(false);
    expect(response.headers.has('authorization')).toBe(false);
    const serializedResponseHeaders = JSON.stringify([...response.headers.entries()]);
    for (const secret of [
      PROVIDER_RESPONSE_SECRET,
      PROVIDER_LINK_HEADER,
      'cursor=0:0:0',
      SENTRY_TOKEN,
      `Bearer ${SENTRY_TOKEN}`,
    ]) {
      expect(serializedResponseHeaders).not.toContain(secret);
    }
    const body = await response.json();
    expect(body).toEqual({
      observedAt: expect.any(String),
      status: 'available',
      unresolvedErrors: {
        status: 'available',
        count: 2,
        countKind: 'exact',
        cap: 100,
      },
      mobileSessions: {
        status: 'available',
        window: 'last_24_hours',
        windowStart: SESSION_WINDOW_START,
        windowEnd: SESSION_WINDOW_END,
        totalSessions: 10,
        healthySessions: 9,
        erroredSessions: 0,
        abnormalSessions: 0,
        crashedSessions: 1,
      },
      caveats: ['issue_groups_not_events', 'mobile_sessions_only', 'telemetry_coverage_applies'],
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(([input]) => requestUrl(input).toString())).toEqual([
      EXPECTED_ISSUES_URL,
      EXPECTED_SESSIONS_URL,
    ]);
    const issueInit = fetchImpl.mock.calls[0]?.[1];
    const sessionInit = fetchImpl.mock.calls[1]?.[1];
    expect(issueInit?.signal).toBeDefined();
    expect(sessionInit?.signal).toBe(issueInit?.signal);
    for (const init of [issueInit, sessionInit]) {
      expect(init).toMatchObject({ method: 'GET', redirect: 'error' });
      expect(init?.body).toBeUndefined();
      expect([...new Headers(init?.headers).entries()]).toEqual([
        ['accept', 'application/json'],
        ['authorization', `Bearer ${SENTRY_TOKEN}`],
      ]);
    }

    const serialized = JSON.stringify(body);
    for (const secret of [
      SENTRY_TOKEN,
      'harpa-pro-api',
      'harpa-pro-mobile',
      PROVIDER_RESPONSE_SECRET,
      'secret-issue-id',
      'issue title must not leak',
      'private provider culprit',
      'provider-user@example.com',
      'private-series-must-not-leak',
      'com.harpa.pro@private-release',
      'private-provider-query',
    ]) {
      expect(serialized).not.toContain(secret);
    }

    expect(adminRateLimiter.calls.map(({ key }) => limiterName(key))).toEqual([
      'admin.auth.ip.1m',
      'admin.operations.sentry.read.1m',
    ]);
    expect(adminRateLimiter.calls[0]).toEqual({
      key: `admin.auth.ip.1m:fn:${ADMIN_CLIENT_IP}`,
      limit: 120,
      windowMs: 60_000,
    });
    expectExactSentryIdentitySessionLimit(adminRateLimiter.calls[1]);
  });

  it('sets private no-store and runs the shared IP window before rejecting an absent cookie', async () => {
    const response = await createApp().request('/admin/operations/sentry', {
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

  it('returns private no-store 429 on its isolated identity-session limit before Sentry', async () => {
    class RejectingSentryLimiter extends RecordingRateLimiter {
      override async consume(
        key: string,
        limit: number,
        windowMs: number,
      ): Promise<RateLimiterResult> {
        const result = await super.consume(key, limit, windowMs);
        return key.startsWith('admin.operations.sentry.read.1m:')
          ? { ...result, success: false, remaining: 0 }
          : result;
      }
    }
    const rejectingLimiter = new RejectingSentryLimiter();
    setAdminRateLimiter(rejectingLimiter);

    const response = await createApp().request('/admin/operations/sentry', adminRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(rejectingLimiter.calls.map(({ key }) => limiterName(key))).toEqual([
      'admin.auth.ip.1m',
      'admin.operations.sentry.read.1m',
    ]);
    expect(rejectingLimiter.calls[0]).toEqual({
      key: `admin.auth.ip.1m:fn:${ADMIN_CLIENT_IP}`,
      limit: 120,
      windowMs: 60_000,
    });
    expectExactSentryIdentitySessionLimit(rejectingLimiter.calls[1]);
  });
});
