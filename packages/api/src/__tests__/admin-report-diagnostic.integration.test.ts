import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { getAdminPool, resetAdminPool } from '../db/admin-client.js';
import { getPool, resetPool } from '../db/client.js';
import { env } from '../env.js';
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
import { seedAuthUsers, startPg, type PgFixture } from './setup-pg.js';

vi.mock('../env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../env.js')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'https://harpa-pro-api-dev.fly.dev',
      ADMIN_CORS_ORIGINS: 'https://dev.harpa-pro-admin.pages.dev',
      HARPAPRO_PR_BUILD: '0',
      AI_LIVE: '1',
      AI_FIXTURE_MODE: 'live',
      ADMIN_REPORT_LIVE_CANARY_ENABLED: '1',
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

const API_ORIGIN = 'https://harpa-pro-api-dev.fly.dev';
const ADMIN_ORIGIN = 'https://dev.harpa-pro-admin.pages.dev';
const ADMIN_EMAIL = 'report-diagnostic-admin@harpapro.com';
const ADMIN_PASSWORD = 'report diagnostic admin password deliberately long';
const CANARY_EMAIL = 'report-canary@e2e.harpapro.com';
const CANARY_PASSWORD = 'report canary password sentinel';
const CANARY_USER_ID = 'usr_01234567';
const PROJECT_ID = 'prj_01234567';
const REPORT_ID = 'rpt_01234567';
const REPORT_NUMBER = 7;
const APP_SESSION_TOKEN = '0123456789abcdef0123456789abcdef';
const NOTES_CHANGED_AT = '2026-08-08T07:45:00.000Z';
const BEFORE_UPDATED_AT = '2026-08-08T07:50:00.000Z';
const REQUESTED_AT = '2026-08-08T08:00:00.000Z';
const FINISHED_AT = '2026-08-08T08:00:01.000Z';
const AFTER_UPDATED_AT = '2026-08-08T08:00:02.000Z';
const RESET_AT = '2026-09-01T00:00:00.000Z';
const CSRF_HEADER = 'X-Admin-CSRF';
const ADMIN_CLIENT_IP = '203.0.113.77';
const APP_BEARER_TOKEN = 'better-auth-bearer-token-sentinel';
const APP_SESSION_COOKIE =
  'better-auth.session_token=better-auth-browser-cookie-sentinel.signature';
const ISSUE_IMAGE_ID = 'not_01234567';
const ISSUE_DOCUMENT_ID = 'not_01234568';
const SECTION_IMAGE_ID = 'not_01234569';
const SECTION_DOCUMENT_ID = 'not_01234570';

const GENERATED_BODY = {
  meta: {
    title: 'SENTINEL_REPORT_TITLE',
    summary: 'SENTINEL_REPORT_SUMMARY',
    visitDate: null,
  },
  weather: {
    condition: 'SENTINEL_WEATHER_CONDITION',
    temperature: '21 C',
    wind: '5 kph',
    impact: null,
  },
  workers: [
    {
      role: 'SENTINEL_WORKER_ROLE',
      count: '2',
      hours: '8',
      notes: null,
    },
  ],
  materials: [
    {
      name: 'SENTINEL_MATERIAL_NAME',
      quantity: '3',
      unit: 'loads',
      status: 'delivered',
      condition: null,
      notes: null,
    },
  ],
  issues: [
    {
      title: 'SENTINEL_ISSUE_TITLE',
      severity: 'low',
      description: 'SENTINEL_ISSUE_DESCRIPTION',
      action: 'SENTINEL_ISSUE_ACTION',
      attachments: {
        images: [ISSUE_IMAGE_ID],
        documents: [ISSUE_DOCUMENT_ID],
      },
    },
  ],
  nextSteps: ['SENTINEL_NEXT_STEP'],
  summarySections: [
    {
      title: 'SENTINEL_SECTION_TITLE',
      body: 'SENTINEL_SECTION_BODY',
      attachments: {
        images: [SECTION_IMAGE_ID],
        documents: [SECTION_DOCUMENT_ID],
      },
    },
  ],
};

let appFx: PgFixture;
let adminFx: AdminPgFixture;
let appDb: pg.Client;
let adminCookie: string;
let adminCsrfToken: string;
let adminLoginBody: { authenticated: true; email: string; csrfToken?: string };
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
let adminLimiter: RecordingMemoryRateLimiter;
let matchingUsageRows: number;
let usageRowSequence: number;
let cleanupSessionBody: unknown;

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

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function limiterName(key: string): string {
  const separator = key.indexOf(':fn:');
  return separator === -1 ? key : key.slice(0, separator);
}

function report(updatedAt = BEFORE_UPDATED_AT, generatedAt: string | null = null) {
  return {
    id: REPORT_ID,
    number: REPORT_NUMBER,
    projectId: PROJECT_ID,
    status: 'draft',
    visitDate: null,
    body: generatedAt === null ? null : GENERATED_BODY,
    notesSinceLastGeneration: generatedAt === null ? 1 : 0,
    notesChangedAt: NOTES_CHANGED_AT,
    generatedAt,
    needsRegeneration: generatedAt === null,
    finalizedAt: null,
    pdfUrl: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt,
  };
}

function setLiveCanaryEnabled(value: '0' | '1'): void {
  (env as unknown as Record<string, unknown>).ADMIN_REPORT_LIVE_CANARY_ENABLED = value;
}

async function seedMatchingUsageEvents(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    usageRowSequence += 1;
    await appDb.query(
      `INSERT INTO app.llm_usage_events
         (id, user_id, project_id, report_id, vendor, model, operation,
          input_tokens, output_tokens, cached_tokens, latency_ms, fixture_mode, status,
          created_at)
       VALUES ($1, $2, $3, $4, 'openai', 'gpt-5-mini', 'generate_report',
               120, 30, 20, 1500, 'live', 'ok', clock_timestamp())`,
      [`lue_${String(10_000_000 + usageRowSequence)}`, CANARY_USER_ID, PROJECT_ID, REPORT_ID],
    );
  }
}

function defaultRunnerFetch() {
  return vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.origin !== API_ORIGIN) {
      return jsonResponse({ message: 'unexpected origin' }, 404);
    }
    if (method === 'POST' && url.pathname === '/api/auth/sign-in/email') {
      return jsonResponse(
        {
          redirect: false,
          token: APP_SESSION_TOKEN,
          user: {
            id: CANARY_USER_ID,
            email: CANARY_EMAIL,
            name: 'Synthetic report canary',
            emailVerified: true,
            image: null,
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
            displayName: 'Synthetic report canary',
            companyName: null,
            isAdmin: false,
            plan: 'free',
          },
        },
        200,
        { 'set-auth-token': APP_SESSION_TOKEN },
      );
    }
    if (method === 'GET' && url.pathname === `/projects/${PROJECT_ID}/reports/${REPORT_NUMBER}`) {
      return jsonResponse(report());
    }
    if (
      method === 'POST' &&
      url.pathname === `/projects/${PROJECT_ID}/reports/${REPORT_NUMBER}/generate`
    ) {
      await seedMatchingUsageEvents(matchingUsageRows);
      return jsonResponse(
        {
          report: report(AFTER_UPDATED_AT, NOTES_CHANGED_AT),
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
          systemPrompt: 'SENTINEL_GENERATE_SYSTEM_PROMPT',
          userPrompt: 'SENTINEL_GENERATE_USER_PROMPT',
          response: 'SENTINEL_RAW_MODEL_RESPONSE',
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
    if (method === 'GET' && url.pathname === '/api/auth/get-session') {
      return jsonResponse(cleanupSessionBody);
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
    flyClientIp?: string | null;
  } = {},
): RequestInit {
  const headers = new Headers();
  const cookie = overrides.cookie === undefined ? adminCookie : overrides.cookie;
  const csrf = overrides.csrf === undefined ? adminCsrfToken : overrides.csrf;
  const origin = overrides.origin === undefined ? ADMIN_ORIGIN : overrides.origin;
  const flyClientIp = overrides.flyClientIp === undefined ? ADMIN_CLIENT_IP : overrides.flyClientIp;
  if (cookie) headers.set('cookie', cookie);
  if (csrf) headers.set(CSRF_HEADER, csrf);
  if (origin) headers.set('origin', origin);
  if (flyClientIp) headers.set('fly-client-ip', flyClientIp);
  if (overrides.authorization) headers.set('authorization', overrides.authorization);
  return { method: 'POST', headers };
}

async function fetchCallRequest(index: number): Promise<Request> {
  const call = fetchImpl.mock.calls[index];
  if (!call) throw new Error(`missing fetch call ${index}`);
  return new Request(call[0], call[1]);
}

beforeAll(async () => {
  [appFx, adminFx] = await Promise.all([startPg(), startAdminPg()]);
  process.env.DATABASE_URL = appFx.url;
  process.env.ADMIN_DATABASE_URL = adminFx.url;
  await resetPool();
  await resetAdminPool();
  getPool(appFx.url);
  getAdminPool(adminFx.url);

  await seedAuthUsers(appFx.url, [
    {
      id: CANARY_USER_ID,
      email: CANARY_EMAIL,
      displayName: 'Synthetic report canary',
      plan: 'free',
    },
  ]);
  appDb = new pg.Client({ connectionString: appFx.url });
  await appDb.connect();
  await appDb.query(
    `INSERT INTO app.projects(id, name, owner_id)
     VALUES ($1, 'Synthetic report canary project', $2)`,
    [PROJECT_ID, CANARY_USER_ID],
  );
  await appDb.query(
    `INSERT INTO app.reports(id, project_id, author_id, number, status)
     VALUES ($1, $2, $3, $4, 'draft')`,
    [REPORT_ID, PROJECT_ID, CANARY_USER_ID, REPORT_NUMBER],
  );

  await setAdminPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  const login = await loginAdmin();
  if (login.response.status !== 200) {
    throw new Error(`dedicated admin login failed with ${login.response.status}`);
  }
  adminCookie = login.cookie;
  adminLoginBody = login.body;
  adminCsrfToken = login.body.csrfToken ?? '';
}, 180_000);

beforeEach(async () => {
  setLiveCanaryEnabled('1');
  matchingUsageRows = 1;
  usageRowSequence = 0;
  cleanupSessionBody = null;
  await appDb.query('DELETE FROM app.llm_usage_events WHERE user_id = $1', [CANARY_USER_ID]);
  resetRateLimiter();
  setRateLimiter(new FailingAppRateLimiter());
  resetAdminRateLimiter();
  adminLimiter = new RecordingMemoryRateLimiter();
  setAdminRateLimiter(adminLimiter);
  fetchImpl = defaultRunnerFetch();
  vi.stubGlobal('fetch', fetchImpl);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  resetRateLimiter();
  resetAdminRateLimiter();
  await appDb?.end();
  await Promise.all([appFx?.stop(), adminFx?.stop()]);
}, 90_000);

describe('POST /admin/operations/report-generate security boundary', () => {
  it('returns disabled without an application request or application-database query', async () => {
    setLiveCanaryEnabled('0');
    const applicationQuery = vi.spyOn(getPool(), 'query');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const response = await createApp().request(
      '/admin/operations/report-generate',
      diagnosticRequest(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body).toEqual({
      observedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      status: 'unknown',
      reason: 'not_enabled',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(applicationQuery).not.toHaveBeenCalled();

    const auditCall = info.mock.calls.find(([scope]) => scope === '[admin-operations]');
    expect(auditCall).toBeDefined();
    expect(JSON.parse(String(auditCall?.[1]))).toMatchObject({
      reason: 'not_enabled',
    });
  });

  it('issues the session-bound CSRF token at login and session lookup', async () => {
    expect(adminLoginBody).toEqual({
      authenticated: true,
      email: ADMIN_EMAIL,
      csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(adminCookie).toMatch(/^__Host-harpa_admin_session=[A-Za-z0-9_-]{43}$/);
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
    const applicationQuery = vi.spyOn(getPool(), 'query');
    const cases: Array<{
      name: string;
      expected: number;
      init: RequestInit;
      limiterNames: readonly string[];
    }> = [
      {
        name: 'anonymous',
        expected: 401,
        init: diagnosticRequest({ cookie: '', csrf: 'A'.repeat(43) }),
        limiterNames: ['admin.auth.ip.1m'],
      },
      {
        name: 'application Bearer',
        expected: 401,
        init: diagnosticRequest({
          cookie: '',
          csrf: 'A'.repeat(43),
          authorization: `Bearer ${APP_BEARER_TOKEN}`,
        }),
        limiterNames: ['admin.auth.ip.1m'],
      },
      {
        name: 'Better Auth cookie',
        expected: 401,
        init: diagnosticRequest({ cookie: APP_SESSION_COOKIE, csrf: 'A'.repeat(43) }),
        limiterNames: ['admin.auth.ip.1m'],
      },
      {
        name: 'missing Origin',
        expected: 403,
        init: diagnosticRequest({ origin: null }),
        limiterNames: [],
      },
      {
        name: 'untrusted Origin',
        expected: 403,
        init: diagnosticRequest({ origin: `${ADMIN_ORIGIN}.evil.example` }),
        limiterNames: [],
      },
      {
        name: 'missing CSRF',
        expected: 403,
        init: diagnosticRequest({ csrf: null }),
        limiterNames: ['admin.auth.ip.1m'],
      },
      {
        name: 'invalid CSRF',
        expected: 403,
        init: diagnosticRequest({ csrf: 'A'.repeat(43) }),
        limiterNames: ['admin.auth.ip.1m'],
      },
    ];

    for (const testCase of cases) {
      const limiterCallStart = adminLimiter.calls.length;
      const response = await createApp().request(
        '/admin/operations/report-generate',
        testCase.init,
      );
      expect(response.status, testCase.name).toBe(testCase.expected);
      expect(response.headers.get('cache-control'), testCase.name).toBe('private, no-store');
      const routeLimiterCalls = adminLimiter.calls.slice(limiterCallStart);
      expect(
        routeLimiterCalls.map(({ key }) => limiterName(key)),
        `${testCase.name} middleware order`,
      ).toEqual(testCase.limiterNames);
      for (const call of routeLimiterCalls) {
        expect(call).toEqual({
          key: `admin.auth.ip.1m:fn:${ADMIN_CLIENT_IP}`,
          limit: 120,
          windowMs: 60_000,
        });
      }
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(applicationQuery).not.toHaveBeenCalled();
  });

  it('runs the unmodified default HTTP runner only after all admin gates pass', async () => {
    const applicationQuery = vi.spyOn(getPool(), 'query');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
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
        idempotentReplay: false,
      },
      preview: {
        schemaValid: true,
        sample: {
          title: 'SENTINEL_REPORT_TITLE',
          summary: 'SENTINEL_REPORT_SUMMARY',
          weather: {
            condition: 'SENTINEL_WEATHER_CONDITION',
            temperature: '21 C',
            wind: '5 kph',
            impact: null,
          },
          workers: [
            {
              role: 'SENTINEL_WORKER_ROLE',
              count: '2',
              hours: '8',
              notes: null,
            },
          ],
          materials: [
            {
              name: 'SENTINEL_MATERIAL_NAME',
              quantity: '3',
              unit: 'loads',
              status: 'delivered',
              condition: null,
              notes: null,
            },
          ],
          issues: [
            {
              title: 'SENTINEL_ISSUE_TITLE',
              severity: 'low',
              description: 'SENTINEL_ISSUE_DESCRIPTION',
              action: 'SENTINEL_ISSUE_ACTION',
            },
          ],
          nextSteps: ['SENTINEL_NEXT_STEP'],
          summarySections: [
            {
              title: 'SENTINEL_SECTION_TITLE',
              body: 'SENTINEL_SECTION_BODY',
            },
          ],
        },
        counts: {
          workers: 1,
          materials: 1,
          issues: 1,
          nextSteps: 1,
          summarySections: 1,
          imageAttachments: 2,
          documentAttachments: 2,
        },
        truncated: true,
        bodySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      usage: {
        inputTokens: 120,
        outputTokens: 30,
        cachedTokens: 20,
        latencyMs: 1500,
        matched: true,
      },
      cleanup: 'succeeded',
    });
    const serialized = JSON.stringify(body);
    for (const reviewedSample of [
      'SENTINEL_REPORT_TITLE',
      'SENTINEL_REPORT_SUMMARY',
      'SENTINEL_WORKER_ROLE',
      'SENTINEL_MATERIAL_NAME',
      'SENTINEL_ISSUE_TITLE',
      'SENTINEL_NEXT_STEP',
      'SENTINEL_SECTION_TITLE',
    ]) {
      expect(serialized).toContain(reviewedSample);
    }
    for (const secret of [
      CANARY_PASSWORD,
      APP_SESSION_TOKEN,
      CANARY_USER_ID,
      'SENTINEL_GENERATE_SYSTEM_PROMPT',
      'SENTINEL_GENERATE_USER_PROMPT',
      'SENTINEL_RAW_MODEL_RESPONSE',
      'SENTINEL_DEBUG_SYSTEM_PROMPT',
      'SENTINEL_DEBUG_USER_PROMPT',
      'SENTINEL_SYNTHETIC_NOTE',
      'SENTINEL_PERSISTED_SYSTEM_PROMPT',
      'SENTINEL_PERSISTED_USER_PROMPT',
      'SENTINEL_PERSISTED_MODEL_RESPONSE',
      ISSUE_IMAGE_ID,
      ISSUE_DOCUMENT_ID,
      SECTION_IMAGE_ID,
      SECTION_DOCUMENT_ID,
      'lue_10000001',
    ]) {
      expect(serialized).not.toContain(secret);
    }

    expect(applicationQuery).toHaveBeenCalledTimes(2);
    const applicationQueries = applicationQuery.mock.calls.map(([text]) => String(text));
    expect(applicationQueries[0]).toMatch(/clock_timestamp\(\)/i);
    expect(applicationQueries[1]).toMatch(/from\s+app\.llm_usage_events/i);
    expect(applicationQueries[1]).toMatch(/limit\s+2/i);
    expect(applicationQuery.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining([CANARY_USER_ID, PROJECT_ID, REPORT_ID, 'openai', 'gpt-5-mini']),
    );

    expect(adminLimiter.calls.map(({ key }) => limiterName(key))).toEqual([
      'admin.auth.ip.1m',
      'admin.operations.report-generate.run.15m',
    ]);
    expect(adminLimiter.calls[0]).toEqual({
      key: `admin.auth.ip.1m:fn:${ADMIN_CLIENT_IP}`,
      limit: 120,
      windowMs: 60_000,
    });
    expect(adminLimiter.calls[1]).toMatchObject({ limit: 3, windowMs: 15 * 60_000 });

    expect(fetchImpl).toHaveBeenCalledTimes(7);
    const requests = await Promise.all(
      Array.from({ length: 7 }, (_unused, index) => fetchCallRequest(index)),
    );
    expect(requests.map((request) => new URL(request.url).origin)).toEqual(
      Array.from({ length: 7 }, () => API_ORIGIN),
    );
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        'POST /api/auth/sign-in/email',
        `GET /projects/${PROJECT_ID}/reports/${REPORT_NUMBER}`,
        `POST /projects/${PROJECT_ID}/reports/${REPORT_NUMBER}/generate`,
        `GET /projects/${PROJECT_ID}/reports/${REPORT_NUMBER}/debug`,
        'GET /me/limits',
        'POST /api/auth/sign-out',
        'GET /api/auth/get-session',
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
    expect(requests[6]!.body).toBeNull();

    const auditCall = info.mock.calls.find(([scope]) => scope === '[admin-operations]');
    expect(auditCall).toBeDefined();
    const audit = JSON.parse(String(auditCall?.[1])) as Record<string, unknown>;
    expect(audit).toMatchObject({
      outcome: 'report_generate_pass',
      projectId: PROJECT_ID,
      reportNumber: REPORT_NUMBER,
      provider: 'openai',
      model: 'gpt-5-mini',
      fixtureMode: 'live',
      cleanup: 'succeeded',
    });
    expect(audit).toEqual(
      expect.objectContaining({
        requestId: expect.any(String),
        adminIdentityId: expect.any(String),
        adminSessionId: expect.any(String),
        durationMs: expect.any(Number),
      }),
    );
    const serializedAudit = JSON.stringify(audit);
    for (const secret of [
      CANARY_EMAIL,
      CANARY_PASSWORD,
      APP_SESSION_TOKEN,
      'SENTINEL_GENERATE_SYSTEM_PROMPT',
      'SENTINEL_GENERATE_USER_PROMPT',
      'SENTINEL_RAW_MODEL_RESPONSE',
      'SENTINEL_SYNTHETIC_NOTE',
      'SENTINEL_REPORT_TITLE',
      'SENTINEL_REPORT_SUMMARY',
      'SENTINEL_WORKER_ROLE',
      'SENTINEL_MATERIAL_NAME',
      'SENTINEL_ISSUE_TITLE',
      'SENTINEL_NEXT_STEP',
      'SENTINEL_SECTION_TITLE',
      ISSUE_IMAGE_ID,
      ISSUE_DOCUMENT_ID,
      SECTION_IMAGE_ID,
      SECTION_DOCUMENT_ID,
      CANARY_USER_ID,
      'lue_10000001',
    ]) {
      expect(serializedAudit).not.toContain(secret);
    }
  });

  it.each([
    [0, 'usage_proof_missing'],
    [2, 'usage_proof_ambiguous'],
  ] as const)('fails closed when %i matching live usage rows exist', async (rowCount, reason) => {
    matchingUsageRows = rowCount;
    const applicationQuery = vi.spyOn(getPool(), 'query');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const response = await createApp().request(
      '/admin/operations/report-generate',
      diagnosticRequest(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      status: 'fail',
      phase: 'usage_proof',
      reason,
      cleanup: 'succeeded',
    });

    expect(applicationQuery).toHaveBeenCalledTimes(2);
    const applicationQueries = applicationQuery.mock.calls.map(([text]) => String(text));
    expect(applicationQueries[0]).toMatch(/clock_timestamp\(\)/i);
    expect(applicationQueries[1]).toMatch(/limit\s+2/i);

    expect(fetchImpl).toHaveBeenCalledTimes(6);
    const requests = await Promise.all(
      Array.from({ length: 6 }, (_unused, index) => fetchCallRequest(index)),
    );
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        'POST /api/auth/sign-in/email',
        `GET /projects/${PROJECT_ID}/reports/${REPORT_NUMBER}`,
        `POST /projects/${PROJECT_ID}/reports/${REPORT_NUMBER}/generate`,
        `GET /projects/${PROJECT_ID}/reports/${REPORT_NUMBER}/debug`,
        'POST /api/auth/sign-out',
        'GET /api/auth/get-session',
      ],
    );

    const auditCall = info.mock.calls.find(([scope]) => scope === '[admin-operations]');
    expect(auditCall).toBeDefined();
    const audit = JSON.parse(String(auditCall?.[1])) as Record<string, unknown>;
    expect(audit).toMatchObject({
      outcome: 'report_generate_fail',
      phase: 'usage_proof',
      reason,
      cleanup: 'succeeded',
    });
    expect(JSON.stringify(audit)).not.toContain(CANARY_USER_ID);
    expect(JSON.stringify(audit)).not.toContain('lue_10000001');
  });

  it('audits a degraded limits read as a sanitized warning', async () => {
    const healthyFetch = defaultRunnerFetch();
    fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      if (new URL(new Request(input, init).url).pathname === '/me/limits') {
        return jsonResponse({ message: 'SENTINEL_LIMITS_FAILURE_BODY' }, 503);
      }
      return healthyFetch(input, init);
    });
    vi.stubGlobal('fetch', fetchImpl);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const response = await createApp().request(
      '/admin/operations/report-generate',
      diagnosticRequest(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'warning',
      limits: null,
      warnings: ['limits_unavailable'],
      cleanup: 'succeeded',
    });
    const auditCall = info.mock.calls.find(([scope]) => scope === '[admin-operations]');
    expect(auditCall).toBeDefined();
    const audit = JSON.parse(String(auditCall?.[1])) as Record<string, unknown>;
    expect(audit).toMatchObject({
      outcome: 'report_generate_warning',
      projectId: PROJECT_ID,
      reportNumber: REPORT_NUMBER,
      provider: 'openai',
      model: 'gpt-5-mini',
      cleanup: 'succeeded',
      warnings: ['limits_unavailable'],
    });
    expect(JSON.stringify(audit)).not.toContain('SENTINEL_LIMITS_FAILURE_BODY');
  });

  it('requires the same bearer token to be absent after sign-out before confirming cleanup', async () => {
    cleanupSessionBody = {
      session: { id: 'SENTINEL_STILL_ACTIVE_SESSION' },
      user: { id: CANARY_USER_ID, email: CANARY_EMAIL },
    };
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const response = await createApp().request(
      '/admin/operations/report-generate',
      diagnosticRequest(),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: 'warning',
      cleanup: 'failed',
      warnings: ['sign_out_failed'],
    });
    expect(JSON.stringify(body)).not.toContain('SENTINEL_STILL_ACTIVE_SESSION');

    expect(fetchImpl).toHaveBeenCalledTimes(7);
    const signOutRequest = await fetchCallRequest(5);
    const revokedSessionCheck = await fetchCallRequest(6);
    expect(`${signOutRequest.method} ${new URL(signOutRequest.url).pathname}`).toBe(
      'POST /api/auth/sign-out',
    );
    expect(`${revokedSessionCheck.method} ${new URL(revokedSessionCheck.url).pathname}`).toBe(
      'GET /api/auth/get-session',
    );
    expect(signOutRequest.headers.get('authorization')).toBe(`Bearer ${APP_SESSION_TOKEN}`);
    expect(revokedSessionCheck.headers.get('authorization')).toBe(`Bearer ${APP_SESSION_TOKEN}`);

    const auditCall = info.mock.calls.find(([scope]) => scope === '[admin-operations]');
    expect(auditCall).toBeDefined();
    const audit = JSON.parse(String(auditCall?.[1])) as Record<string, unknown>;
    expect(audit).toMatchObject({
      outcome: 'report_generate_warning',
      cleanup: 'failed',
      warnings: ['sign_out_failed'],
    });
    expect(JSON.stringify(audit)).not.toContain('SENTINEL_STILL_ACTIVE_SESSION');
  });

  it('audits an upstream failure with only the reviewed phase and reason', async () => {
    fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init);
      if (new URL(request.url).pathname === '/api/auth/sign-in/email') {
        return jsonResponse({ message: 'SENTINEL_SIGN_IN_FAILURE_BODY' }, 401);
      }
      throw new Error('the runner must stop after failed sign-in');
    });
    vi.stubGlobal('fetch', fetchImpl);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const response = await createApp().request(
      '/admin/operations/report-generate',
      diagnosticRequest(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'fail',
      phase: 'sign_in',
      reason: 'sign_in_failed',
      cleanup: 'not_started',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const auditCall = info.mock.calls.find(([scope]) => scope === '[admin-operations]');
    expect(auditCall).toBeDefined();
    const audit = JSON.parse(String(auditCall?.[1])) as Record<string, unknown>;
    expect(audit).toMatchObject({
      outcome: 'report_generate_fail',
      phase: 'sign_in',
      reason: 'sign_in_failed',
      cleanup: 'not_started',
    });
    expect(audit).not.toHaveProperty('projectId');
    expect(audit).not.toHaveProperty('provider');
    expect(JSON.stringify(audit)).not.toContain('SENTINEL_SIGN_IN_FAILURE_BODY');
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
    expect(fetchImpl).toHaveBeenCalledTimes(7);
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
    expect(fetchImpl).toHaveBeenCalledTimes(21);

    const exhausted = await createApp().request(
      '/admin/operations/report-generate',
      diagnosticRequest(),
    );
    expect(exhausted.status).toBe(429);
    expect(exhausted.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchImpl).toHaveBeenCalledTimes(21);

    const diagnosticCalls = adminLimiter.calls.filter(
      ({ limit, windowMs }) => limit === 3 && windowMs === 15 * 60_000,
    );
    expect(diagnosticCalls).toHaveLength(4);
    expect(new Set(diagnosticCalls.map(({ key }) => key))).toHaveLength(1);
    expect(diagnosticCalls[0]?.key).not.toContain('admin.operations.neon.read');

    const diagnosticIpCalls = adminLimiter.calls.filter(
      ({ key }) => key === `admin.auth.ip.1m:fn:${ADMIN_CLIENT_IP}`,
    );
    expect(diagnosticIpCalls).toHaveLength(4);
    expect(diagnosticIpCalls).toEqual(
      Array.from({ length: 4 }, () => ({
        key: `admin.auth.ip.1m:fn:${ADMIN_CLIENT_IP}`,
        limit: 120,
        windowMs: 60_000,
      })),
    );
  });
});
