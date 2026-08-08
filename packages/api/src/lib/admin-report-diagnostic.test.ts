import { afterEach, describe, expect, it, vi } from 'vitest';

const API_ORIGIN = 'https://harpa-pro-api-pr-42.fly.dev';
const ACCOUNT_EMAIL = 'report-canary@e2e.harpapro.com';
const ACCOUNT_PASSWORD = 'server-only-password-12345';
const PROJECT_ID = 'prj_23456789';
const REPORT_ID = 'rpt_23456789';
const REPORT_NUMBER = 7;
const TOKEN = 'sentinel-bearer-token-1234567890';
const NOW = new Date('2026-08-08T08:00:00.000Z');
const PREVIOUS_UPDATED_AT = '2026-08-08T07:55:00.000Z';
const REQUESTED_AT = '2026-08-08T07:59:00.000Z';
const FINISHED_AT = '2026-08-08T07:59:05.000Z';
const REPORT_UPDATED_AT = '2026-08-08T07:59:06.000Z';
const REQUEST_ID = 'rid-report-diagnostic-123';
const RAW_PROMPT = 'sentinel raw prompt must never escape';
const RAW_RESPONSE = 'sentinel raw provider response must never escape';
const RAW_NOTE = 'sentinel synthetic note must never escape';

vi.mock('../env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../env.js')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      BETTER_AUTH_URL: 'https://harpa-pro-api-pr-42.fly.dev',
      TEST_ACCOUNT_EMAILS: 'report-canary@e2e.harpapro.com',
      TEST_ACCOUNT_PASSWORD: 'server-only-password-12345',
      ADMIN_REPORT_DIAGNOSTIC_EMAIL: 'report-canary@e2e.harpapro.com',
      ADMIN_REPORT_DIAGNOSTIC_PROJECT_ID: 'prj_23456789',
      ADMIN_REPORT_DIAGNOSTIC_REPORT_NUMBER: 7,
    },
  };
});

import { runAdminReportGenerateDiagnostic } from './admin-report-diagnostic.js';

type Step = 'signIn' | 'targetRead' | 'generate' | 'proofRead' | 'limits' | 'signOut';
type StepOverride = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

const CONFIGURATION = {
  baseUrl: API_ORIGIN,
  email: ACCOUNT_EMAIL,
  password: ACCOUNT_PASSWORD,
  projectId: PROJECT_ID,
  reportNumber: REPORT_NUMBER,
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
  generatedAt: FINISHED_AT,
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
        id: 'not_23456789',
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

function defaultResponse(
  step: Step,
  fixtureMode: 'live' | 'replay' | 'record',
  idempotentReplay: boolean,
): Response {
  switch (step) {
    case 'signIn':
      return json(
        { user: { id: 'usr_23456789', email: ACCOUNT_EMAIL, name: 'Synthetic canary' } },
        200,
        { 'set-auth-token': TOKEN },
      );
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
  }
}

function fetchSequence(input?: {
  fixtureMode?: 'live' | 'replay' | 'record';
  idempotentReplay?: boolean;
  overrides?: Partial<Record<Step, StepOverride>>;
}) {
  const fixtureMode = input?.fixtureMode ?? 'live';
  const idempotentReplay = input?.idempotentReplay ?? false;
  return vi.fn<typeof fetch>(async (request, init) => {
    const url = urlOf(request);
    const step = stepOf(url);
    const override = input?.overrides?.[step];
    if (override) return override(url, init);
    return defaultResponse(step, fixtureMode, idempotentReplay);
  });
}

function runnerOptions(fetchImpl: typeof fetch) {
  return {
    configuration: CONFIGURATION,
    fetchImpl,
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

function expectedGeneration(input?: {
  fixtureMode?: 'live' | 'replay';
  idempotentReplay?: boolean;
}) {
  return {
    httpStatus: 200,
    requestId: REQUEST_ID,
    durationMs: 0,
    requestedAt: REQUESTED_AT,
    finishedAt: FINISHED_AT,
    reportUpdatedAt: REPORT_UPDATED_AT,
    generatedAt: FINISHED_AT,
    vendor: 'openai',
    model: 'gpt-5.4',
    fixtureMode: input?.fixtureMode ?? 'live',
    idempotentReplay: input?.idempotentReplay ?? false,
  };
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
});

describe('runAdminReportGenerateDiagnostic', () => {
  it('returns not configured without making an outbound request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      runAdminReportGenerateDiagnostic({
        configuration: null,
        fetchImpl,
        now: () => NOW,
      }),
    ).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'not_configured',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses env/global-fetch defaults and performs the exact bounded HTTP sequence', async () => {
    const fetchImpl = fetchSequence();
    vi.stubGlobal('fetch', fetchImpl);

    const result = await runAdminReportGenerateDiagnostic({ now: () => NOW });

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
      limits: expectedLimits(),
      cleanup: 'succeeded',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(6);
    const calls = fetchImpl.mock.calls.map(([request, init]) => ({
      url: urlOf(request),
      init,
      headers: new Headers(init?.headers),
    }));
    expect(calls.map(({ url }) => `${url.origin}${url.pathname}`)).toEqual([
      `${API_ORIGIN}/api/auth/sign-in/email`,
      `${API_ORIGIN}/projects/${PROJECT_ID}/reports/${REPORT_NUMBER}`,
      `${API_ORIGIN}/projects/${PROJECT_ID}/reports/${REPORT_NUMBER}/generate`,
      `${API_ORIGIN}/projects/${PROJECT_ID}/reports/${REPORT_NUMBER}/debug`,
      `${API_ORIGIN}/me/limits`,
      `${API_ORIGIN}/api/auth/sign-out`,
    ]);
    expect(calls.map(({ init }) => init?.method)).toEqual([
      'POST',
      'GET',
      'POST',
      'GET',
      'GET',
      'POST',
    ]);
    expect(calls.map(({ init }) => init?.redirect)).toEqual([
      'error',
      'error',
      'error',
      'error',
      'error',
      'error',
    ]);
    expect(calls[0]!.headers.get('content-type')).toBe('application/json');
    expect(calls[2]!.headers.get('content-type')).toBe('application/json');
    expect(calls[5]!.headers.get('content-type')).toBe('application/json');
    expect([calls[1]!.init?.body, calls[3]!.init?.body, calls[4]!.init?.body]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      email: ACCOUNT_EMAIL,
      password: ACCOUNT_PASSWORD,
    });
    expect(calls[0]!.headers.get('authorization')).toBeNull();
    expect(JSON.parse(String(calls[2]!.init?.body))).toEqual({
      expectedUpdatedAt: PREVIOUS_UPDATED_AT,
    });
    expect(calls[2]!.headers.get('idempotency-key')).toBe(
      `admin-report-diagnostic:${PROJECT_ID}:${REPORT_NUMBER}:${PREVIOUS_UPDATED_AT}`,
    );
    expect(String(calls[2]!.init?.body)).not.toContain('fixtureName');
    expect(JSON.parse(String(calls[5]!.init?.body))).toEqual({});
    for (const call of calls.slice(1)) {
      expect(call.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    }
    const signals = calls.map(({ init }) => init?.signal);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(new Set(signals).size).toBe(1);
  });

  it.each([
    ['replay fixture proof', 'replay', false],
    ['an idempotent response replay', 'live', true],
  ] as const)(
    'returns the correlated replay warning for %s',
    async (_label, fixtureMode, idempotentReplay) => {
      const fetchImpl = fetchSequence({ fixtureMode, idempotentReplay });

      const result = await runAdminReportGenerateDiagnostic(runnerOptions(fetchImpl));

      expect(result).toEqual({
        observedAt: NOW.toISOString(),
        status: 'warning',
        durationMs: 0,
        target: {
          accountEmail: ACCOUNT_EMAIL,
          projectId: PROJECT_ID,
          reportId: REPORT_ID,
          reportNumber: REPORT_NUMBER,
        },
        generation: expectedGeneration({ fixtureMode, idempotentReplay }),
        limits: expectedLimits(),
        cleanup: 'succeeded',
        warnings: ['replay_only'],
      });
    },
  );

  it('keeps successful generation proof when limits are unavailable', async () => {
    const fetchImpl = fetchSequence({
      overrides: {
        limits: () => json({ message: RAW_RESPONSE }, 503),
      },
    });

    const result = await runAdminReportGenerateDiagnostic(runnerOptions(fetchImpl));

    expect(result).toMatchObject({
      status: 'warning',
      generation: expectedGeneration(),
      limits: null,
      cleanup: 'succeeded',
      warnings: ['limits_unavailable'],
    });
    expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it('keeps successful generation proof when sign-out cannot be confirmed', async () => {
    const fetchImpl = fetchSequence({
      overrides: {
        signOut: () => json({ message: RAW_RESPONSE }, 503),
      },
    });

    const result = await runAdminReportGenerateDiagnostic(runnerOptions(fetchImpl));

    expect(result).toMatchObject({
      status: 'warning',
      generation: expectedGeneration(),
      limits: expectedLimits(),
      cleanup: 'failed',
      warnings: ['sign_out_failed'],
    });
    expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE);
  });

  it('returns every correlated warning once when replay, limits, and cleanup all degrade', async () => {
    const fetchImpl = fetchSequence({
      fixtureMode: 'replay',
      idempotentReplay: true,
      overrides: {
        limits: () => json({ message: 'limits failed' }, 503),
        signOut: () => json({ message: 'sign-out failed' }, 503),
      },
    });

    const result = await runAdminReportGenerateDiagnostic(runnerOptions(fetchImpl));

    expect(result).toMatchObject({
      status: 'warning',
      generation: expectedGeneration({ fixtureMode: 'replay', idempotentReplay: true }),
      limits: null,
      cleanup: 'failed',
      warnings: ['replay_only', 'limits_unavailable', 'sign_out_failed'],
    });
  });

  it.each([
    ['signIn', 401, 'sign_in', 'sign_in_failed', 'not_started'],
    ['signIn', 429, 'sign_in', 'rate_limited', 'not_started'],
    ['signIn', 503, 'sign_in', 'upstream_unavailable', 'not_started'],
    ['targetRead', 404, 'target_read', 'target_not_found', 'succeeded'],
    ['targetRead', 429, 'target_read', 'rate_limited', 'succeeded'],
    ['targetRead', 503, 'target_read', 'upstream_unavailable', 'succeeded'],
    ['generate', 409, 'generate', 'conflict', 'succeeded'],
    ['generate', 429, 'generate', 'rate_limited', 'succeeded'],
    ['generate', 502, 'generate', 'provider_error', 'succeeded'],
    ['generate', 503, 'generate', 'upstream_unavailable', 'succeeded'],
    ['generate', 504, 'generate', 'timeout', 'succeeded'],
    ['proofRead', 404, 'proof_read', 'target_not_found', 'succeeded'],
    ['proofRead', 503, 'proof_read', 'upstream_unavailable', 'succeeded'],
  ] as const)(
    'maps %s HTTP %s to %s/%s without returning the upstream body',
    async (failedStep, status, phase, reason, cleanup) => {
      const fetchImpl = fetchSequence({
        overrides: {
          [failedStep]: () => json({ message: RAW_RESPONSE, token: TOKEN }, status),
        },
      });

      const result = await runAdminReportGenerateDiagnostic(runnerOptions(fetchImpl));

      expect(result).toMatchObject({ status: 'fail', phase, reason, cleanup });
      expect(JSON.stringify(result)).not.toMatch(
        new RegExp(`${RAW_RESPONSE}|${TOKEN}|${ACCOUNT_PASSWORD}`),
      );
      const signOutCalls = fetchImpl.mock.calls.filter(
        ([request]) => stepOf(urlOf(request)) === 'signOut',
      );
      expect(signOutCalls).toHaveLength(failedStep === 'signIn' ? 0 : 1);
    },
  );

  it('recognizes only the structured report-generate usage-limit rejection', async () => {
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
            },
            403,
          ),
      },
    });

    const result = await runAdminReportGenerateDiagnostic(runnerOptions(fetchImpl));

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'generate',
      reason: 'usage_limit_exceeded',
      cleanup: 'succeeded',
    });
    expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE);
  });

  it.each([null, '', 'token with whitespace'])(
    'rejects a missing or malformed bearer token before reading the target: %s',
    async (token) => {
      const fetchImpl = fetchSequence({
        overrides: {
          signIn: () =>
            json(
              { user: { id: 'usr_23456789', email: ACCOUNT_EMAIL } },
              200,
              token === null ? undefined : { 'set-auth-token': token },
            ),
        },
      });

      const result = await runAdminReportGenerateDiagnostic(runnerOptions(fetchImpl));

      expect(result).toMatchObject({
        status: 'fail',
        phase: 'sign_in',
        reason: 'invalid_response',
        cleanup: 'not_started',
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
    },
  );

  it('fails closed on a finalized target and still revokes the temporary session', async () => {
    const fetchImpl = fetchSequence({
      overrides: {
        targetRead: () => json({ ...REPORT, status: 'finalized' }),
      },
    });

    const result = await runAdminReportGenerateDiagnostic(runnerOptions(fetchImpl));

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
    ]);
  });

  it.each([
    ['an extra target field', () => json({ ...REPORT, rawCredential: TOKEN })],
    ['a mismatched target', () => json({ ...REPORT, projectId: 'prj_99999999' })],
    ['invalid JSON', () => new Response('{not-json', { status: 200 })],
  ] as const)('fails closed on %s and never reflects its content', async (_label, targetRead) => {
    const fetchImpl = fetchSequence({ overrides: { targetRead } });

    const result = await runAdminReportGenerateDiagnostic(runnerOptions(fetchImpl));

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'target_read',
      reason: 'invalid_response',
      cleanup: 'succeeded',
    });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it.each([
    [
      'a malformed generate response',
      'generate',
      {
        generate: () =>
          json({ report: { ...GENERATED_REPORT, rawProviderResponse: RAW_RESPONSE } }),
      },
    ],
    [
      'missing persisted generation proof',
      'proof_read',
      { proofRead: () => json({ ...reportDebug(), lastGeneration: null }) },
    ],
    [
      'mismatched persisted provider proof',
      'proof_read',
      {
        proofRead: () =>
          json({
            ...reportDebug(),
            lastGeneration: { ...reportDebug().lastGeneration, vendor: 'other-provider' },
          }),
      },
    ],
    [
      'mismatched persisted system prompt',
      'proof_read',
      {
        proofRead: () =>
          json({
            ...reportDebug(),
            lastGeneration: {
              ...reportDebug().lastGeneration,
              systemPrompt: 'different persisted system prompt',
            },
          }),
      },
    ],
    [
      'mismatched persisted user prompt',
      'proof_read',
      {
        proofRead: () =>
          json({
            ...reportDebug(),
            lastGeneration: {
              ...reportDebug().lastGeneration,
              userPrompt: 'different persisted user prompt',
            },
          }),
      },
    ],
    [
      'mismatched persisted response',
      'proof_read',
      {
        proofRead: () =>
          json({
            ...reportDebug(),
            lastGeneration: {
              ...reportDebug().lastGeneration,
              response: 'different persisted provider response',
            },
          }),
      },
    ],
    [
      'persisted finish after the report update',
      'proof_read',
      {
        proofRead: () =>
          json({
            ...reportDebug(),
            lastGeneration: {
              ...reportDebug().lastGeneration,
              finishedAt: '2026-08-08T07:59:07.000Z',
            },
          }),
      },
    ],
    [
      'generated timestamp after the report update',
      'proof_read',
      {
        generate: () =>
          json({
            report: { ...GENERATED_REPORT, generatedAt: '2026-08-08T07:59:07.000Z' },
            debug: {
              systemPrompt: RAW_PROMPT,
              userPrompt: RAW_PROMPT,
              rawText: RAW_RESPONSE,
              model: 'gpt-5.4',
              vendor: 'openai',
            },
          }),
      },
    ],
  ] as const)('fails closed on %s', async (_label, phase, overrides) => {
    const fetchImpl = fetchSequence({ overrides });

    const result = await runAdminReportGenerateDiagnostic(runnerOptions(fetchImpl));

    expect(result).toMatchObject({
      status: 'fail',
      phase,
      reason: 'invalid_response',
      cleanup: 'succeeded',
    });
    expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE);
  });

  it('treats missing or duplicate allowlisted limit buckets as unavailable', async () => {
    const duplicateReportGenerate = [
      ...LIMIT_BUCKETS.filter((bucket) => bucket.kind !== 'ai_output_tokens'),
      LIMIT_BUCKETS[0]!,
    ];
    const fetchImpl = fetchSequence({
      overrides: {
        limits: () => json({ plan: 'free', buckets: duplicateReportGenerate }),
      },
    });

    const result = await runAdminReportGenerateDiagnostic(runnerOptions(fetchImpl));

    expect(result).toMatchObject({
      status: 'warning',
      limits: null,
      cleanup: 'succeeded',
      warnings: ['limits_unavailable'],
    });
  });

  it('maps network errors to a redacted upstream failure and does not retry', async () => {
    const networkSecret = 'postgres://secret:password@private.invalid/database';
    const fetchImpl = fetchSequence({
      overrides: {
        generate: () => Promise.reject(new Error(networkSecret)),
      },
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runAdminReportGenerateDiagnostic(runnerOptions(fetchImpl));

    expect(result).toMatchObject({
      status: 'fail',
      phase: 'generate',
      reason: 'upstream_unavailable',
      cleanup: 'succeeded',
    });
    expect(
      fetchImpl.mock.calls.filter(([request]) => stepOf(urlOf(request)) === 'generate'),
    ).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(networkSecret);
    expect(stringifiedConsole([errors, warnings, logs])).not.toContain(networkSecret);
  });

  it('fails limits/timeout when the overall deadline aborts limit readback', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let limitsSignal: AbortSignal | undefined;
    let cleanupSignal: AbortSignal | undefined;
    const fetchImpl = fetchSequence({
      overrides: {
        limits: (_url, init) => {
          const signal = init?.signal;
          if (!(signal instanceof AbortSignal)) throw new Error('missing signal');
          limitsSignal = signal;
          return new Promise<Response>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('aborted', 'AbortError')),
              { once: true },
            );
          });
        },
        signOut: (_url, init) => {
          const signal = init?.signal;
          if (!(signal instanceof AbortSignal)) throw new Error('missing signal');
          cleanupSignal = signal;
          return signal.aborted
            ? Promise.reject(new DOMException('aborted', 'AbortError'))
            : Promise.resolve(json({ success: true }));
        },
      },
    });

    const pending = runAdminReportGenerateDiagnostic({
      ...runnerOptions(fetchImpl),
      now: () => new Date(Date.now()),
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);
    const result = await pending;

    expect(result).toMatchObject({
      observedAt: NOW.toISOString(),
      status: 'fail',
      durationMs: 25,
      phase: 'limits',
      reason: 'timeout',
      cleanup: 'succeeded',
    });
    expect(limitsSignal?.aborted).toBe(true);
    expect(cleanupSignal?.aborted).toBe(false);
    expect(cleanupSignal).not.toBe(limitsSignal);
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'generate',
      'proofRead',
      'limits',
      'signOut',
    ]);
  });

  it('uses fresh bounded cleanup grace after the main deadline and never retries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let mainAbortEvents = 0;
    let cleanupAbortEvents = 0;
    const signals: AbortSignal[] = [];
    const fetchImpl = fetchSequence({
      overrides: {
        generate: (_url, init) => {
          const signal = init?.signal;
          if (!(signal instanceof AbortSignal)) throw new Error('missing signal');
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
          if (!(signal instanceof AbortSignal)) throw new Error('missing signal');
          signals.push(signal);
          if (signal.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'));
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

    const pending = runAdminReportGenerateDiagnostic({
      ...runnerOptions(fetchImpl),
      now: () => new Date(Date.now()),
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(cleanupAbortEvents).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result).toMatchObject({
      observedAt: NOW.toISOString(),
      status: 'fail',
      durationMs: 5_025,
      phase: 'generate',
      reason: 'timeout',
      cleanup: 'failed',
    });
    expect(mainAbortEvents).toBe(1);
    expect(cleanupAbortEvents).toBe(1);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(true);
    expect(new Set(signals).size).toBe(2);
    expect(fetchImpl.mock.calls.map(([request]) => stepOf(urlOf(request)))).toEqual([
      'signIn',
      'targetRead',
      'generate',
      'signOut',
    ]);
  });

  it('never returns or logs credentials, prompts, notes, or provider content on success', async () => {
    const fetchImpl = fetchSequence();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runAdminReportGenerateDiagnostic(runnerOptions(fetchImpl));
    const serialized = JSON.stringify(result);
    const consoleOutput = stringifiedConsole([errors, warnings, logs]);

    for (const secret of [ACCOUNT_PASSWORD, TOKEN, RAW_PROMPT, RAW_NOTE, RAW_RESPONSE]) {
      expect(serialized).not.toContain(secret);
      expect(consoleOutput).not.toContain(secret);
    }
  });
});
