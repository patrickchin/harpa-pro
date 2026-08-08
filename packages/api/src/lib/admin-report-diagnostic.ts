import { operations, reports, usageLimits } from '@harpa/api-contract';
import type {
  ReportGenerateDiagnosticFailureReason,
  ReportGenerateDiagnosticObservation,
  ReportGenerateDiagnosticPhase,
  ReportGenerateDiagnosticWarning,
} from '@harpa/api-contract';
import { z } from 'zod';
import { env } from '../env.js';

const DEFAULT_TIMEOUT_MS = 75_000;
const CLEANUP_GRACE_MS = 5_000;
const IDEMPOTENCY_PREFIX = 'admin-report-diagnostic';

const token = z.string().min(16).max(2_048).regex(new RegExp('^[A-Za-z0-9._~+/-]+={0,2}$'));
const requestId = z
  .string()
  .min(6)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
const providerIdentifier = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:/-]+$/);

const strictReport = reports.report.strict();
const generateResponse = z
  .object({
    report: strictReport,
    debug: z
      .object({
        systemPrompt: z.string(),
        userPrompt: z.string(),
        rawText: z.string(),
        model: providerIdentifier,
        vendor: providerIdentifier,
      })
      .strict(),
  })
  .strict();
const debugResponse = z
  .object({
    prompt: z.object({ system: z.string(), user: z.string() }).strict(),
    notes: z.array(reports.reportDebugNote.strict()),
    lastGeneration: reports.reportLastGeneration.strict().nullable(),
  })
  .strict();
const strictLimitState = usageLimits.limitState.strict();
const limitsResponse = z
  .object({
    plan: usageLimits.plan,
    buckets: z.array(strictLimitState).max(10),
  })
  .strict();
const usageLimitError = z
  .object({
    error: z
      .object({
        code: z.literal('usage_limit_exceeded'),
        message: z.string(),
        details: usageLimits.limitExceededDetails.strict(),
      })
      .strict(),
    requestId: z.string().optional(),
  })
  .strict();

export interface AdminReportDiagnosticConfiguration {
  baseUrl: string;
  email: string;
  password: string;
  projectId: string;
  reportNumber: number;
}

export interface AdminReportDiagnosticOptions {
  /** Omit to use the boot-validated environment; null forces disabled mode in tests. */
  configuration?: AdminReportDiagnosticConfiguration | null;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

type SuccessfulRun = Extract<ReportGenerateDiagnosticObservation, { status: 'pass' | 'warning' }>;
type SuccessfulCore = Pick<SuccessfulRun, 'target' | 'generation' | 'limits'>;
type Cleanup = 'not_started' | 'succeeded' | 'failed';

class DiagnosticFailure extends Error {
  constructor(
    readonly phase: ReportGenerateDiagnosticPhase,
    readonly reason: ReportGenerateDiagnosticFailureReason,
  ) {
    super(reason);
    this.name = 'DiagnosticFailure';
  }
}

/**
 * Exercise the real application HTTP route with one fixed synthetic target.
 * The function returns only contract-reviewed metadata and never logs or
 * returns credentials, prompts, notes, response bodies, or arbitrary errors.
 */
export async function runAdminReportGenerateDiagnostic(
  options: AdminReportDiagnosticOptions = {},
): Promise<ReportGenerateDiagnosticObservation> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const observedAt = startedAt.toISOString();
  const configuration = resolveConfiguration(options.configuration);

  if (configuration === null) {
    return validateObservation({ observedAt, status: 'unknown', reason: 'not_configured' });
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), normalizedTimeout(options.timeoutMs));
  let phase: ReportGenerateDiagnosticPhase = 'sign_in';
  let bearerToken: string | null = null;
  let cleanup: Cleanup = 'not_started';
  let failure: DiagnosticFailure | null = null;
  let success: SuccessfulCore | null = null;

  try {
    bearerToken = await signIn(configuration, fetchImpl, controller.signal);

    phase = 'target_read';
    const targetReport = await readTarget(configuration, bearerToken, fetchImpl, controller.signal);

    phase = 'generate';
    const generated = await generate(
      configuration,
      bearerToken,
      targetReport.updatedAt,
      fetchImpl,
      controller.signal,
      now,
    );

    phase = 'proof_read';
    const generation = await readProof(
      configuration,
      bearerToken,
      generated,
      fetchImpl,
      controller.signal,
    );

    phase = 'limits';
    const limits = await readLimits(bearerToken, configuration, fetchImpl, controller.signal);
    success = {
      target: {
        accountEmail: configuration.email,
        projectId: configuration.projectId,
        reportId: generated.report.id,
        reportNumber: configuration.reportNumber,
      },
      generation,
      limits,
    };
  } catch (error) {
    failure =
      error instanceof DiagnosticFailure
        ? error
        : new DiagnosticFailure(
            phase,
            controller.signal.aborted ? 'timeout' : 'upstream_unavailable',
          );
  } finally {
    if (bearerToken !== null) {
      cleanup = await cleanupSession(configuration, bearerToken, fetchImpl, controller.signal);
    }
    clearTimeout(deadline);
  }

  const durationMs = elapsedMs(startedAt, now());
  if (failure !== null) {
    return validateObservation({
      observedAt,
      status: 'fail',
      durationMs,
      phase: failure.phase,
      reason: failure.reason,
      cleanup,
    });
  }

  if (success === null) {
    return validateObservation({
      observedAt,
      status: 'fail',
      durationMs,
      phase,
      reason: 'invalid_response',
      cleanup,
    });
  }

  const warnings: ReportGenerateDiagnosticWarning[] = [];
  if (success.generation.fixtureMode !== 'live' || success.generation.idempotentReplay) {
    warnings.push('replay_only');
  }
  if (success.limits === null) warnings.push('limits_unavailable');
  if (cleanup === 'failed') warnings.push('sign_out_failed');

  if (warnings.length > 0) {
    return validateObservation({
      observedAt,
      status: 'warning',
      durationMs,
      ...success,
      cleanup,
      warnings,
    });
  }

  return validateObservation({
    observedAt,
    status: 'pass',
    durationMs,
    ...success,
    cleanup,
  });
}

function resolveConfiguration(
  explicit: AdminReportDiagnosticConfiguration | null | undefined,
): AdminReportDiagnosticConfiguration | null {
  if (explicit !== undefined) return explicit;

  const email = env.ADMIN_REPORT_DIAGNOSTIC_EMAIL;
  const projectId = env.ADMIN_REPORT_DIAGNOSTIC_PROJECT_ID;
  const reportNumber = env.ADMIN_REPORT_DIAGNOSTIC_REPORT_NUMBER;
  const password = env.TEST_ACCOUNT_PASSWORD;
  if (!email || !projectId || reportNumber === undefined || !password) return null;

  return {
    baseUrl: env.BETTER_AUTH_URL,
    email,
    password,
    projectId,
    reportNumber,
  };
}

async function signIn(
  configuration: AdminReportDiagnosticConfiguration,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<string> {
  const response = await request(
    fetchImpl,
    endpoint(configuration.baseUrl, '/api/auth/sign-in/email'),
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: configuration.email, password: configuration.password }),
      signal,
      redirect: 'error',
    },
    'sign_in',
  );
  if (!response.ok) throw new DiagnosticFailure('sign_in', await statusReason(response, 'sign_in'));

  const parsedToken = token.safeParse(response.headers.get('set-auth-token'));
  if (!parsedToken.success) throw new DiagnosticFailure('sign_in', 'invalid_response');
  return parsedToken.data;
}

async function readTarget(
  configuration: AdminReportDiagnosticConfiguration,
  bearerToken: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<z.infer<typeof strictReport>> {
  const response = await request(
    fetchImpl,
    reportEndpoint(configuration),
    getInit(bearerToken, signal),
    'target_read',
  );
  if (!response.ok) {
    throw new DiagnosticFailure('target_read', await statusReason(response, 'target_read'));
  }

  const report = await parseJson(response, strictReport, 'target_read', signal);
  if (
    report.id.length === 0 ||
    report.projectId !== configuration.projectId ||
    report.number !== configuration.reportNumber
  ) {
    throw new DiagnosticFailure('target_read', 'invalid_response');
  }
  if (report.status !== 'draft') throw new DiagnosticFailure('target_read', 'target_not_draft');
  return report;
}

interface GeneratedResponse {
  report: z.infer<typeof strictReport>;
  debug: z.infer<typeof generateResponse>['debug'];
  httpStatus: 200;
  requestId: string | null;
  durationMs: number;
  idempotentReplay: boolean;
}

async function generate(
  configuration: AdminReportDiagnosticConfiguration,
  bearerToken: string,
  expectedUpdatedAt: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  now: () => Date,
): Promise<GeneratedResponse> {
  const startedAt = now();
  const response = await request(
    fetchImpl,
    endpoint(configuration.baseUrl, `${reportPath(configuration)}/generate`),
    {
      method: 'POST',
      headers: {
        ...jsonHeaders(),
        authorization: `Bearer ${bearerToken}`,
        'idempotency-key': `${IDEMPOTENCY_PREFIX}:${configuration.projectId}:${configuration.reportNumber}:${expectedUpdatedAt}`,
      },
      body: JSON.stringify({ expectedUpdatedAt }),
      signal,
      redirect: 'error',
    },
    'generate',
  );
  if (!response.ok)
    throw new DiagnosticFailure('generate', await statusReason(response, 'generate'));

  const body = await parseJson(response, generateResponse, 'generate', signal);
  if (
    body.report.id.length === 0 ||
    body.report.projectId !== configuration.projectId ||
    body.report.number !== configuration.reportNumber ||
    body.report.status !== 'draft' ||
    body.report.generatedAt === null
  ) {
    throw new DiagnosticFailure('generate', 'invalid_response');
  }

  const replayHeader = response.headers.get('idempotent-replay');
  if (replayHeader !== null && replayHeader !== 'true') {
    throw new DiagnosticFailure('generate', 'invalid_response');
  }
  const rawRequestId = response.headers.get('x-request-id');
  const parsedRequestId = rawRequestId === null ? null : requestId.safeParse(rawRequestId);
  if (parsedRequestId !== null && !parsedRequestId.success) {
    throw new DiagnosticFailure('generate', 'invalid_response');
  }

  return {
    report: body.report,
    debug: body.debug,
    httpStatus: 200,
    requestId: parsedRequestId === null ? null : parsedRequestId.data,
    durationMs: elapsedMs(startedAt, now()),
    idempotentReplay: replayHeader === 'true',
  };
}

async function readProof(
  configuration: AdminReportDiagnosticConfiguration,
  bearerToken: string,
  generated: GeneratedResponse,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<SuccessfulRun['generation']> {
  const response = await request(
    fetchImpl,
    endpoint(configuration.baseUrl, `${reportPath(configuration)}/debug`),
    getInit(bearerToken, signal),
    'proof_read',
  );
  if (!response.ok) {
    throw new DiagnosticFailure('proof_read', await statusReason(response, 'proof_read'));
  }

  const proof = await parseJson(response, debugResponse, 'proof_read', signal);
  const persisted = proof.lastGeneration;
  if (
    generated.report.generatedAt === null ||
    persisted === null ||
    persisted.finishedAt === null ||
    (persisted.fixtureMode !== 'live' && persisted.fixtureMode !== 'replay') ||
    persisted.vendor !== generated.debug.vendor ||
    persisted.model !== generated.debug.model ||
    persisted.systemPrompt !== generated.debug.systemPrompt ||
    persisted.userPrompt !== generated.debug.userPrompt ||
    persisted.response !== generated.debug.rawText ||
    Date.parse(persisted.finishedAt) < Date.parse(persisted.requestedAt) ||
    Date.parse(persisted.finishedAt) > Date.parse(generated.report.updatedAt) ||
    Date.parse(generated.report.generatedAt) > Date.parse(generated.report.updatedAt)
  ) {
    throw new DiagnosticFailure('proof_read', 'invalid_response');
  }

  const parsedVendor = providerIdentifier.safeParse(persisted.vendor);
  const parsedModel = providerIdentifier.safeParse(persisted.model);
  if (!parsedVendor.success || !parsedModel.success) {
    throw new DiagnosticFailure('proof_read', 'invalid_response');
  }

  return {
    httpStatus: generated.httpStatus,
    requestId: generated.requestId,
    durationMs: generated.durationMs,
    requestedAt: persisted.requestedAt,
    finishedAt: persisted.finishedAt,
    reportUpdatedAt: generated.report.updatedAt,
    generatedAt: generated.report.generatedAt,
    vendor: parsedVendor.data,
    model: parsedModel.data,
    fixtureMode: persisted.fixtureMode,
    idempotentReplay: generated.idempotentReplay,
  };
}

async function readLimits(
  bearerToken: string,
  configuration: AdminReportDiagnosticConfiguration,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<SuccessfulRun['limits']> {
  try {
    const response = await request(
      fetchImpl,
      endpoint(configuration.baseUrl, '/me/limits'),
      getInit(bearerToken, signal),
      'limits',
    );
    if (signal.aborted) throw new DiagnosticFailure('limits', 'timeout');
    if (!response.ok) return null;
    const parsed = await parseJson(response, limitsResponse, 'limits', signal);
    if (signal.aborted) throw new DiagnosticFailure('limits', 'timeout');
    const reportGenerate = oneBucket(parsed.buckets, 'report_generate', parsed.plan);
    const aiInputTokens = oneBucket(parsed.buckets, 'ai_input_tokens', parsed.plan);
    const aiOutputTokens = oneBucket(parsed.buckets, 'ai_output_tokens', parsed.plan);
    if (!reportGenerate || !aiInputTokens || !aiOutputTokens) return null;

    return {
      plan: parsed.plan,
      reportGenerate: summarizeBucket(reportGenerate),
      aiInputTokens: summarizeBucket(aiInputTokens),
      aiOutputTokens: summarizeBucket(aiOutputTokens),
    };
  } catch (error) {
    if (signal.aborted || (error instanceof DiagnosticFailure && error.reason === 'timeout')) {
      throw new DiagnosticFailure('limits', 'timeout');
    }
    return null;
  }
}

async function cleanupSession(
  configuration: AdminReportDiagnosticConfiguration,
  bearerToken: string,
  fetchImpl: typeof fetch,
  mainSignal: AbortSignal,
): Promise<'succeeded' | 'failed'> {
  if (!mainSignal.aborted) return signOut(configuration, bearerToken, fetchImpl, mainSignal);

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), CLEANUP_GRACE_MS);
  try {
    return await signOut(configuration, bearerToken, fetchImpl, controller.signal);
  } finally {
    clearTimeout(deadline);
  }
}

async function signOut(
  configuration: AdminReportDiagnosticConfiguration,
  bearerToken: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<'succeeded' | 'failed'> {
  try {
    const response = await fetchImpl(endpoint(configuration.baseUrl, '/api/auth/sign-out'), {
      method: 'POST',
      headers: { ...jsonHeaders(), authorization: `Bearer ${bearerToken}` },
      body: JSON.stringify({}),
      signal,
      redirect: 'error',
    });
    return response.ok ? 'succeeded' : 'failed';
  } catch {
    return 'failed';
  }
}

async function request(
  fetchImpl: typeof fetch,
  url: URL,
  init: RequestInit,
  phase: ReportGenerateDiagnosticPhase,
): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    throw new DiagnosticFailure(
      phase,
      isAbort(error, init.signal) ? 'timeout' : 'upstream_unavailable',
    );
  }
}

async function parseJson<T extends z.ZodTypeAny>(
  response: Response,
  schema: T,
  phase: ReportGenerateDiagnosticPhase,
  signal: AbortSignal,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new DiagnosticFailure(phase, isAbort(error, signal) ? 'timeout' : 'invalid_response');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new DiagnosticFailure(phase, 'invalid_response');
  return parsed.data;
}

async function statusReason(
  response: Response,
  phase: ReportGenerateDiagnosticPhase,
): Promise<ReportGenerateDiagnosticFailureReason> {
  const status = response.status;
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (phase === 'sign_in') {
    return status >= 500 ? 'upstream_unavailable' : 'sign_in_failed';
  }
  if (phase === 'target_read' || phase === 'proof_read') {
    if (status === 404) return 'target_not_found';
    return status >= 500 ? 'upstream_unavailable' : 'invalid_response';
  }
  if (phase === 'generate') {
    if (status === 409) return 'conflict';
    if (status === 502) return 'provider_error';
    if (status === 403 && (await isReportGenerateLimitError(response))) {
      return 'usage_limit_exceeded';
    }
    return status >= 500 ? 'upstream_unavailable' : 'invalid_response';
  }
  return 'upstream_unavailable';
}

async function isReportGenerateLimitError(response: Response): Promise<boolean> {
  try {
    const parsed = usageLimitError.safeParse(await response.json());
    return parsed.success && parsed.data.error.details.kind === 'report_generate';
  } catch {
    return false;
  }
}

function oneBucket(
  buckets: z.infer<typeof strictLimitState>[],
  kind: z.infer<typeof usageLimits.limitKind>,
  plan: z.infer<typeof usageLimits.plan>,
): z.infer<typeof strictLimitState> | null {
  const matches = buckets.filter((bucket) => bucket.kind === kind);
  if (matches.length !== 1 || matches[0]!.plan !== plan) return null;
  return matches[0]!;
}

function summarizeBucket(bucket: z.infer<typeof strictLimitState>) {
  return {
    limit: bucket.limit,
    used: bucket.used,
    remaining: bucket.remaining,
    resetAt: bucket.resetAt,
    overridden: bucket.overridden,
  };
}

function getInit(bearerToken: string, signal: AbortSignal): RequestInit {
  return {
    method: 'GET',
    headers: { accept: 'application/json', authorization: `Bearer ${bearerToken}` },
    signal,
    redirect: 'error',
  };
}

function jsonHeaders(): Record<string, string> {
  return { accept: 'application/json', 'content-type': 'application/json' };
}

function reportEndpoint(configuration: AdminReportDiagnosticConfiguration): URL {
  return endpoint(configuration.baseUrl, reportPath(configuration));
}

function reportPath(configuration: AdminReportDiagnosticConfiguration): string {
  return `/projects/${encodeURIComponent(configuration.projectId)}/reports/${configuration.reportNumber}`;
}

function endpoint(baseUrl: string, path: string): URL {
  const origin = new URL(baseUrl).origin;
  return new URL(path, origin);
}

function normalizedTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TIMEOUT_MS;
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.min(DEFAULT_TIMEOUT_MS, Math.floor(timeoutMs))
    : DEFAULT_TIMEOUT_MS;
}

function elapsedMs(start: Date, end: Date): number {
  return Math.min(DEFAULT_TIMEOUT_MS, Math.max(0, Math.round(end.getTime() - start.getTime())));
}

function isAbort(error: unknown, signal: AbortSignal | null | undefined): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === 'AbortError');
}

function validateObservation(observation: unknown): ReportGenerateDiagnosticObservation {
  return operations.reportGenerateDiagnosticObservation.parse(observation);
}
