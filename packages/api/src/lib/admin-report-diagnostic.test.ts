import { afterEach, describe, expect, it, vi } from 'vitest';

const { defaultPool, defaultPoolQuery } = vi.hoisted(() => {
  const query = vi.fn();
  return { defaultPool: { query }, defaultPoolQuery: query };
});

const API_ORIGIN = 'https://harpa-pro-api-dev.fly.dev';
const ACCOUNT_EMAIL = 'report-canary@e2e.harpapro.com';
const ACCOUNT_PASSWORD = 'server-only-password-12345';
const USER_ID = 'usr_23456789';
const PROJECT_ID = 'prj_23456789';
const REPORT_ID = 'rpt_23456789';
const REPORT_NUMBER = 7;
const TOKEN = 'sentinel-bearer-token-1234567890';
const NOW = new Date('2026-08-08T08:00:00.000Z');
const PREVIOUS_UPDATED_AT = '2026-08-08T07:55:00.000Z';
const DATABASE_LOWER_BOUND = '2026-08-08T07:58:59.000Z';
const REQUESTED_AT = '2026-08-08T07:59:00.000Z';
const FINISHED_AT = '2026-08-08T07:59:05.000Z';
const REPORT_UPDATED_AT = '2026-08-08T07:59:06.000Z';
const REQUEST_ID = 'rid-report-live-canary-123';
const RAW_PROMPT = 'sentinel raw prompt must never escape';
const RAW_RESPONSE = 'sentinel raw provider response must never escape';
const RAW_NOTE = 'sentinel synthetic source note must never escape';
const LEDGER_ID = 'lue_secret_ledger_identifier';
const DATABASE_ERROR = 'postgres://secret:password@private.invalid/database';
const CLIPPED_WORKER = 'sentinel sixth worker must be clipped';
const LIVE_PREVIEW_TEXT = 'Synthetic concrete pour completed safely';
const LONG_TITLE = `${'🙂'.repeat(398)} end`;
const LONG_WORKER_NOTES = `start-${'界'.repeat(400)}`;
const LONG_SUMMARY = `${LIVE_PREVIEW_TEXT}-${'界'.repeat(400)}`;
const LONG_WEATHER_IMPACT = `weather-${'界'.repeat(400)}`;
const LONG_MATERIAL_NOTES = `material-${'界'.repeat(400)}`;
const LONG_ISSUE_DESCRIPTION = `issue-${'界'.repeat(400)}`;
const LONG_NEXT_STEP = `next-${'界'.repeat(400)}`;
const LONG_SECTION_BODY = `section-${'界'.repeat(400)}`;
const REPORT_BODY_SHA256 = '6c4d829c5acdbcea592ac483dd5746959241710501dc3518a1b719a2c528fcc8';

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
      TEST_ACCOUNT_PASSWORD: 'server-only-password-12345',
      ADMIN_REPORT_DIAGNOSTIC_EMAIL: 'report-canary@e2e.harpapro.com',
      ADMIN_REPORT_DIAGNOSTIC_PROJECT_ID: 'prj_23456789',
      ADMIN_REPORT_DIAGNOSTIC_REPORT_NUMBER: 7,
    },
  };
});

vi.mock('../db/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/client.js')>();
  return { ...actual, getPool: () => defaultPool };
});

import { env } from '../env.js';
import { runAdminReportGenerateDiagnostic } from './admin-report-diagnostic.js';

type Step =
  'signIn' | 'targetRead' | 'generate' | 'proofRead' | 'limits' | 'signOut' | 'sessionVerify';
type StepOverride = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;
type DatabaseStep = 'clock' | 'ledger';
type DatabaseRow = Record<string, unknown>;
type QueryApplicationDb = (
  text: string,
  values: readonly unknown[],
  signal: AbortSignal,
) => Promise<{ rows: readonly DatabaseRow[] }>;
type DatabaseOverride = (
  text: string,
  values: readonly unknown[],
  signal: AbortSignal,
) => Promise<{ rows: readonly DatabaseRow[] }>;

const CONFIGURATION = {
  enabled: true,
  baseUrl: API_ORIGIN,
  email: ACCOUNT_EMAIL,
  password: ACCOUNT_PASSWORD,
  projectId: PROJECT_ID,
  reportNumber: REPORT_NUMBER,
};

const REPORT_BODY = {
  meta: {
    title: LONG_TITLE,
    summary: LONG_SUMMARY,
    visitDate: '2026-08-08T00:00:00.000Z',
  },
  weather: {
    condition: 'Clear',
    temperature: '27°C',
    wind: '8 km/h',
    impact: LONG_WEATHER_IMPACT,
  },
  workers: [
    { role: 'Foreperson', count: '1', hours: '8', notes: LONG_WORKER_NOTES },
    { role: 'Carpenter', count: '4', hours: '8', notes: null },
    { role: 'Electrician', count: '2', hours: '6', notes: 'Rough-in complete' },
    { role: 'Plumber', count: '2', hours: null, notes: null },
    { role: 'Labourer', count: '5', hours: '7.5', notes: null },
    { role: CLIPPED_WORKER, count: '1', hours: '2', notes: 'Outside preview bound' },
  ],
  materials: [
    {
      name: 'Concrete',
      quantity: '24',
      unit: 'm³',
      status: 'placed',
      condition: 'good',
      notes: LONG_MATERIAL_NOTES,
    },
    {
      name: 'Rebar',
      quantity: '3',
      unit: 'tonnes',
      status: 'installed',
      condition: null,
      notes: null,
    },
    {
      name: 'Formwork',
      quantity: '18',
      unit: 'panels',
      status: null,
      condition: 'serviceable',
      notes: null,
    },
    {
      name: 'Conduit',
      quantity: null,
      unit: null,
      status: 'delivered',
      condition: null,
      notes: null,
    },
    {
      name: 'Aggregate',
      quantity: '6',
      unit: 'loads',
      status: null,
      condition: null,
      notes: null,
    },
    {
      name: 'Clipped material',
      quantity: '1',
      unit: 'item',
      status: null,
      condition: null,
      notes: null,
    },
  ],
  issues: [
    {
      title: 'Access gate',
      severity: 'low',
      description: LONG_ISSUE_DESCRIPTION,
      action: 'Assign spotter',
      attachments: {
        images: ['not_8h3kq2vp9w', 'not_7h3kq2vp9x'],
        documents: ['not_6h3kq2vp9y'],
      },
    },
    {
      title: 'Inspection',
      severity: 'medium',
      description: 'Awaiting inspection',
      action: null,
    },
    {
      title: 'Weather cover',
      severity: null,
      description: null,
      action: 'Keep cover staged',
    },
    {
      title: 'Housekeeping',
      severity: 'low',
      description: 'Clear south path',
      action: 'Crew assigned',
    },
    {
      title: 'Pump booking',
      severity: 'medium',
      description: 'Confirm next slot',
      action: 'Call supplier',
    },
    {
      title: 'Clipped issue',
      severity: 'high',
      description: 'Outside preview bound',
      action: null,
      attachments: { images: ['not_5h3kq2vp9z'] },
    },
  ],
  nextSteps: [
    LONG_NEXT_STEP,
    'Complete inspection',
    'Backfill north edge',
    'Install conduit',
    'Confirm delivery',
    'This sixth next step is clipped',
  ],
  summarySections: [
    {
      title: 'Progress',
      body: LONG_SECTION_BODY,
      attachments: {
        images: ['not_4h3kq2vp9a'],
        documents: ['not_3h3kq2vp9b', 'not_2h3kq2vp9c'],
      },
    },
    { title: 'Safety', body: 'Pre-start completed.' },
    { title: 'Quality', body: 'Slump tests passed.' },
    { title: 'Schedule', body: 'Work remains on plan.' },
    { title: 'Visitors', body: 'Inspector attended.' },
    { title: 'Clipped section', body: 'Outside preview bound.' },
  ],
};

const REPORT = {
  id: REPORT_ID,
  number: REPORT_NUMBER,
  projectId: PROJECT_ID,
  status: 'draft',
  visitDate: null,
  body: null,
  notesSinceLastGeneration: 0,
  notesChangedAt: PREVIOUS_UPDATED_AT,
  generatedAt: null,
  needsRegeneration: true,
  finalizedAt: null,
  pdfUrl: null,
  createdAt: '2026-08-01T08:00:00.000Z',
  updatedAt: PREVIOUS_UPDATED_AT,
};

const GENERATED_REPORT = {
  ...REPORT,
  body: REPORT_BODY,
  generatedAt: PREVIOUS_UPDATED_AT,
  needsRegeneration: false,
  updatedAt: REPORT_UPDATED_AT,
};

const LIMIT_BUCKETS = [
  {
    kind: 'report_generate',
    limit: 1_000,
    used: 4,
    remaining: 996,
    resetAt: '2026-09-01T00:00:00.000Z',
    plan: 'free',
    overridden: false,
  },
  {
    kind: 'voice_transcribe',
    limit: 1_000,
    used: 2,
    remaining: 998,
    resetAt: '2026-09-01T00:00:00.000Z',
    plan: 'free',
    overridden: false,
  },
  {
    kind: 'ai_input_tokens',
    limit: 200_000_000,
    used: 1_200,
    remaining: 199_998_800,
    resetAt: '2026-09-01T00:00:00.000Z',
    plan: 'free',
    overridden: false,
  },
  {
    kind: 'ai_output_tokens',
    limit: 50_000_000,
    used: 300,
    remaining: 49_999_700,
    resetAt: '2026-09-01T00:00:00.000Z',
    plan: 'free',
    overridden: false,
  },
];

const LIVE_LEDGER_ROW = {
  vendor: 'openai',
  model: 'gpt-5.4',
  input_tokens: '1200',
  output_tokens: '300',
  cached_tokens: '200',
  latency_ms: '4900',
  fixture_mode: 'live',
  status: 'ok',
};

function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...Object.fromEntries(new Headers(headers)) },
  });
}

function urlOf(input: string | URL | Request): URL {
  return new URL(input instanceof Request ? input.url : input.toString());
}

function stepOf(url: URL): Step {
  if (url.pathname === '/api/auth/sign-in/email') return 'signIn';
  if (url.pathname === '/api/auth/sign-out') return 'signOut';
  if (url.pathname === '/api/auth/get-session') return 'sessionVerify';
  if (url.pathname === '/me/limits') return 'limits';
  if (url.pathname.endsWith('/generate')) return 'generate';
  if (url.pathname.endsWith('/debug')) return 'proofRead';
  return 'targetRead';
}

function reportDebug(fixtureMode: 'live' | 'replay' | 'record' = 'live') {
  return {
    prompt: { system: RAW_PROMPT, user: RAW_PROMPT },
    notes: [
      {
        id: 'not_1h3kq2vp9d',
        kind: 'text',
        body: RAW_NOTE,
        transcript: null,
        files: [],
        createdAt: '2026-08-08T07:50:00.000Z',
      },
    ],
    lastGeneration: {
      requestedAt: REQUESTED_AT,
      finishedAt: FINISHED_AT,
      vendor: 'openai',
      model: 'gpt-5.4',
      fixtureMode,
      systemPrompt: RAW_PROMPT,
      userPrompt: RAW_PROMPT,
      response: RAW_RESPONSE,
      usage: null,
    },
  };
}

function signInBody(
  user: unknown = {
    id: USER_ID,
    email: ACCOUNT_EMAIL,
    name: 'Synthetic canary',
    emailVerified: true,
    image: null,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
  },
) {
  return {
    redirect: false,
    token: TOKEN,
    user,
  };
}

function defaultResponse(
  step: Step,
  fixtureMode: 'live' | 'replay' | 'record',
  idempotentReplay: boolean,
): Response {
  switch (step) {
    case 'signIn':
      return json(signInBody(), 200, { 'set-auth-token': TOKEN });
    case 'targetRead':
      return json(REPORT);
    case 'generate':
      return json(
        {
          report: GENERATED_REPORT,
          debug: {
            systemPrompt: RAW_PROMPT,
            userPrompt: RAW_PROMPT,
            rawText: RAW_RESPONSE,
            model: 'gpt-5.4',
            vendor: 'openai',
          },
        },
        200,
        {
          'x-request-id': REQUEST_ID,
          ...(idempotentReplay ? { 'idempotent-replay': 'true' } : {}),
        },
      );
    case 'proofRead':
      return json(reportDebug(fixtureMode));
    case 'limits':
      return json({ plan: 'free', buckets: LIMIT_BUCKETS });
    case 'signOut':
      return json({ success: true });
    case 'sessionVerify':
      return json(null);
  }
}

function fetchSequence(input?: {
  fixtureMode?: 'live' | 'replay' | 'record';
  idempotentReplay?: boolean;
  overrides?: Partial<Record<Step, StepOverride>>;
  events?: string[];
}) {
  const fixtureMode = input?.fixtureMode ?? 'live';
  const idempotentReplay = input?.idempotentReplay ?? false;
  return vi.fn<typeof fetch>(async (request, init) => {
    const url = urlOf(request);
    const step = stepOf(url);
    input?.events?.push(`http:${step}`);
    const override = input?.overrides?.[step];
    if (override) return override(url, init);
    return defaultResponse(step, fixtureMode, idempotentReplay);
  });
}

function databaseSequence(input?: {
  clockRows?: readonly DatabaseRow[];
  ledgerRows?: readonly DatabaseRow[];
  overrides?: Partial<Record<DatabaseStep, DatabaseOverride>>;
  events?: string[];
}) {
  return vi.fn<QueryApplicationDb>(async (text, values, signal) => {
    const step: DatabaseStep = /\bapp\.llm_usage_events\b/i.test(text) ? 'ledger' : 'clock';
    input?.events?.push(`db:${step}`);
    const override = input?.overrides?.[step];
    if (override) return override(text, values, signal);
    return {
      rows:
        step === 'clock'
          ? (input?.clockRows ?? [{ lower_bound: DATABASE_LOWER_BOUND }])
          : (input?.ledgerRows ?? [LIVE_LEDGER_ROW]),
    };
  });
}

function runnerOptions(fetchImpl: typeof fetch, queryApplicationDb: QueryApplicationDb) {
  return {
    configuration: CONFIGURATION,
    fetchImpl,
    queryApplicationDb,
    now: () => NOW,
  };
}

function expectedLimits() {
  return {
    plan: 'free',
    reportGenerate: {
      limit: 1_000,
      used: 4,
      remaining: 996,
      resetAt: '2026-09-01T00:00:00.000Z',
      overridden: false,
    },
    aiInputTokens: {
      limit: 200_000_000,
      used: 1_200,
      remaining: 199_998_800,
      resetAt: '2026-09-01T00:00:00.000Z',
      overridden: false,
    },
    aiOutputTokens: {
      limit: 50_000_000,
      used: 300,
      remaining: 49_999_700,
      resetAt: '2026-09-01T00:00:00.000Z',
      overridden: false,
    },
  };
}

function expectedGeneration() {
  return {
    httpStatus: 200,
    requestId: REQUEST_ID,
    durationMs: 0,
    requestedAt: REQUESTED_AT,
    finishedAt: FINISHED_AT,
    reportUpdatedAt: REPORT_UPDATED_AT,
    generatedAt: PREVIOUS_UPDATED_AT,
    vendor: 'openai',
    model: 'gpt-5.4',
    fixtureMode: 'live',
    idempotentReplay: false,
  };
}

function clipCodePoints(value: string): string {
  return Array.from(value).slice(0, 400).join('');
}

function clipNullable(value: string | null): string | null {
  return value === null ? null : clipCodePoints(value);
}

function expectedPreview(body = REPORT_BODY) {
  return {
    schemaValid: true,
    sample: {
      title: clipNullable(body.meta.title),
      summary: clipNullable(body.meta.summary),
      weather:
        body.weather === null
          ? null
          : {
              condition: clipNullable(body.weather.condition),
              temperature: clipNullable(body.weather.temperature),
              wind: clipNullable(body.weather.wind),
              impact: clipNullable(body.weather.impact),
            },
      workers: body.workers.slice(0, 5).map((worker) => ({
        role: clipCodePoints(worker.role),
        count: clipNullable(worker.count),
        hours: clipNullable(worker.hours),
        notes: clipNullable(worker.notes),
      })),
      materials: body.materials.slice(0, 5).map((material) => ({
        name: clipCodePoints(material.name),
        quantity: clipNullable(material.quantity),
        unit: clipNullable(material.unit),
        status: clipNullable(material.status),
        condition: clipNullable(material.condition),
        notes: clipNullable(material.notes),
      })),
      issues: body.issues.slice(0, 5).map((issue) => ({
        title: clipCodePoints(issue.title),
        severity: clipNullable(issue.severity),
        description: clipNullable(issue.description),
        action: clipNullable(issue.action),
      })),
      nextSteps: body.nextSteps.slice(0, 5).map(clipCodePoints),
      summarySections: body.summarySections.slice(0, 5).map((section) => ({
        title: clipCodePoints(section.title),
        body: clipCodePoints(section.body),
      })),
    },
    counts: {
      workers: 6,
      materials: 6,
      issues: 6,
      nextSteps: 6,
      summarySections: 6,
      imageAttachments: 4,
      documentAttachments: 3,
    },
    truncated: true,
    bodySha256: REPORT_BODY_SHA256,
  };
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function stringifiedConsole(spies: Array<ReturnType<typeof vi.spyOn>>): string {
  return spies
    .flatMap((spy) => spy.mock.calls)
    .flatMap((args) => args)
    .map((value) => (typeof value === 'string' ? value : JSON.stringify(value)))
    .join('\n');
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  defaultPoolQuery.mockReset();
});

describe('runAdminReportGenerateDiagnostic live canary', () => {
  it('returns not configured without making an HTTP request or application-DB query', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const queryApplicationDb = databaseSequence();
    const options = {
      ...runnerOptions(fetchImpl, queryApplicationDb),
      configuration: null,
    };

    await expect(runAdminReportGenerateDiagnostic(options)).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'not_configured',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(queryApplicationDb).not.toHaveBeenCalled();
  });

  it('returns not enabled without making an HTTP request or application-DB query', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const queryApplicationDb = databaseSequence();
    const options = {
      ...runnerOptions(fetchImpl, queryApplicationDb),
      configuration: { enabled: false as const },
    };

    await expect(runAdminReportGenerateDiagnostic(options)).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'not_enabled',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(queryApplicationDb).not.toHaveBeenCalled();
  });

  it('checks the default disabled gate before absent env target fields', async () => {
    const mutableEnv = env as unknown as Record<string, unknown>;
    const previous = {
      ADMIN_REPORT_LIVE_CANARY_ENABLED: mutableEnv.ADMIN_REPORT_LIVE_CANARY_ENABLED,
      ADMIN_REPORT_DIAGNOSTIC_EMAIL: mutableEnv.ADMIN_REPORT_DIAGNOSTIC_EMAIL,
      ADMIN_REPORT_DIAGNOSTIC_PROJECT_ID: mutableEnv.ADMIN_REPORT_DIAGNOSTIC_PROJECT_ID,
      ADMIN_REPORT_DIAGNOSTIC_REPORT_NUMBER: mutableEnv.ADMIN_REPORT_DIAGNOSTIC_REPORT_NUMBER,
    };
    const fetchImpl = vi.fn<typeof fetch>();
    const queryApplicationDb = databaseSequence();
    vi.stubGlobal('fetch', fetchImpl);
    Object.assign(mutableEnv, {
      ADMIN_REPORT_LIVE_CANARY_ENABLED: '0',
      ADMIN_REPORT_DIAGNOSTIC_EMAIL: undefined,
      ADMIN_REPORT_DIAGNOSTIC_PROJECT_ID: undefined,
      ADMIN_REPORT_DIAGNOSTIC_REPORT_NUMBER: undefined,
    });

    try {
      const options = { queryApplicationDb, now: () => NOW };
      await expect(runAdminReportGenerateDiagnostic(options)).resolves.toEqual({
        observedAt: NOW.toISOString(),
        status: 'unknown',
        reason: 'not_enabled',
      });
    } finally {
      Object.assign(mutableEnv, previous);
    }

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(queryApplicationDb).not.toHaveBeenCalled();
  });

  it('pins the fixed HTTP sequence around the DB clock and one bounded live-ledger query', async () => {
    const events: string[] = [];
    const fetchImpl = fetchSequence({ events });
    const queryApplicationDb = databaseSequence({ events });
    vi.stubGlobal('fetch', fetchImpl);
    const options = { queryApplicationDb, now: () => NOW };

    const result = await runAdminReportGenerateDiagnostic(options);

    expect(events).toEqual([
      'http:signIn',
      'http:targetRead',
      'db:clock',
      'http:generate',
      'http:proofRead',
      'db:ledger',
      'http:limits',
      'http:signOut',
      'http:sessionVerify',
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(7);
    expect(queryApplicationDb).toHaveBeenCalledTimes(2);

    const httpCalls = fetchImpl.mock.calls.map(([request, init]) => ({
      url: urlOf(request),
      init,
      headers: new Headers(init?.headers),
    }));
    expect(httpCalls.map(({ url }) => `${url.origin}${url.pathname}`)).toEqual([
      `${API_ORIGIN}/api/auth/sign-in/email`,
      `${API_ORIGIN}/projects/${PROJECT_ID}/reports/${REPORT_NUMBER}`,
      `${API_ORIGIN}/projects/${PROJECT_ID}/reports/${REPORT_NUMBER}/generate`,
      `${API_ORIGIN}/projects/${PROJECT_ID}/reports/${REPORT_NUMBER}/debug`,
      `${API_ORIGIN}/me/limits`,
      `${API_ORIGIN}/api/auth/sign-out`,
      `${API_ORIGIN}/api/auth/get-session`,
    ]);
    expect(httpCalls.map(({ init }) => init?.method)).toEqual([
      'POST',
      'GET',
      'POST',
      'GET',
      'GET',
      'POST',
      'GET',
    ]);
    expect(httpCalls.map(({ init }) => init?.redirect)).toEqual([
      'error',
      'error',
      'error',
      'error',
      'error',
      'error',
      'error',
    ]);
    expect(JSON.parse(String(httpCalls[0]!.init?.body))).toEqual({
      email: ACCOUNT_EMAIL,
      password: ACCOUNT_PASSWORD,
    });
    expect(httpCalls[0]!.headers.get('authorization')).toBeNull();
    expect(JSON.parse(String(httpCalls[2]!.init?.body))).toEqual({
      expectedUpdatedAt: PREVIOUS_UPDATED_AT,
    });
    expect(httpCalls[2]!.headers.get('idempotency-key')).toBe(
      `admin-report-diagnostic:${PROJECT_ID}:${REPORT_NUMBER}:${PREVIOUS_UPDATED_AT}`,
    );
    expect(String(httpCalls[2]!.init?.body)).not.toMatch(
      /fixtureName|fixtureMode|AI_LIVE|AI_FIXTURE_MODE|provider|model/i,
    );
    expect(JSON.parse(String(httpCalls[5]!.init?.body))).toEqual({});
    expect(httpCalls[6]!.init?.body).toBeUndefined();
    for (const call of httpCalls.slice(1)) {
      expect(call.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    }

    const [clockCall, ledgerCall] = queryApplicationDb.mock.calls;
    expect(clockCall).toBeDefined();
    expect(ledgerCall).toBeDefined();
    expect(normalizeSql(clockCall![0])).toMatch(
      /^select clock_timestamp\(\)(?:::\w+)? as lower_bound$/,
    );
    expect(clockCall![1]).toEqual([]);

    const ledgerSql = normalizeSql(ledgerCall![0]);
    expect(ledgerSql).toContain('from app.llm_usage_events');
    expect(ledgerSql).toMatch(/user_id\s*=\s*\$1/);
    expect(ledgerSql).toMatch(/project_id\s*=\s*\$2/);
    expect(ledgerSql).toMatch(/report_id\s*=\s*\$3/);
    expect(ledgerSql).toMatch(/operation\s*=\s*'generate_report'/);
    expect(ledgerSql).toMatch(/created_at\s*>\s*\$4/);
    expect(ledgerSql).toMatch(/created_at\s*<=\s*[^ ]*upper_bound/);
    expect(ledgerSql).toMatch(/vendor\s*=\s*\$5/);
    expect(ledgerSql).toMatch(/model\s*=\s*\$6/);
    expect(ledgerSql).toContain('input_tokens::text');
    expect(ledgerSql).toContain('output_tokens::text');
    expect(ledgerSql).toContain('cached_tokens::text');
    expect(ledgerSql).toContain('latency_ms::text');
    expect(ledgerSql).toMatch(/limit\s+2$/);
    expect(ledgerCall![1]).toEqual([
      USER_ID,
      PROJECT_ID,
      REPORT_ID,
      DATABASE_LOWER_BOUND,
      'openai',
      'gpt-5.4',
    ]);

    const functionalSignals = [
      ...httpCalls.slice(0, 5).map(({ init }) => init?.signal),
      clockCall![2],
      ledgerCall![2],
    ];
    expect(functionalSignals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(new Set(functionalSignals).size).toBe(1);
    const cleanupSignals = httpCalls.slice(5).map(({ init }) => init?.signal);
    expect(cleanupSignals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(new Set(cleanupSignals).size).toBe(1);
    expect(cleanupSignals[0]).not.toBe(functionalSignals[0]);

    expect(result).toEqual({
      observedAt: NOW.toISOString(),
      status: 'pass',
      durationMs: 0,
      target: {
        accountEmail: ACCOUNT_EMAIL,
        projectId: PROJECT_ID,
        reportId: REPORT_ID,
        reportNumber: REPORT_NUMBER,
      },
      generation: expectedGeneration(),
      preview: expectedPreview(),
      usage: {
        inputTokens: 1_200,
        outputTokens: 300,
        cachedTokens: 200,
        latencyMs: 4_900,
        matched: true,
      },
      limits: expectedLimits(),
      cleanup: 'succeeded',
    });
  });

  it.each([
    ['a missing user ID', { email: ACCOUNT_EMAIL, name: 'Synthetic canary' }],
    [
      'a malformed user ID',
      { id: 'customer-23456789', email: ACCOUNT_EMAIL, name: 'Synthetic canary' },
    ],
    ['a non-string user ID', { id: 23, email: ACCOUNT_EMAIL, name: 'Synthetic canary' }],
    [
      'a mismatched user email',
      { id: USER_ID, email: 'other-canary@e2e.harpapro.com', name: 'Synthetic canary' },
    ],
  ] as const)('strictly rejects %s and revokes the successful sign-in', async (_label, user) => {
    const fetchImpl = fetchSequence({
      overrides: {
        signIn: () => json(signInBody(user), 200, { 'set-auth-token': TOKEN }),
      },
    });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'sign_in',
      reason: 'invalid_response',
      cleanup: 'succeeded',
    });
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'signOut',
      'sessionVerify',
    ]);
    for (const call of fetchImpl.mock.calls.slice(1)) {
      expect(new Headers(call[1]?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
    }
    expect(queryApplicationDb).not.toHaveBeenCalled();
  });

  it.each([null, '', 'token with whitespace'])(
    'rejects a missing or malformed bearer token before any DB query: %s',
    async (authToken) => {
      const fetchImpl = fetchSequence({
        overrides: {
          signIn: () =>
            json(
              signInBody(),
              200,
              authToken === null ? undefined : { 'set-auth-token': authToken },
            ),
        },
      });
      const queryApplicationDb = databaseSequence();

      const result = await runAdminReportGenerateDiagnostic(
        runnerOptions(fetchImpl, queryApplicationDb),
      );

      expect(result).toMatchObject({
        status: 'fail',
        phase: 'sign_in',
        reason: 'invalid_response',
        cleanup: 'not_started',
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(queryApplicationDb).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['signIn', 401, 'sign_in', 'sign_in_failed', 'not_started', 0],
    ['signIn', 429, 'sign_in', 'rate_limited', 'not_started', 0],
    ['signIn', 503, 'sign_in', 'upstream_unavailable', 'not_started', 0],
    ['targetRead', 404, 'target_read', 'target_not_found', 'succeeded', 0],
    ['targetRead', 429, 'target_read', 'rate_limited', 'succeeded', 0],
    ['targetRead', 503, 'target_read', 'upstream_unavailable', 'succeeded', 0],
    ['generate', 409, 'generate', 'conflict', 'succeeded', 1],
    ['generate', 429, 'generate', 'rate_limited', 'succeeded', 1],
    ['generate', 502, 'generate', 'provider_error', 'succeeded', 1],
    ['generate', 503, 'generate', 'upstream_unavailable', 'succeeded', 1],
    ['generate', 504, 'generate', 'timeout', 'succeeded', 1],
    ['proofRead', 404, 'proof_read', 'target_not_found', 'succeeded', 1],
    ['proofRead', 503, 'proof_read', 'upstream_unavailable', 'succeeded', 1],
  ] as const)(
    'maps %s HTTP %s to %s/%s without retrying or returning its body',
    async (failedStep, status, phase, reason, cleanup, expectedDbCalls) => {
      const fetchImpl = fetchSequence({
        overrides: {
          [failedStep]: () => json({ message: RAW_RESPONSE, token: TOKEN }, status),
        },
      });
      const queryApplicationDb = databaseSequence();

      const result = await runAdminReportGenerateDiagnostic(
        runnerOptions(fetchImpl, queryApplicationDb),
      );

      expect(result).toMatchObject({ status: 'fail', phase, reason, cleanup });
      expect(JSON.stringify(result)).not.toMatch(
        new RegExp(`${RAW_RESPONSE}|${TOKEN}|${ACCOUNT_PASSWORD}`),
      );
      expect(
        fetchImpl.mock.calls.filter(([request]) => stepOf(urlOf(request)) === failedStep),
      ).toHaveLength(1);
      expect(queryApplicationDb).toHaveBeenCalledTimes(expectedDbCalls);
      const signOutCalls = fetchImpl.mock.calls.filter(
        ([request]) => stepOf(urlOf(request)) === 'signOut',
      );
      const sessionVerifyCalls = fetchImpl.mock.calls.filter(
        ([request]) => stepOf(urlOf(request)) === 'sessionVerify',
      );
      expect(signOutCalls).toHaveLength(failedStep === 'signIn' ? 0 : 1);
      expect(sessionVerifyCalls).toHaveLength(failedStep === 'signIn' ? 0 : 1);
      if (failedStep !== 'signIn') {
        expect(new Headers(signOutCalls[0]![1]?.headers).get('authorization')).toBe(
          `Bearer ${TOKEN}`,
        );
        expect(new Headers(sessionVerifyCalls[0]![1]?.headers).get('authorization')).toBe(
          `Bearer ${TOKEN}`,
        );
      }
    },
  );

  it('recognizes the exact structured report-generate usage-limit rejection', async () => {
    const fetchImpl = fetchSequence({
      overrides: {
        generate: () =>
          json(
            {
              error: {
                code: 'usage_limit_exceeded',
                message: RAW_RESPONSE,
                details: {
                  kind: 'report_generate',
                  limit: 10,
                  used: 10,
                  remaining: 0,
                  resetAt: '2026-09-01T00:00:00.000Z',
                  plan: 'free',
                  overridden: false,
                },
              },
              requestId: REQUEST_ID,
            },
            403,
          ),
      },
    });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'generate',
      reason: 'usage_limit_exceeded',
      cleanup: 'succeeded',
    });
    expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE);
    expect(queryApplicationDb).toHaveBeenCalledOnce();
    expect(
      fetchImpl.mock.calls.filter(([request]) => stepOf(urlOf(request)) === 'generate'),
    ).toHaveLength(1);
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'generate',
      'signOut',
      'sessionVerify',
    ]);
  });

  it('does not misclassify an unstructured generate 403 as a usage-limit rejection', async () => {
    const fetchImpl = fetchSequence({
      overrides: {
        generate: () => json({ message: RAW_RESPONSE }, 403),
      },
    });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'generate',
      reason: 'invalid_response',
      cleanup: 'succeeded',
    });
    expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE);
    expect(queryApplicationDb).toHaveBeenCalledOnce();
  });

  it('fails closed on a finalized target and still revokes the temporary session', async () => {
    const fetchImpl = fetchSequence({
      overrides: {
        targetRead: () => json({ ...REPORT, status: 'finalized' }),
      },
    });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'target_read',
      reason: 'target_not_draft',
      cleanup: 'succeeded',
    });
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'signOut',
      'sessionVerify',
    ]);
    expect(queryApplicationDb).not.toHaveBeenCalled();
  });

  it.each([
    ['an extra target field', () => json({ ...REPORT, rawCredential: TOKEN })],
    ['a mismatched target project', () => json({ ...REPORT, projectId: 'prj_99999999' })],
    ['a mismatched target number', () => json({ ...REPORT, number: REPORT_NUMBER + 1 })],
    ['invalid target JSON', () => new Response('{not-json', { status: 200 })],
  ] as const)('fails closed on %s and never reflects its content', async (_label, targetRead) => {
    const fetchImpl = fetchSequence({ overrides: { targetRead } });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'target_read',
      reason: 'invalid_response',
      cleanup: 'succeeded',
    });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'signOut',
      'sessionVerify',
    ]);
    expect(queryApplicationDb).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a strict-schema generate response',
      () =>
        json({
          report: { ...GENERATED_REPORT, rawProviderResponse: RAW_RESPONSE },
          debug: {
            systemPrompt: RAW_PROMPT,
            userPrompt: RAW_PROMPT,
            rawText: RAW_RESPONSE,
            model: 'gpt-5.4',
            vendor: 'openai',
          },
        }),
    ],
    ['invalid generate JSON', () => new Response('{not-json', { status: 200 })],
  ] as const)('fails closed on %s before persisted proof', async (_label, generate) => {
    const fetchImpl = fetchSequence({ overrides: { generate } });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'generate',
      reason: 'invalid_response',
      cleanup: 'succeeded',
    });
    expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE);
    expect(queryApplicationDb).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'generate',
      'signOut',
      'sessionVerify',
    ]);
  });

  it('fails missing persisted generation proof as proof_read/live_proof_failed', async () => {
    const fetchImpl = fetchSequence({
      overrides: {
        proofRead: () => json({ ...reportDebug(), lastGeneration: null }),
      },
    });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'proof_read',
      reason: 'live_proof_failed',
      cleanup: 'succeeded',
    });
    expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE);
    expect(queryApplicationDb).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'generate',
      'proofRead',
      'signOut',
      'sessionVerify',
    ]);
  });

  it('fails malformed persisted-proof JSON as proof_read/invalid_response', async () => {
    const fetchImpl = fetchSequence({
      overrides: {
        proofRead: () => new Response('{not-json', { status: 200 }),
      },
    });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'proof_read',
      reason: 'invalid_response',
      cleanup: 'succeeded',
    });
    expect(queryApplicationDb).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'generate',
      'proofRead',
      'signOut',
      'sessionVerify',
    ]);
  });

  it.each([
    ['replay', 'replay'],
    ['record', 'record'],
  ] as const)('fails %s proof as mode_gate/live_mode_required', async (_label, fixtureMode) => {
    const fetchImpl = fetchSequence({ fixtureMode });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'mode_gate',
      reason: 'live_mode_required',
      cleanup: 'succeeded',
    });
    expect(JSON.stringify(result)).not.toContain('replay_only');
    expect(queryApplicationDb).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'generate',
      'proofRead',
      'signOut',
      'sessionVerify',
    ]);
  });

  it('fails an idempotent replay before proof, ledger, preview, or limits work', async () => {
    const fetchImpl = fetchSequence({ idempotentReplay: true });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'mode_gate',
      reason: 'live_proof_failed',
      cleanup: 'succeeded',
    });
    expect(queryApplicationDb).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'generate',
      'signOut',
      'sessionVerify',
    ]);
  });

  it.each([
    [
      'mismatched persisted vendor',
      {
        ...reportDebug(),
        lastGeneration: { ...reportDebug().lastGeneration, vendor: 'other-provider' },
      },
    ],
    [
      'mismatched persisted model',
      {
        ...reportDebug(),
        lastGeneration: { ...reportDebug().lastGeneration, model: 'gpt-other' },
      },
    ],
    [
      'mismatched persisted system prompt',
      {
        ...reportDebug(),
        lastGeneration: {
          ...reportDebug().lastGeneration,
          systemPrompt: 'different persisted system prompt',
        },
      },
    ],
    [
      'mismatched persisted user prompt',
      {
        ...reportDebug(),
        lastGeneration: {
          ...reportDebug().lastGeneration,
          userPrompt: 'different persisted user prompt',
        },
      },
    ],
    [
      'mismatched persisted response',
      {
        ...reportDebug(),
        lastGeneration: {
          ...reportDebug().lastGeneration,
          response: 'different persisted provider response',
        },
      },
    ],
    [
      'persisted request after its finish',
      {
        ...reportDebug(),
        lastGeneration: {
          ...reportDebug().lastGeneration,
          requestedAt: '2026-08-08T07:59:06.000Z',
        },
      },
    ],
    [
      'persisted finish after the report update',
      {
        ...reportDebug(),
        lastGeneration: {
          ...reportDebug().lastGeneration,
          finishedAt: '2026-08-08T07:59:07.000Z',
        },
      },
    ],
  ] as const)('fails closed on %s as reviewed live-proof evidence', async (_label, proof) => {
    const fetchImpl = fetchSequence({ overrides: { proofRead: () => json(proof) } });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'proof_read',
      reason: 'live_proof_failed',
      cleanup: 'succeeded',
    });
    expect(queryApplicationDb).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE);
  });

  it('rejects a generated snapshot timestamp after the persisted request lower bound', async () => {
    const fetchImpl = fetchSequence({
      overrides: {
        generate: () =>
          json({
            report: {
              ...GENERATED_REPORT,
              generatedAt: '2026-08-08T07:59:01.000Z',
            },
            debug: {
              systemPrompt: RAW_PROMPT,
              userPrompt: RAW_PROMPT,
              rawText: RAW_RESPONSE,
              model: 'gpt-5.4',
              vendor: 'openai',
            },
          }),
      },
    });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'proof_read',
      reason: 'live_proof_failed',
      cleanup: 'succeeded',
    });
    expect(queryApplicationDb).toHaveBeenCalledOnce();
  });

  it.each([
    ['zero matching rows', [], 'usage_proof_missing'],
    ['two matching rows', [LIVE_LEDGER_ROW, LIVE_LEDGER_ROW], 'usage_proof_ambiguous'],
  ] as const)('fails %s with the reviewed ledger reason', async (_label, rows, reason) => {
    const fetchImpl = fetchSequence();
    const queryApplicationDb = databaseSequence({ ledgerRows: rows });

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'usage_proof',
      reason,
      cleanup: 'succeeded',
    });
    expect(queryApplicationDb).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).not.toContain('limits');
  });

  it.each([
    ['replay fixture row', { fixture_mode: 'replay' }],
    ['record fixture row', { fixture_mode: 'record' }],
    ['failed row', { status: 'error' }],
    ['wrong vendor', { vendor: 'groq' }],
    ['wrong model', { model: 'gpt-other' }],
    ['zero total tokens', { input_tokens: '0', output_tokens: '0', cached_tokens: '0' }],
    ['negative input tokens', { input_tokens: '-1' }],
    ['fractional output tokens', { output_tokens: '1.5' }],
    ['unsafe input tokens', { input_tokens: String(Number.MAX_SAFE_INTEGER + 1) }],
    ['negative cached tokens', { cached_tokens: '-1' }],
    ['cached tokens above input', { input_tokens: '12', cached_tokens: '13' }],
    ['negative latency', { latency_ms: '-1' }],
    ['latency beyond the functional deadline', { latency_ms: '75001' }],
  ] as const)('fails live proof for %s', async (_label, rowOverride) => {
    const fetchImpl = fetchSequence();
    const queryApplicationDb = databaseSequence({
      ledgerRows: [{ ...LIVE_LEDGER_ROW, ...rowOverride }],
    });

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'usage_proof',
      reason: 'live_proof_failed',
      cleanup: 'succeeded',
    });
    expect(JSON.stringify(result)).not.toMatch(new RegExp(`${USER_ID}|${LEDGER_ID}`));
  });

  it.each([
    ['a missing generated body', null],
    [
      'a schema-invalid generated body',
      { ...REPORT_BODY, workers: [{ role: 'Carpenter', count: 4 }] },
    ],
  ] as const)('fails %s as preview/preview_invalid after usage proof', async (_label, body) => {
    const fetchImpl = fetchSequence({
      overrides: {
        generate: () =>
          json({
            report: { ...GENERATED_REPORT, body },
            debug: {
              systemPrompt: RAW_PROMPT,
              userPrompt: RAW_PROMPT,
              rawText: RAW_RESPONSE,
              model: 'gpt-5.4',
              vendor: 'openai',
            },
          }),
      },
    });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'preview',
      reason: 'preview_invalid',
      cleanup: 'succeeded',
    });
    expect(queryApplicationDb).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).not.toContain('limits');
  });

  it('clips by Unicode code point, caps arrays, counts attachments, and hashes canonical JSON', async () => {
    const fetchImpl = fetchSequence();
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({ status: 'pass', preview: expectedPreview() });
    if (result.status !== 'pass') throw new Error('expected live canary pass');
    expect(Array.from(result.preview.sample.title ?? '')).toHaveLength(400);
    expect(Array.from(result.preview.sample.summary ?? '')).toHaveLength(400);
    expect(Array.from(result.preview.sample.weather?.impact ?? '')).toHaveLength(400);
    expect(Array.from(result.preview.sample.workers[0]?.notes ?? '')).toHaveLength(400);
    expect(Array.from(result.preview.sample.materials[0]?.notes ?? '')).toHaveLength(400);
    expect(Array.from(result.preview.sample.issues[0]?.description ?? '')).toHaveLength(400);
    expect(Array.from(result.preview.sample.nextSteps[0] ?? '')).toHaveLength(400);
    expect(Array.from(result.preview.sample.summarySections[0]?.body ?? '')).toHaveLength(400);
    expect(result.preview.sample.workers).toHaveLength(5);
    expect(result.preview.sample.materials).toHaveLength(5);
    expect(result.preview.sample.issues).toHaveLength(5);
    expect(result.preview.sample.nextSteps).toHaveLength(5);
    expect(result.preview.sample.summarySections).toHaveLength(5);
    expect(JSON.stringify(result.preview.sample)).not.toMatch(/attachments|not_[a-z0-9]+/);
    expect(result.preview.bodySha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('derives the same SHA-256 from equivalent report bodies with different object key order', async () => {
    const reorderedBody = {
      summarySections: REPORT_BODY.summarySections.map((section) =>
        section.attachments
          ? {
              attachments: {
                documents: section.attachments.documents,
                images: section.attachments.images,
              },
              body: section.body,
              title: section.title,
            }
          : { body: section.body, title: section.title },
      ),
      nextSteps: REPORT_BODY.nextSteps,
      issues: REPORT_BODY.issues.map((issue) => ({
        ...(issue.attachments
          ? {
              attachments: {
                documents: issue.attachments.documents,
                images: issue.attachments.images,
              },
            }
          : {}),
        action: issue.action,
        description: issue.description,
        severity: issue.severity,
        title: issue.title,
      })),
      materials: REPORT_BODY.materials.map((material) => ({
        notes: material.notes,
        condition: material.condition,
        status: material.status,
        unit: material.unit,
        quantity: material.quantity,
        name: material.name,
      })),
      workers: REPORT_BODY.workers.map((worker) => ({
        notes: worker.notes,
        hours: worker.hours,
        count: worker.count,
        role: worker.role,
      })),
      weather: {
        impact: REPORT_BODY.weather.impact,
        wind: REPORT_BODY.weather.wind,
        temperature: REPORT_BODY.weather.temperature,
        condition: REPORT_BODY.weather.condition,
      },
      meta: {
        visitDate: REPORT_BODY.meta.visitDate,
        summary: REPORT_BODY.meta.summary,
        title: REPORT_BODY.meta.title,
      },
    };
    const fetchImpl = fetchSequence({
      overrides: {
        generate: () =>
          json({
            report: { ...GENERATED_REPORT, body: reorderedBody },
            debug: {
              systemPrompt: RAW_PROMPT,
              userPrompt: RAW_PROMPT,
              rawText: RAW_RESPONSE,
              model: 'gpt-5.4',
              vendor: 'openai',
            },
          }),
      },
    });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'pass',
      preview: { bodySha256: REPORT_BODY_SHA256 },
    });
  });

  it.each([
    ['an upstream limits failure', () => json({ message: RAW_RESPONSE }, 503)],
    [
      'a missing allowlisted limits bucket',
      () =>
        json({
          plan: 'free',
          buckets: LIMIT_BUCKETS.filter((bucket) => bucket.kind !== 'ai_output_tokens'),
        }),
    ],
    [
      'a duplicate allowlisted limits bucket',
      () =>
        json({
          plan: 'free',
          buckets: [...LIMIT_BUCKETS, LIMIT_BUCKETS[0]],
        }),
    ],
    [
      'a malformed limits bucket',
      () =>
        json({
          plan: 'free',
          buckets: [{ ...LIMIT_BUCKETS[0], rawCredential: TOKEN }, ...LIMIT_BUCKETS.slice(1)],
        }),
    ],
    ['malformed limits JSON', () => new Response('{not-json', { status: 200 })],
  ] as const)('returns only limits_unavailable for %s', async (_label, limits) => {
    const fetchImpl = fetchSequence({ overrides: { limits } });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'warning',
      generation: expectedGeneration(),
      preview: expectedPreview(),
      usage: { matched: true },
      limits: null,
      cleanup: 'succeeded',
      warnings: ['limits_unavailable'],
    });
    expect(JSON.stringify(result)).not.toMatch(new RegExp(`${RAW_RESPONSE}|${TOKEN}`));
    expect(queryApplicationDb).toHaveBeenCalledTimes(2);
    expect(
      fetchImpl.mock.calls.filter(([request]) => stepOf(urlOf(request)) === 'limits'),
    ).toHaveLength(1);
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'generate',
      'proofRead',
      'limits',
      'signOut',
      'sessionVerify',
    ]);
  });

  it('returns only sign_out_failed when live proof and limits remain available', async () => {
    const fetchImpl = fetchSequence({
      overrides: {
        signOut: () => json({ message: RAW_RESPONSE }, 503),
      },
    });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'warning',
      generation: expectedGeneration(),
      preview: expectedPreview(),
      usage: { matched: true },
      limits: expectedLimits(),
      cleanup: 'failed',
      warnings: ['sign_out_failed'],
    });
    expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE);
    expect(queryApplicationDb).toHaveBeenCalledTimes(2);
    expect(
      fetchImpl.mock.calls.filter(([request]) => stepOf(urlOf(request)) === 'signOut'),
    ).toHaveLength(1);
    expect(
      fetchImpl.mock.calls.filter(([request]) => stepOf(urlOf(request)) === 'sessionVerify'),
    ).toHaveLength(0);
  });

  it.each([
    [
      'a non-null session',
      () =>
        json({
          session: { id: 'ses_still_active', token: RAW_RESPONSE },
          user: { id: USER_ID, email: ACCOUNT_EMAIL },
        }),
    ],
    ['malformed session JSON', () => new Response(`{${RAW_RESPONSE}`, { status: 200 })],
    ['JSON null with status 201', () => json(null, 201)],
    ['a session verification error', () => json({ message: RAW_RESPONSE }, 503)],
  ] as const)(
    'marks cleanup failed when sign-out returns 200 but verification returns %s',
    async (_label, sessionVerify) => {
      const fetchImpl = fetchSequence({ overrides: { sessionVerify } });
      const queryApplicationDb = databaseSequence();

      const result = await runAdminReportGenerateDiagnostic(
        runnerOptions(fetchImpl, queryApplicationDb),
      );

      expect(result).toMatchObject({
        status: 'warning',
        generation: expectedGeneration(),
        preview: expectedPreview(),
        usage: { matched: true },
        limits: expectedLimits(),
        cleanup: 'failed',
        warnings: ['sign_out_failed'],
      });
      expect(JSON.stringify(result)).not.toMatch(new RegExp(`${RAW_RESPONSE}|${TOKEN}`));
      expect(queryApplicationDb).toHaveBeenCalledTimes(2);
      expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
        'signIn',
        'targetRead',
        'generate',
        'proofRead',
        'limits',
        'signOut',
        'sessionVerify',
      ]);

      const [signOutCall, verificationCall] = fetchImpl.mock.calls.slice(-2);
      expect(signOutCall).toBeDefined();
      expect(verificationCall).toBeDefined();
      expect(signOutCall![1]?.method).toBe('POST');
      expect(verificationCall![1]?.method).toBe('GET');
      expect(verificationCall![1]?.body).toBeUndefined();
      expect(verificationCall![1]?.redirect).toBe('error');
      expect(new Headers(verificationCall![1]?.headers).get('authorization')).toBe(
        `Bearer ${TOKEN}`,
      );
      expect(verificationCall![1]?.signal).toBe(signOutCall![1]?.signal);
    },
  );

  it('keeps proven live generation when only limits and cleanup degrade', async () => {
    const fetchImpl = fetchSequence({
      overrides: {
        limits: () => json({ message: RAW_RESPONSE }, 503),
        signOut: () => json({ message: RAW_RESPONSE }, 503),
      },
    });
    const queryApplicationDb = databaseSequence();

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'warning',
      generation: expectedGeneration(),
      preview: expectedPreview(),
      usage: { matched: true, inputTokens: 1_200, outputTokens: 300, cachedTokens: 200 },
      limits: null,
      cleanup: 'failed',
      warnings: ['limits_unavailable', 'sign_out_failed'],
    });
    expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE);
  });

  it('bounds a never-resolving default application-pool query by the functional deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    defaultPoolQuery.mockReturnValue(
      new Promise<never>(() => {
        // Deliberately model a pool query that ignores cancellation and never settles.
      }),
    );
    const fetchImpl = fetchSequence();
    const options = {
      configuration: CONFIGURATION,
      fetchImpl,
      now: () => new Date(Date.now()),
      timeoutMs: 25,
    };

    const pending = runAdminReportGenerateDiagnostic(options);
    await vi.advanceTimersByTimeAsync(25);
    const result = await pending;

    expect(result).toMatchObject({
      observedAt: NOW.toISOString(),
      status: 'fail',
      durationMs: 25,
      phase: 'usage_window',
      reason: 'timeout',
      cleanup: 'succeeded',
    });
    expect(defaultPoolQuery).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'signOut',
      'sessionVerify',
    ]);
    expect(new Headers(fetchImpl.mock.calls[3]![1]?.headers).get('authorization')).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it('observes a default-pool rejection that arrives after the runner returns on timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let rejectPoolQuery!: (reason?: unknown) => void;
    const poolQuery = new Promise<never>((_resolve, reject) => {
      rejectPoolQuery = reject;
    });
    defaultPoolQuery.mockReturnValue(poolQuery);
    const observeUnhandled = vi.fn();
    process.on('unhandledRejection', observeUnhandled);
    const fetchImpl = fetchSequence();
    const options = {
      configuration: CONFIGURATION,
      fetchImpl,
      now: () => new Date(Date.now()),
      timeoutMs: 25,
    };

    try {
      const pending = runAdminReportGenerateDiagnostic(options);
      await vi.advanceTimersByTimeAsync(25);
      const result = await pending;

      expect(result).toMatchObject({
        observedAt: NOW.toISOString(),
        status: 'fail',
        durationMs: 25,
        phase: 'usage_window',
        reason: 'timeout',
        cleanup: 'succeeded',
      });
      expect(defaultPoolQuery).toHaveBeenCalledOnce();
      expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
        'signIn',
        'targetRead',
        'signOut',
        'sessionVerify',
      ]);

      rejectPoolQuery(new Error(DATABASE_ERROR));
      vi.useRealTimers();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(observeUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', observeUnhandled);
    }
  });

  it('fails a pre-generation database-clock error without generating or retrying', async () => {
    const fetchImpl = fetchSequence();
    const queryApplicationDb = databaseSequence({
      overrides: {
        clock: async () => Promise.reject(new Error(DATABASE_ERROR)),
      },
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'usage_window',
      reason: 'upstream_unavailable',
      cleanup: 'succeeded',
    });
    expect(queryApplicationDb).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'signOut',
      'sessionVerify',
    ]);
    expect(JSON.stringify(result)).not.toContain(DATABASE_ERROR);
    expect(stringifiedConsole([errors, warnings, logs])).not.toContain(DATABASE_ERROR);
  });

  it('maps a ledger-query error to a redacted usage-proof failure without retrying', async () => {
    const fetchImpl = fetchSequence();
    const queryApplicationDb = databaseSequence({
      overrides: {
        ledger: async () => Promise.reject(new Error(DATABASE_ERROR)),
      },
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'usage_proof',
      reason: 'upstream_unavailable',
      cleanup: 'succeeded',
    });
    expect(queryApplicationDb).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'generate',
      'proofRead',
      'signOut',
      'sessionVerify',
    ]);
    expect(JSON.stringify(result)).not.toContain(DATABASE_ERROR);
    expect(stringifiedConsole([errors, warnings, logs])).not.toContain(DATABASE_ERROR);
  });

  it.each([
    ['no clock rows', []],
    ['two clock rows', [{ lower_bound: DATABASE_LOWER_BOUND }, { lower_bound: NOW.toISOString() }]],
    ['an invalid clock value', [{ lower_bound: 'not-a-database-timestamp' }]],
  ] as const)('fails closed on %s before generation', async (_label, clockRows) => {
    const fetchImpl = fetchSequence();
    const queryApplicationDb = databaseSequence({ clockRows });

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'usage_window',
      reason: 'invalid_response',
      cleanup: 'succeeded',
    });
    expect(queryApplicationDb).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'signOut',
      'sessionVerify',
    ]);
  });

  it('maps a generation network error to a redacted failure and does not retry or downgrade', async () => {
    const fetchImpl = fetchSequence({
      overrides: { generate: () => Promise.reject(new Error(RAW_RESPONSE)) },
    });
    const queryApplicationDb = databaseSequence();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'generate',
      reason: 'upstream_unavailable',
      cleanup: 'succeeded',
    });
    expect(
      fetchImpl.mock.calls.filter(([request]) => stepOf(urlOf(request)) === 'generate'),
    ).toHaveLength(1);
    expect(queryApplicationDb).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'generate',
      'signOut',
      'sessionVerify',
    ]);
    expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE);
    expect(stringifiedConsole([errors, warnings, logs])).not.toContain(RAW_RESPONSE);
  });

  it('uses the single functional deadline for the ledger query and a fresh cleanup signal', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let ledgerSignal: AbortSignal | undefined;
    const cleanupSignals: AbortSignal[] = [];
    const fetchImpl = fetchSequence({
      overrides: {
        signOut: (_url, init) => {
          const signal = init?.signal;
          if (!(signal instanceof AbortSignal)) throw new Error('missing cleanup signal');
          cleanupSignals.push(signal);
          return signal.aborted
            ? Promise.reject(new DOMException('aborted', 'AbortError'))
            : Promise.resolve(json({ success: true }));
        },
        sessionVerify: (_url, init) => {
          const signal = init?.signal;
          if (!(signal instanceof AbortSignal)) throw new Error('missing cleanup signal');
          cleanupSignals.push(signal);
          return signal.aborted
            ? Promise.reject(new DOMException('aborted', 'AbortError'))
            : Promise.resolve(json(null));
        },
      },
    });
    const queryApplicationDb = databaseSequence({
      overrides: {
        ledger: async (_text, _values, signal) => {
          ledgerSignal = signal;
          return new Promise<{ rows: readonly DatabaseRow[] }>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('aborted', 'AbortError')),
              { once: true },
            );
          });
        },
      },
    });
    const options = {
      ...runnerOptions(fetchImpl, queryApplicationDb),
      now: () => new Date(Date.now()),
      timeoutMs: 25,
    };

    const pending = runAdminReportGenerateDiagnostic(options);
    await vi.advanceTimersByTimeAsync(25);
    const result = await pending;

    expect(result).toMatchObject({
      observedAt: NOW.toISOString(),
      status: 'fail',
      durationMs: 25,
      phase: 'usage_proof',
      reason: 'timeout',
      cleanup: 'succeeded',
    });
    expect(ledgerSignal?.aborted).toBe(true);
    expect(cleanupSignals).toHaveLength(2);
    expect(cleanupSignals.every((signal) => !signal.aborted)).toBe(true);
    expect(new Set(cleanupSignals).size).toBe(1);
    expect(cleanupSignals[0]).not.toBe(ledgerSignal);
    expect(queryApplicationDb).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'generate',
      'proofRead',
      'signOut',
      'sessionVerify',
    ]);
  });

  it('caps total duration at 80 seconds and shares one five-second cleanup grace', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let mainAbortEvents = 0;
    let cleanupAbortEvents = 0;
    let signOutResolved = false;
    const signals: AbortSignal[] = [];
    const fetchImpl = fetchSequence({
      overrides: {
        generate: (_url, init) => {
          const signal = init?.signal;
          if (!(signal instanceof AbortSignal)) throw new Error('missing main signal');
          signals.push(signal);
          return new Promise<Response>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                mainAbortEvents += 1;
                reject(new DOMException('aborted', 'AbortError'));
              },
              { once: true },
            );
          });
        },
        signOut: (_url, init) => {
          const signal = init?.signal;
          if (!(signal instanceof AbortSignal)) throw new Error('missing cleanup signal');
          signals.push(signal);
          return new Promise<Response>((resolve) => {
            setTimeout(() => {
              signOutResolved = true;
              resolve(json({ success: true }));
            }, 4_999);
          });
        },
        sessionVerify: (_url, init) => {
          const signal = init?.signal;
          if (!(signal instanceof AbortSignal)) throw new Error('missing cleanup signal');
          signals.push(signal);
          return new Promise<Response>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                cleanupAbortEvents += 1;
                reject(new DOMException('aborted', 'AbortError'));
              },
              { once: true },
            );
          });
        },
      },
    });
    const querySignals: AbortSignal[] = [];
    const queryApplicationDb = vi.fn<QueryApplicationDb>(async (text, values, signal) => {
      querySignals.push(signal);
      return databaseSequence()(text, values, signal);
    });
    const options = {
      ...runnerOptions(fetchImpl, queryApplicationDb),
      now: () => new Date(Date.now()),
      timeoutMs: 75_000,
    };

    const pending = runAdminReportGenerateDiagnostic(options);
    await vi.advanceTimersByTimeAsync(75_000);
    await vi.advanceTimersByTimeAsync(4_998);
    expect(signOutResolved).toBe(false);
    expect(cleanupAbortEvents).toBe(0);
    expect(
      fetchImpl.mock.calls.filter(([request]) => stepOf(urlOf(request)) === 'sessionVerify'),
    ).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(signOutResolved).toBe(true);
    expect(cleanupAbortEvents).toBe(0);
    expect(
      fetchImpl.mock.calls.filter(([request]) => stepOf(urlOf(request)) === 'sessionVerify'),
    ).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result).toMatchObject({
      observedAt: NOW.toISOString(),
      status: 'fail',
      durationMs: 80_000,
      phase: 'generate',
      reason: 'timeout',
      cleanup: 'failed',
    });
    expect(mainAbortEvents).toBe(1);
    expect(cleanupAbortEvents).toBe(1);
    expect(querySignals).toHaveLength(1);
    expect(querySignals[0]).toBe(signals[0]);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(true);
    expect(signals[2]?.aborted).toBe(true);
    expect(signals[1]).toBe(signals[2]);
    expect(signals[1]).not.toBe(signals[0]);
    expect(new Set(signals).size).toBe(2);
    expect(queryApplicationDb).toHaveBeenCalledOnce();
    expect(
      fetchImpl.mock.calls.filter(([request]) => stepOf(urlOf(request)) === 'generate'),
    ).toHaveLength(1);
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'generate',
      'signOut',
      'sessionVerify',
    ]);
  });

  it('returns only bounded synthetic preview text and never logs secrets or hidden proof data', async () => {
    const fetchImpl = fetchSequence();
    const queryApplicationDb = databaseSequence({
      ledgerRows: [
        {
          ...LIVE_LEDGER_ROW,
          id: LEDGER_ID,
          user_id: USER_ID,
          project_id: PROJECT_ID,
          report_id: REPORT_ID,
          created_at: '2026-08-08T07:59:05.500Z',
        },
      ],
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runAdminReportGenerateDiagnostic(
      runnerOptions(fetchImpl, queryApplicationDb),
    );
    const serialized = JSON.stringify(result);
    const consoleOutput = stringifiedConsole([errors, warnings, logs]);

    expect(serialized).toContain(LIVE_PREVIEW_TEXT);
    expect(serialized).toContain(clipCodePoints(LONG_TITLE));
    expect(serialized).not.toContain(LONG_TITLE);
    expect(serialized).not.toContain(CLIPPED_WORKER);
    for (const secret of [
      ACCOUNT_PASSWORD,
      TOKEN,
      USER_ID,
      RAW_PROMPT,
      RAW_NOTE,
      RAW_RESPONSE,
      LEDGER_ID,
      'not_8h3kq2vp9w',
      DATABASE_ERROR,
    ]) {
      expect(serialized).not.toContain(secret);
      expect(consoleOutput).not.toContain(secret);
    }
  });
});
