import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { getAdminPool, resetAdminPool } from '../db/admin-client.js';
import { resetAdminRateLimiter, setAdminRateLimiter } from '../lib/adminRateLimiter.js';
import {
  MemoryRateLimiter,
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
      BETTER_AUTH_URL: 'https://api.internal.test',
      TEST_ACCOUNT_EMAILS: 'report-canary@e2e.harpapro.com',
      TEST_ACCOUNT_PASSWORD: 'report canary password sentinel',
      ADMIN_REPORT_DIAGNOSTIC_EMAIL: 'report-canary@e2e.harpapro.com',
      ADMIN_REPORT_DIAGNOSTIC_PROJECT_ID: 'prj_01234567',
      ADMIN_REPORT_DIAGNOSTIC_REPORT_NUMBER: 7,
      ADMIN_NEON_VIEWER_API_KEY: undefined,
      ADMIN_NEON_ORG_ID: undefined,
    },
  };
});

const ADMIN_ORIGIN = 'http://localhost:3102';
const ADMIN_EMAIL = 'report-diagnostic-admin@harpapro.com';
const ADMIN_PASSWORD = 'report diagnostic admin password deliberately long';
const CANARY_EMAIL = 'report-canary@e2e.harpapro.com';
const CANARY_PASSWORD = 'report canary password sentinel';
const PROJECT_ID = 'prj_01234567';
const REPORT_ID = 'rpt_01234567';
const REPORT_NUMBER = 7;
const APP_SESSION_TOKEN = '0123456789abcdef0123456789abcdef';
const BEFORE_UPDATED_AT = '2026-08-08T07:50:00.000Z';
const REQUESTED_AT = '2026-08-08T08:00:00.000Z';
const FINISHED_AT = '2026-08-08T08:00:02.000Z';
const AFTER_UPDATED_AT = '2026-08-08T08:00:02.000Z';
const RESET_AT = '2026-09-01T00:00:00.000Z';
const CSRF_HEADER = 'X-Admin-CSRF';
const APP_BEARER_TOKEN = 'better-auth-bearer-token-sentinel';
const APP_SESSION_COOKIE =
  'better-auth.session_token=better-auth-browser-cookie-sentinel.signature';

let adminFx: AdminPgFixture;
let adminCookie: string;
let adminCsrfToken: string;
let adminLoginBody: { authenticated: true; email: string; csrfToken?: string };
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
let adminLimiter: RecordingMemoryRateLimiter;

class FailingAppRateLimiter implements RateLimiter {
  async consume(): Promise<RateLimiterResult> {
    throw new Error('application rate limiter must not run for dedicated admin operations');
  }
}

class RecordingMemoryRateLimiter extends MemoryRateLimiter {
  readonly calls: Array<{ key: string; limit: number; windowMs: number }> = [];

  override async consume(key: string, limit: number, windowMs: number): Promise<RateLimiterResult> {
    this.calls.push({ key, limit, windowMs });
    return super.consume(key, limit, windowMs);
  }
}

function cookiePair(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('response did not set a cookie');
  return setCookie.split(';')[0]!;
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function report(updatedAt = BEFORE_UPDATED_AT, generatedAt: string | null = null) {
  return {
    id: REPORT_ID,
    number: REPORT_NUMBER,
    projectId: PROJECT_ID,
    status: 'draft',
    visitDate: null,
    body:
      generatedAt === null
        ? null
        : {
            meta: {
              title: 'SENTINEL_REPORT_TITLE',
              summary: 'SENTINEL_REPORT_SUMMARY',
              visitDate: null,
            },
            weather: null,
            workers: [],
            materials: [],
            issues: [],
            nextSteps: [],
            summarySections: [],
          },
    notesSinceLastGeneration: generatedAt === null ? 1 : 0,
    notesChangedAt: '2026-08-08T07:45:00.000Z',
    generatedAt,
    needsRegeneration: generatedAt === null,
    finalizedAt: null,
    pdfUrl: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt,
  };
}

function defaultRunnerFetch() {
  return vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.origin !== 'https://api.internal.test') {
      return jsonResponse({ message: 'unexpected origin' }, 404);
    }
    if (method === 'POST' && url.pathname === '/api/auth/sign-in/email') {
      return jsonResponse({ user: { id: 'usr_01234567', email: CANARY_EMAIL } }, 200, {
        'set-auth-token': APP_SESSION_TOKEN,
      });
    }
    if (method === 'GET' && url.pathname === `/projects/${PROJECT_ID}/reports/${REPORT_NUMBER}`) {
      return jsonResponse(report());
    }
    if (
      method === 'POST' &&
      url.pathname === `/projects/${PROJECT_ID}/reports/${REPORT_NUMBER}/generate`
    ) {
      return jsonResponse(
        {
          report: report(AFTER_UPDATED_AT, FINISHED_AT),
          debug: {
            systemPrompt: 'SENTINEL_GENERATE_SYSTEM_PROMPT',
            userPrompt: 'SENTINEL_GENERATE_USER_PROMPT',
            rawText: 'SENTINEL_RAW_MODEL_RESPONSE',
            model: 'gpt-5-mini',
            vendor: 'openai',
          },
        },
        200,
        { 'x-request-id': 'req-report-diagnostic-1' },
      );
    }
    if (
      method === 'GET' &&
      url.pathname === `/projects/${PROJECT_ID}/reports/${REPORT_NUMBER}/debug`
    ) {
      return jsonResponse({
        prompt: {
          system: 'SENTINEL_DEBUG_SYSTEM_PROMPT',
          user: 'SENTINEL_DEBUG_USER_PROMPT',
        },
        notes: [
          {
            id: 'not_01234567',
            kind: 'text',
            body: 'SENTINEL_SYNTHETIC_NOTE',
            transcript: null,
            files: [],
            createdAt: '2026-08-08T07:45:00.000Z',
          },
        ],
        lastGeneration: {
          requestedAt: REQUESTED_AT,
          finishedAt: FINISHED_AT,
          vendor: 'openai',
          model: 'gpt-5-mini',
          fixtureMode: 'live',
          systemPrompt: 'SENTINEL_PERSISTED_SYSTEM_PROMPT',
          userPrompt: 'SENTINEL_PERSISTED_USER_PROMPT',
          response: 'SENTINEL_PERSISTED_MODEL_RESPONSE',
          usage: null,
        },
      });
    }
    if (method === 'GET' && url.pathname === '/me/limits') {
      return jsonResponse({
        plan: 'free',
        buckets: [
          {
            kind: 'report_generate',
            limit: 10,
            used: 2,
            remaining: 8,
            resetAt: RESET_AT,
            plan: 'free',
            overridden: false,
          },
          {
            kind: 'ai_input_tokens',
            limit: 100_000,
            used: 1_000,
            remaining: 99_000,
            resetAt: RESET_AT,
            plan: 'free',
            overridden: false,
          },
          {
            kind: 'ai_output_tokens',
            limit: 20_000,
            used: 500,
            remaining: 19_500,
            resetAt: RESET_AT,
            plan: 'free',
            overridden: false,
          },
          {
            kind: 'voice_transcribe',
            limit: 30,
            used: 1,
            remaining: 29,
            resetAt: RESET_AT,
            plan: 'free',
            overridden: false,
          },
        ],
      });
    }
    if (method === 'POST' && url.pathname === '/api/auth/sign-out') {
      return jsonResponse({ success: true });
    }
    return jsonResponse({ message: 'unexpected application request' }, 404);
  });
}

async function loginAdmin(): Promise<{
  response: Response;
  body: { authenticated: true; email: string; csrfToken?: string };
  cookie: string;
}> {
  const response = await createApp().request('/admin/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ADMIN_ORIGIN,
    },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const body = (await response.clone().json()) as {
    authenticated: true;
    email: string;
    csrfToken?: string;
  };
  return { response, body, cookie: cookiePair(response) };
}

function diagnosticRequest(
  overrides: {
    cookie?: string;
    csrf?: string | null;
    origin?: string | null;
    authorization?: string;
  } = {},
): RequestInit {
  const headers = new Headers();
  const cookie = overrides.cookie === undefined ? adminCookie : overrides.cookie;
  const csrf = overrides.csrf === undefined ? adminCsrfToken : overrides.csrf;
  const origin = overrides.origin === undefined ? ADMIN_ORIGIN : overrides.origin;
  if (cookie) headers.set('cookie', cookie);
  if (csrf) headers.set(CSRF_HEADER, csrf);
  if (origin) headers.set('origin', origin);
  if (overrides.authorization) headers.set('authorization', overrides.authorization);
  return { method: 'POST', headers };
}

async function fetchCallRequest(index: number): Promise<Request> {
  const call = fetchImpl.mock.calls[index];
  if (!call) throw new Error(`missing fetch call ${index}`);
  return new Request(call[0], call[1]);
}

beforeAll(async () => {
  adminFx = await startAdminPg();
  process.env.ADMIN_DATABASE_URL = adminFx.url;
  await resetAdminPool();
  getAdminPool(adminFx.url);

  await setAdminPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  const login = await loginAdmin();
  if (login.response.status !== 200) {
    throw new Error(`dedicated admin login failed with ${login.response.status}`);
  }
  adminCookie = login.cookie;
  adminLoginBody = login.body;
  adminCsrfToken = login.body.csrfToken ?? '';
}, 120_000);

beforeEach(() => {
  resetRateLimiter();
  setRateLimiter(new FailingAppRateLimiter());
  resetAdminRateLimiter();
  adminLimiter = new RecordingMemoryRateLimiter();
  setAdminRateLimiter(adminLimiter);
  fetchImpl = defaultRunnerFetch();
  vi.stubGlobal('fetch', fetchImpl);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  resetRateLimiter();
  resetAdminRateLimiter();
  await adminFx?.stop();
}, 60_000);

describe('POST /admin/operations/report-generate security boundary', () => {
  it('issues the session-bound CSRF token at login and session lookup', async () => {
    expect(adminLoginBody).toEqual({
      authenticated: true,
      email: ADMIN_EMAIL,
      csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(adminCookie).toMatch(/^harpa_admin_session=[A-Za-z0-9_-]{43}$/);
    expect(adminCookie).not.toContain(adminCsrfToken);

    const session = await createApp().request('/admin/auth/session', {
      headers: { cookie: adminCookie, origin: ADMIN_ORIGIN },
    });
    expect(session.status).toBe(200);
    expect(session.headers.get('cache-control')).toBe('private, no-store');
    await expect(session.json()).resolves.toEqual({
      authenticated: true,
      email: ADMIN_EMAIL,
      csrfToken: adminCsrfToken,
    });
  });

  it('allows the CSRF header in credentialed CORS only for the exact admin origin', async () => {
    const accepted = await createApp().request('/admin/operations/report-generate', {
      method: 'OPTIONS',
      headers: {
        origin: ADMIN_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': CSRF_HEADER,
      },
    });
    expect(accepted.status).toBeGreaterThanOrEqual(200);
    expect(accepted.status).toBeLessThan(300);
    expect(accepted.headers.get('access-control-allow-origin')).toBe(ADMIN_ORIGIN);
    expect(accepted.headers.get('access-control-allow-credentials')).toBe('true');
    expect(accepted.headers.get('access-control-allow-headers')).toMatch(/x-admin-csrf/i);

    const rejected = await createApp().request('/admin/operations/report-generate', {
      method: 'OPTIONS',
      headers: {
        origin: `${ADMIN_ORIGIN}.evil.example`,
        'access-control-request-method': 'POST',
        'access-control-request-headers': CSRF_HEADER,
      },
    });
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects non-admin auth, untrusted origins, and absent or invalid CSRF before the runner', async () => {
    const cases: Array<{ name: string; expected: number; init: RequestInit }> = [
      {
        name: 'anonymous',
        expected: 401,
        init: diagnosticRequest({ cookie: '', csrf: 'A'.repeat(43) }),
      },
      {
        name: 'application Bearer',
        expected: 401,
        init: diagnosticRequest({
          cookie: '',
          csrf: 'A'.repeat(43),
          authorization: `Bearer ${APP_BEARER_TOKEN}`,
        }),
      },
      {
        name: 'Better Auth cookie',
        expected: 401,
        init: diagnosticRequest({ cookie: APP_SESSION_COOKIE, csrf: 'A'.repeat(43) }),
      },
      {
        name: 'missing Origin',
        expected: 403,
        init: diagnosticRequest({ origin: null }),
      },
      {
        name: 'untrusted Origin',
        expected: 403,
        init: diagnosticRequest({ origin: `${ADMIN_ORIGIN}.evil.example` }),
      },
      {
        name: 'missing CSRF',
        expected: 403,
        init: diagnosticRequest({ csrf: null }),
      },
      {
        name: 'invalid CSRF',
        expected: 403,
        init: diagnosticRequest({ csrf: 'A'.repeat(43) }),
      },
    ];

    for (const testCase of cases) {
      const response = await createApp().request(
        '/admin/operations/report-generate',
        testCase.init,
      );
      expect(response.status, testCase.name).toBe(testCase.expected);
      expect(response.headers.get('cache-control'), testCase.name).toBe('private, no-store');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('runs the unmodified default HTTP runner only after all admin gates pass', async () => {
    const response = await createApp().request(
      '/admin/operations/report-generate',
      diagnosticRequest(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body).toMatchObject({
      status: 'pass',
      target: {
        accountEmail: CANARY_EMAIL,
        projectId: PROJECT_ID,
        reportId: REPORT_ID,
        reportNumber: REPORT_NUMBER,
      },
      generation: {
        httpStatus: 200,
        requestId: 'req-report-diagnostic-1',
        vendor: 'openai',
        model: 'gpt-5-mini',
        fixtureMode: 'live',
      },
      cleanup: 'succeeded',
    });
    const serialized = JSON.stringify(body);
    for (const secret of [
      CANARY_PASSWORD,
      APP_SESSION_TOKEN,
      'SENTINEL_REPORT_TITLE',
      'SENTINEL_REPORT_SUMMARY',
      'SENTINEL_GENERATE_SYSTEM_PROMPT',
      'SENTINEL_GENERATE_USER_PROMPT',
      'SENTINEL_RAW_MODEL_RESPONSE',
      'SENTINEL_DEBUG_SYSTEM_PROMPT',
      'SENTINEL_DEBUG_USER_PROMPT',
      'SENTINEL_SYNTHETIC_NOTE',
      'SENTINEL_PERSISTED_SYSTEM_PROMPT',
      'SENTINEL_PERSISTED_USER_PROMPT',
      'SENTINEL_PERSISTED_MODEL_RESPONSE',
    ]) {
      expect(serialized).not.toContain(secret);
    }

    expect(fetchImpl).toHaveBeenCalledTimes(6);
    const requests = await Promise.all(
      Array.from({ length: 6 }, (_unused, index) => fetchCallRequest(index)),
    );
    expect(requests.map((request) => new URL(request.url).origin)).toEqual(
      Array.from({ length: 6 }, () => 'https://api.internal.test'),
    );
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        'POST /api/auth/sign-in/email',
        `GET /projects/${PROJECT_ID}/reports/${REPORT_NUMBER}`,
        `POST /projects/${PROJECT_ID}/reports/${REPORT_NUMBER}/generate`,
        `GET /projects/${PROJECT_ID}/reports/${REPORT_NUMBER}/debug`,
        'GET /me/limits',
        'POST /api/auth/sign-out',
      ],
    );
    await expect(requests[0]!.json()).resolves.toEqual({
      email: CANARY_EMAIL,
      password: CANARY_PASSWORD,
    });
    for (const request of requests.slice(1)) {
      expect(request.headers.get('authorization')).toBe(`Bearer ${APP_SESSION_TOKEN}`);
    }
    await expect(requests[2]!.json()).resolves.toEqual({ expectedUpdatedAt: BEFORE_UPDATED_AT });
    expect(requests[2]!.headers.get('idempotency-key')).toMatch(/^[A-Za-z0-9._:-]+$/);
    expect(requests[2]!.headers.get('idempotency-key')).not.toContain(CANARY_EMAIL);
    expect(requests[2]!.headers.get('idempotency-key')).not.toContain(CANARY_PASSWORD);
    await expect(requests[5]!.json()).resolves.toEqual({});
  });

  it('invalidates a CSRF token when the browser presents a different admin session', async () => {
    const rotated = await loginAdmin();
    expect(rotated.response.status).toBe(200);
    expect(rotated.body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rotated.body.csrfToken).not.toBe(adminCsrfToken);

    const stale = await createApp().request(
      '/admin/operations/report-generate',
      diagnosticRequest({ cookie: rotated.cookie, csrf: adminCsrfToken }),
    );
    expect(stale.status).toBe(403);
    expect(stale.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchImpl).not.toHaveBeenCalled();

    const current = await createApp().request(
      '/admin/operations/report-generate',
      diagnosticRequest({ cookie: rotated.cookie, csrf: rotated.body.csrfToken ?? '' }),
    );
    expect(current.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it('uses an isolated three-run/15-minute budget that Neon reads and the app limiter cannot spend', async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const neon = await createApp().request('/admin/operations/neon', {
        headers: { cookie: adminCookie, origin: ADMIN_ORIGIN },
      });
      expect(neon.status).toBe(200);
    }
    const neonExhausted = await createApp().request('/admin/operations/neon', {
      headers: { cookie: adminCookie, origin: ADMIN_ORIGIN },
    });
    expect(neonExhausted.status).toBe(429);
    expect(fetchImpl).not.toHaveBeenCalled();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const diagnostic = await createApp().request(
        '/admin/operations/report-generate',
        diagnosticRequest(),
      );
      expect(diagnostic.status).toBe(200);
      expect(diagnostic.headers.get('x-ratelimit-limit')).toBe('3');
    }
    expect(fetchImpl).toHaveBeenCalledTimes(18);

    const exhausted = await createApp().request(
      '/admin/operations/report-generate',
      diagnosticRequest(),
    );
    expect(exhausted.status).toBe(429);
    expect(exhausted.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchImpl).toHaveBeenCalledTimes(18);

    const diagnosticCalls = adminLimiter.calls.filter(
      ({ limit, windowMs }) => limit === 3 && windowMs === 15 * 60_000,
    );
    expect(diagnosticCalls).toHaveLength(4);
    expect(new Set(diagnosticCalls.map(({ key }) => key))).toHaveLength(1);
    expect(diagnosticCalls[0]?.key).not.toContain('admin.operations.neon.read');
  });
});
