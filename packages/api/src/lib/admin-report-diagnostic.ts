import { createHash } from 'node:crypto';
import {
  email,
  errorEnvelope,
  isoDateTime,
  operations,
  reports,
  usageLimits,
  userId,
} from '@harpa/api-contract';
import type {
  ReportGenerateDiagnosticFailureReason,
  ReportGenerateDiagnosticObservation,
  ReportGenerateDiagnosticPhase,
  ReportGenerateDiagnosticWarning,
} from '@harpa/api-contract';
import { z } from 'zod';
import { getPool } from '../db/client.js';
import { env } from '../env.js';

const DEFAULT_TIMEOUT_MS = 75_000;
const CLEANUP_GRACE_MS = 5_000;
const MAX_OBSERVATION_DURATION_MS = DEFAULT_TIMEOUT_MS + CLEANUP_GRACE_MS;
const MAX_PREVIEW_CODE_POINTS = 400;
const MAX_PREVIEW_ITEMS = 5;
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
const generatedReport = strictReport
  .omit({ body: true })
  .extend({ body: z.unknown().nullable() })
  .strict();
const generateResponse = z
  .object({
    report: generatedReport,
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
const signInResponse = z
  .object({
    redirect: z.literal(false),
    token,
    user: z
      .object({
        id: userId,
        email,
        name: z.string().min(1),
        emailVerified: z.boolean(),
        image: z.string().nullable(),
        createdAt: isoDateTime,
        updatedAt: isoDateTime,
        displayName: z.string().nullable().optional(),
        companyName: z.string().nullable().optional(),
        isAdmin: z.boolean().optional(),
        plan: usageLimits.plan.optional(),
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
const usageLimitError = errorEnvelope
  .extend({
    error: errorEnvelope.shape.error
      .extend({
        code: z.literal('usage_limit_exceeded'),
        details: usageLimits.limitExceededDetails.strict(),
      })
      .strict(),
    requestId,
  })
  .strict();
const databaseClockRow = z.object({ lower_bound: z.union([isoDateTime, z.date()]) }).strict();
const liveUsageRow = z.object({
  vendor: providerIdentifier,
  model: providerIdentifier,
  input_tokens: z.string(),
  output_tokens: z.string(),
  cached_tokens: z.string(),
  latency_ms: z.string(),
  fixture_mode: z.literal('live'),
  status: z.literal('ok'),
});

export interface EnabledAdminReportDiagnosticConfiguration {
  enabled: true;
  baseUrl: string;
  email: string;
  password: string;
  projectId: string;
  reportNumber: number;
}

export type AdminReportDiagnosticConfiguration =
  { enabled: false } | EnabledAdminReportDiagnosticConfiguration;

type ApplicationDatabaseRow = Record<string, unknown>;
type QueryApplicationDb = (
  text: string,
  values: readonly unknown[],
  signal: AbortSignal,
) => Promise<{ rows: readonly ApplicationDatabaseRow[] }>;

export interface AdminReportDiagnosticOptions {
  /** Omit to use the boot-validated environment; null forces disabled mode in tests. */
  configuration?: AdminReportDiagnosticConfiguration | null;
  fetchImpl?: typeof fetch;
  queryApplicationDb?: QueryApplicationDb;
  now?: () => Date;
  timeoutMs?: number;
}

type SuccessfulRun = Extract<ReportGenerateDiagnosticObservation, { status: 'pass' | 'warning' }>;
type SuccessfulCore = Pick<SuccessfulRun, 'target' | 'generation' | 'preview' | 'usage' | 'limits'>;
type Cleanup = 'not_started' | 'succeeded' | 'failed';
type GeneratedReportBody = z.infer<typeof reports.reportBody>;

const DATABASE_CLOCK_SQL = 'SELECT clock_timestamp() AS lower_bound';
const LIVE_USAGE_SQL = `
  WITH observation_window AS (
    SELECT clock_timestamp() AS upper_bound
  )
  SELECT
    event.vendor,
    event.model,
    event.input_tokens::text AS input_tokens,
    event.output_tokens::text AS output_tokens,
    event.cached_tokens::text AS cached_tokens,
    event.latency_ms::text AS latency_ms,
    event.fixture_mode,
    event.status
  FROM app.llm_usage_events AS event
  CROSS JOIN observation_window
  WHERE event.user_id = $1
    AND event.project_id = $2
    AND event.report_id = $3
    AND event.operation = 'generate_report'
    AND event.created_at > $4
    AND event.created_at <= observation_window.upper_bound
    AND event.vendor = $5
    AND event.model = $6
  LIMIT 2
`;

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
  if (!configuration.enabled) {
    return validateObservation({ observedAt, status: 'unknown', reason: 'not_enabled' });
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const queryApplicationDb = options.queryApplicationDb ?? defaultQueryApplicationDb;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), normalizedTimeout(options.timeoutMs));
  let phase: ReportGenerateDiagnosticPhase = 'sign_in';
  let bearerToken: string | null = null;
  let cleanup: Cleanup = 'not_started';
  let failure: DiagnosticFailure | null = null;
  let success: SuccessfulCore | null = null;

  try {
    const signedIn = await signIn(configuration, fetchImpl, controller.signal, (capturedToken) => {
      bearerToken = capturedToken;
    });
    bearerToken = signedIn.bearerToken;

    phase = 'target_read';
    const targetReport = await readTarget(configuration, bearerToken, fetchImpl, controller.signal);

    phase = 'usage_window';
    const databaseLowerBound = await readDatabaseLowerBound(queryApplicationDb, controller.signal);

    phase = 'generate';
    const generated = await generate(
      configuration,
      bearerToken,
      targetReport.id,
      targetReport.updatedAt,
      fetchImpl,
      controller.signal,
      now,
    );

    if (generated.idempotentReplay) {
      throw new DiagnosticFailure('mode_gate', 'live_proof_failed');
    }

    phase = 'proof_read';
    const generation = await readProof(
      configuration,
      bearerToken,
      generated,
      fetchImpl,
      controller.signal,
    );

    phase = 'usage_proof';
    const usage = await readUsageProof(
      queryApplicationDb,
      controller.signal,
      signedIn.userId,
      configuration,
      generated.report.id,
      databaseLowerBound,
      generation.vendor,
      generation.model,
    );

    phase = 'preview';
    const preview = buildPreview(generated.report.body);

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
      preview,
      usage,
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
    clearTimeout(deadline);
    if (bearerToken !== null) {
      cleanup = await cleanupSession(configuration, bearerToken, fetchImpl);
    }
  }

  const durationMs = elapsedObservationMs(startedAt, now());
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

  if (env.ADMIN_REPORT_LIVE_CANARY_ENABLED !== '1') return { enabled: false };

  const email = env.ADMIN_REPORT_DIAGNOSTIC_EMAIL;
  const projectId = env.ADMIN_REPORT_DIAGNOSTIC_PROJECT_ID;
  const reportNumber = env.ADMIN_REPORT_DIAGNOSTIC_REPORT_NUMBER;
  const password = env.TEST_ACCOUNT_PASSWORD;
  if (!email || !projectId || reportNumber === undefined || !password) return null;

  return {
    enabled: true,
    baseUrl: env.BETTER_AUTH_URL,
    email,
    password,
    projectId,
    reportNumber,
  };
}

async function signIn(
  configuration: EnabledAdminReportDiagnosticConfiguration,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  captureToken: (bearerToken: string) => void,
): Promise<{ bearerToken: string; userId: string }> {
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
  captureToken(parsedToken.data);

  const body = await parseJson(response, signInResponse, 'sign_in', signal);
  if (body.token !== parsedToken.data || body.user.email !== configuration.email) {
    throw new DiagnosticFailure('sign_in', 'invalid_response');
  }
  return { bearerToken: parsedToken.data, userId: body.user.id };
}

async function readTarget(
  configuration: EnabledAdminReportDiagnosticConfiguration,
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
  report: z.infer<typeof generatedReport>;
  debug: z.infer<typeof generateResponse>['debug'];
  httpStatus: 200;
  requestId: string | null;
  durationMs: number;
  idempotentReplay: boolean;
}

async function generate(
  configuration: EnabledAdminReportDiagnosticConfiguration,
  bearerToken: string,
  expectedReportId: string,
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
    body.report.id !== expectedReportId ||
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
  configuration: EnabledAdminReportDiagnosticConfiguration,
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
  if (persisted === null) {
    throw new DiagnosticFailure('proof_read', 'live_proof_failed');
  }
  if (persisted.fixtureMode !== 'live') {
    throw new DiagnosticFailure('mode_gate', 'live_mode_required');
  }
  if (
    generated.report.generatedAt === null ||
    persisted.finishedAt === null ||
    persisted.vendor !== generated.debug.vendor ||
    persisted.model !== generated.debug.model ||
    persisted.systemPrompt !== generated.debug.systemPrompt ||
    persisted.userPrompt !== generated.debug.userPrompt ||
    persisted.response !== generated.debug.rawText ||
    Date.parse(persisted.finishedAt) < Date.parse(persisted.requestedAt) ||
    Date.parse(persisted.finishedAt) > Date.parse(generated.report.updatedAt) ||
    Date.parse(generated.report.generatedAt) > Date.parse(persisted.requestedAt)
  ) {
    throw new DiagnosticFailure('proof_read', 'live_proof_failed');
  }

  const parsedVendor = providerIdentifier.safeParse(persisted.vendor);
  const parsedModel = providerIdentifier.safeParse(persisted.model);
  if (!parsedVendor.success || !parsedModel.success) {
    throw new DiagnosticFailure('proof_read', 'live_proof_failed');
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
    idempotentReplay: false,
  };
}

async function readDatabaseLowerBound(
  queryApplicationDb: QueryApplicationDb,
  signal: AbortSignal,
): Promise<string> {
  let result: { rows: readonly ApplicationDatabaseRow[] };
  try {
    result = await queryDatabase(queryApplicationDb, DATABASE_CLOCK_SQL, [], signal);
  } catch (error) {
    throw new DiagnosticFailure(
      'usage_window',
      isAbort(error, signal) ? 'timeout' : 'upstream_unavailable',
    );
  }

  if (result.rows.length !== 1) {
    throw new DiagnosticFailure('usage_window', 'invalid_response');
  }
  const parsed = databaseClockRow.safeParse(result.rows[0]);
  if (!parsed.success) throw new DiagnosticFailure('usage_window', 'invalid_response');
  return parsed.data.lower_bound instanceof Date
    ? parsed.data.lower_bound.toISOString()
    : parsed.data.lower_bound;
}

async function readUsageProof(
  queryApplicationDb: QueryApplicationDb,
  signal: AbortSignal,
  signedInUserId: string,
  configuration: EnabledAdminReportDiagnosticConfiguration,
  reportId: string,
  databaseLowerBound: string,
  vendor: string,
  model: string,
): Promise<SuccessfulRun['usage']> {
  let result: { rows: readonly ApplicationDatabaseRow[] };
  try {
    result = await queryDatabase(
      queryApplicationDb,
      LIVE_USAGE_SQL,
      [signedInUserId, configuration.projectId, reportId, databaseLowerBound, vendor, model],
      signal,
    );
  } catch (error) {
    throw new DiagnosticFailure(
      'usage_proof',
      isAbort(error, signal) ? 'timeout' : 'upstream_unavailable',
    );
  }

  if (result.rows.length === 0) {
    throw new DiagnosticFailure('usage_proof', 'usage_proof_missing');
  }
  if (result.rows.length !== 1) {
    throw new DiagnosticFailure('usage_proof', 'usage_proof_ambiguous');
  }

  const parsed = liveUsageRow.safeParse(result.rows[0]);
  if (!parsed.success || parsed.data.vendor !== vendor || parsed.data.model !== model) {
    throw new DiagnosticFailure('usage_proof', 'live_proof_failed');
  }
  const inputTokens = safeIntegerFromDatabase(parsed.data.input_tokens);
  const outputTokens = safeIntegerFromDatabase(parsed.data.output_tokens);
  const cachedTokens = safeIntegerFromDatabase(parsed.data.cached_tokens);
  const latencyMs = safeIntegerFromDatabase(parsed.data.latency_ms);
  if (
    inputTokens === null ||
    outputTokens === null ||
    cachedTokens === null ||
    latencyMs === null ||
    inputTokens + outputTokens > Number.MAX_SAFE_INTEGER ||
    inputTokens + outputTokens === 0 ||
    cachedTokens > inputTokens ||
    latencyMs > DEFAULT_TIMEOUT_MS
  ) {
    throw new DiagnosticFailure('usage_proof', 'live_proof_failed');
  }

  return { inputTokens, outputTokens, cachedTokens, latencyMs, matched: true };
}

function buildPreview(body: unknown): SuccessfulRun['preview'] {
  const parsed = reports.reportBody.safeParse(body);
  if (!parsed.success) throw new DiagnosticFailure('preview', 'preview_invalid');

  const reportBody = parsed.data;
  const clipping = { occurred: false };
  const imageAttachments = countAttachments(reportBody, 'images');
  const documentAttachments = countAttachments(reportBody, 'documents');
  const hasOmittedArrays =
    reportBody.workers.length > MAX_PREVIEW_ITEMS ||
    reportBody.materials.length > MAX_PREVIEW_ITEMS ||
    reportBody.issues.length > MAX_PREVIEW_ITEMS ||
    reportBody.nextSteps.length > MAX_PREVIEW_ITEMS ||
    reportBody.summarySections.length > MAX_PREVIEW_ITEMS;

  const sample = {
    title: clipNullableText(reportBody.meta.title, clipping),
    summary: clipNullableText(reportBody.meta.summary, clipping),
    weather:
      reportBody.weather === null
        ? null
        : {
            condition: clipNullableText(reportBody.weather.condition, clipping),
            temperature: clipNullableText(reportBody.weather.temperature, clipping),
            wind: clipNullableText(reportBody.weather.wind, clipping),
            impact: clipNullableText(reportBody.weather.impact, clipping),
          },
    workers: reportBody.workers.slice(0, MAX_PREVIEW_ITEMS).map((worker) => ({
      role: clipText(worker.role, clipping),
      count: clipNullableText(worker.count, clipping),
      hours: clipNullableText(worker.hours, clipping),
      notes: clipNullableText(worker.notes, clipping),
    })),
    materials: reportBody.materials.slice(0, MAX_PREVIEW_ITEMS).map((material) => ({
      name: clipText(material.name, clipping),
      quantity: clipNullableText(material.quantity, clipping),
      unit: clipNullableText(material.unit, clipping),
      status: clipNullableText(material.status, clipping),
      condition: clipNullableText(material.condition, clipping),
      notes: clipNullableText(material.notes, clipping),
    })),
    issues: reportBody.issues.slice(0, MAX_PREVIEW_ITEMS).map((issue) => ({
      title: clipText(issue.title, clipping),
      severity: clipNullableText(issue.severity, clipping),
      description: clipNullableText(issue.description, clipping),
      action: clipNullableText(issue.action, clipping),
    })),
    nextSteps: reportBody.nextSteps
      .slice(0, MAX_PREVIEW_ITEMS)
      .map((step) => clipText(step, clipping)),
    summarySections: reportBody.summarySections.slice(0, MAX_PREVIEW_ITEMS).map((section) => ({
      title: clipText(section.title, clipping),
      body: clipText(section.body, clipping),
    })),
  };

  return {
    schemaValid: true,
    sample,
    counts: {
      workers: reportBody.workers.length,
      materials: reportBody.materials.length,
      issues: reportBody.issues.length,
      nextSteps: reportBody.nextSteps.length,
      summarySections: reportBody.summarySections.length,
      imageAttachments,
      documentAttachments,
    },
    truncated:
      hasOmittedArrays || imageAttachments > 0 || documentAttachments > 0 || clipping.occurred,
    bodySha256: createHash('sha256').update(canonicalJson(reportBody)).digest('hex'),
  };
}

function countAttachments(body: GeneratedReportBody, kind: 'images' | 'documents'): number {
  let count = 0;
  for (const issue of body.issues) count += issue.attachments?.[kind]?.length ?? 0;
  for (const section of body.summarySections) count += section.attachments?.[kind]?.length ?? 0;
  return count;
}

function clipNullableText(value: string | null, state: { occurred: boolean }): string | null {
  return value === null ? null : clipText(value, state);
}

function clipText(value: string, state: { occurred: boolean }): string {
  const codePoints = Array.from(value);
  if (codePoints.length <= MAX_PREVIEW_CODE_POINTS) return value;
  state.occurred = true;
  return codePoints.slice(0, MAX_PREVIEW_CODE_POINTS).join('');
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function safeIntegerFromDatabase(value: string): number | null {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function readLimits(
  bearerToken: string,
  configuration: EnabledAdminReportDiagnosticConfiguration,
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
  configuration: EnabledAdminReportDiagnosticConfiguration,
  bearerToken: string,
  fetchImpl: typeof fetch,
): Promise<'succeeded' | 'failed'> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), CLEANUP_GRACE_MS);
  try {
    const signedOut = await signOut(configuration, bearerToken, fetchImpl, controller.signal);
    if (!signedOut) return 'failed';
    return (await verifySessionRevoked(configuration, bearerToken, fetchImpl, controller.signal))
      ? 'succeeded'
      : 'failed';
  } finally {
    clearTimeout(deadline);
  }
}

async function signOut(
  configuration: EnabledAdminReportDiagnosticConfiguration,
  bearerToken: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetchImpl(endpoint(configuration.baseUrl, '/api/auth/sign-out'), {
      method: 'POST',
      headers: { ...jsonHeaders(), authorization: `Bearer ${bearerToken}` },
      body: JSON.stringify({}),
      signal,
      redirect: 'error',
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function verifySessionRevoked(
  configuration: EnabledAdminReportDiagnosticConfiguration,
  bearerToken: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetchImpl(endpoint(configuration.baseUrl, '/api/auth/get-session'), {
      method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${bearerToken}` },
      signal,
      redirect: 'error',
    });
    if (response.status !== 200) return false;
    return (await response.json()) === null;
  } catch {
    return false;
  }
}

async function defaultQueryApplicationDb(
  text: string,
  values: readonly unknown[],
  _signal: AbortSignal,
): Promise<{ rows: readonly ApplicationDatabaseRow[] }> {
  const result = await getPool().query<ApplicationDatabaseRow>(text, [...values]);
  return { rows: result.rows };
}

async function queryDatabase(
  queryApplicationDb: QueryApplicationDb,
  text: string,
  values: readonly unknown[],
  signal: AbortSignal,
): Promise<{ rows: readonly ApplicationDatabaseRow[] }> {
  if (signal.aborted) throw abortError();
  let pending: Promise<{ rows: readonly ApplicationDatabaseRow[] }>;
  try {
    pending = queryApplicationDb(text, values, signal);
  } catch (error) {
    throw error;
  }
  return raceWithAbort(pending, signal);
}

function raceWithAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
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

function reportEndpoint(configuration: EnabledAdminReportDiagnosticConfiguration): URL {
  return endpoint(configuration.baseUrl, reportPath(configuration));
}

function reportPath(configuration: EnabledAdminReportDiagnosticConfiguration): string {
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

function elapsedObservationMs(start: Date, end: Date): number {
  return Math.min(
    MAX_OBSERVATION_DURATION_MS,
    Math.max(0, Math.round(end.getTime() - start.getTime())),
  );
}

function isAbort(error: unknown, signal: AbortSignal | null | undefined): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === 'AbortError');
}

function validateObservation(observation: unknown): ReportGenerateDiagnosticObservation {
  return operations.reportGenerateDiagnosticObservation.parse(observation);
}
