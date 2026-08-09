import type {
  AiCallOutcome,
  AiOperationUsage,
  AiSuccessfulProviderUsage,
  AiUsageObservation,
  AiUsageProvider,
  AiUsageProviderCategory,
  AiUsageWindow,
} from '@harpa/api-contract';
import { operations } from '@harpa/api-contract';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { rawDb } from '../db/client.js';

const MAX_AGGREGATE_ROWS = 72;
const DAY_MS = 24 * 60 * 60 * 1_000;

const PROVIDERS = ['openai', 'groq', 'kimi', 'other'] as const;
const MODES = ['live', 'record', 'replay'] as const;
const OPERATIONS = ['chat', 'generate_report', 'transcribe'] as const;

type FixtureMode = (typeof MODES)[number];
type Operation = (typeof OPERATIONS)[number];
type UsageStatus = 'ok' | 'error';

interface AggregateQueryResult {
  rows: unknown[];
}

type AggregateQuery = (statement: SQL) => Promise<AggregateQueryResult>;

export interface ObserveAdminAiUsageOptions {
  query?: AggregateQuery;
  now?: () => Date;
}

const aggregateRow = z
  .object({
    provider: z.enum(PROVIDERS),
    operation: z.enum(OPERATIONS),
    fixture_mode: z.enum(MODES),
    status: z.enum(['ok', 'error']),
    month_event_count: z.unknown(),
    day_event_count: z.unknown(),
    month_input_tokens: z.unknown(),
    day_input_tokens: z.unknown(),
    month_output_tokens: z.unknown(),
    day_output_tokens: z.unknown(),
    month_cached_tokens: z.unknown(),
    day_cached_tokens: z.unknown(),
    month_input_seconds: z.unknown(),
    day_input_seconds: z.unknown(),
    month_missing_input_seconds_event_count: z.unknown(),
    day_missing_input_seconds_event_count: z.unknown(),
    month_last_recorded_at: z.unknown(),
    day_last_recorded_at: z.unknown(),
  })
  .passthrough();

type AggregateRow = z.infer<typeof aggregateRow>;

const PROVIDER_CAPACITY = {
  openai: { status: 'unknown', reason: 'not_observed' },
  groq: { status: 'unknown', reason: 'not_observed' },
  kimi: { status: 'unknown', reason: 'not_observed' },
} as const;

const CAVEATS = [
  'best_effort_ledger',
  'not_provider_billing',
  'replay_not_provider_usage',
  'record_mode_calls_provider',
  'deleted_history_excluded',
] as const;

function currentMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function zeroCallOutcome(): AiCallOutcome {
  return { succeeded: 0, failed: 0, total: 0 };
}

function zeroOperationUsage(): AiOperationUsage {
  return {
    liveSucceeded: 0,
    liveFailed: 0,
    recordSucceeded: 0,
    recordFailed: 0,
    replaySucceeded: 0,
    replayFailed: 0,
  };
}

function zeroSuccessfulUsage(): AiSuccessfulProviderUsage {
  return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, inputSeconds: 0 };
}

function emptyWindow(windowStart: Date, windowEnd: Date): AiUsageWindow {
  return {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    recordedEventCount: 0,
    calls: {
      live: zeroCallOutcome(),
      record: zeroCallOutcome(),
      replay: zeroCallOutcome(),
    },
    successfulProviderUsage: zeroSuccessfulUsage(),
    operations: {
      chat: zeroOperationUsage(),
      generateReport: zeroOperationUsage(),
      transcribe: zeroOperationUsage(),
    },
    providers: [],
    unclassifiedVendorEventCount: 0,
    missingInputSecondsEventCount: 0,
    lastRecordedAt: null,
    warnings: [],
  };
}

function addSafeInteger(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('invalid aggregate integer');
  return result;
}

function addSeconds(left: number, right: number): number {
  const result = Math.round((left + right) * 1_000) / 1_000;
  if (!Number.isFinite(result) || result < 0) throw new Error('invalid aggregate seconds');
  return result;
}

function parseSafeInteger(value: unknown): number {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error('invalid aggregate integer');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('invalid aggregate integer');
  return parsed;
}

function parseSeconds(value: unknown): number {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$/.test(value)) {
    throw new Error('invalid aggregate seconds');
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('invalid aggregate seconds');
  return Math.round(parsed * 1_000) / 1_000;
}

function normalizeTimestamp(value: unknown): string | null {
  if (value === null) return null;
  if (!(typeof value === 'string' || value instanceof Date)) {
    throw new Error('invalid aggregate timestamp');
  }
  const timestamp = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(timestamp.getTime())) throw new Error('invalid aggregate timestamp');
  return timestamp.toISOString();
}

function validateWindowTimestamp(
  eventCount: number,
  timestamp: string | null,
  start: Date,
  end: Date,
): void {
  if (eventCount === 0) {
    if (timestamp !== null) throw new Error('empty aggregate group has a timestamp');
    return;
  }
  if (timestamp === null) throw new Error('non-empty aggregate group lacks a timestamp');
  const time = Date.parse(timestamp);
  if (time < start.getTime() || time >= end.getTime()) {
    throw new Error('aggregate timestamp is outside its window');
  }
}

function maxTimestamp(left: string | null, right: string): string {
  if (left === null || Date.parse(right) > Date.parse(left)) return right;
  return left;
}

function operationKey(operation: Operation): keyof AiUsageWindow['operations'] {
  return operation === 'generate_report' ? 'generateReport' : operation;
}

function outcomeField(mode: FixtureMode, status: UsageStatus): keyof AiOperationUsage {
  const suffix = status === 'ok' ? 'Succeeded' : 'Failed';
  return `${mode}${suffix[0]!.toUpperCase()}${suffix.slice(1)}` as keyof AiOperationUsage;
}

function findOrCreateProvider(
  providers: Map<AiUsageProviderCategory, AiUsageProvider>,
  provider: AiUsageProviderCategory,
  lastRecordedAt: string,
): AiUsageProvider {
  const existing = providers.get(provider);
  if (existing) {
    existing.lastRecordedAt = maxTimestamp(existing.lastRecordedAt, lastRecordedAt);
    return existing;
  }
  const created: AiUsageProvider = {
    provider,
    recordedEventCount: 0,
    calls: {
      live: zeroCallOutcome(),
      record: zeroCallOutcome(),
      replay: zeroCallOutcome(),
    },
    successfulProviderUsage: zeroSuccessfulUsage(),
    lastRecordedAt,
  };
  providers.set(provider, created);
  return created;
}

interface WindowColumns {
  eventCount: unknown;
  inputTokens: unknown;
  outputTokens: unknown;
  cachedTokens: unknown;
  inputSeconds: unknown;
  missingInputSecondsEventCount: unknown;
  lastRecordedAt: unknown;
}

function rowColumns(row: AggregateRow, prefix: 'month' | 'day'): WindowColumns {
  return {
    eventCount: row[`${prefix}_event_count`],
    inputTokens: row[`${prefix}_input_tokens`],
    outputTokens: row[`${prefix}_output_tokens`],
    cachedTokens: row[`${prefix}_cached_tokens`],
    inputSeconds: row[`${prefix}_input_seconds`],
    missingInputSecondsEventCount: row[`${prefix}_missing_input_seconds_event_count`],
    lastRecordedAt: row[`${prefix}_last_recorded_at`],
  };
}

function applyAggregateRow(
  window: AiUsageWindow,
  providers: Map<AiUsageProviderCategory, AiUsageProvider>,
  row: AggregateRow,
  columns: WindowColumns,
  start: Date,
  end: Date,
): void {
  const eventCount = parseSafeInteger(columns.eventCount);
  const inputTokens = parseSafeInteger(columns.inputTokens);
  const outputTokens = parseSafeInteger(columns.outputTokens);
  const cachedTokens = parseSafeInteger(columns.cachedTokens);
  const inputSeconds = parseSeconds(columns.inputSeconds);
  const missingInputSecondsEventCount = parseSafeInteger(columns.missingInputSecondsEventCount);
  const lastRecordedAt = normalizeTimestamp(columns.lastRecordedAt);
  validateWindowTimestamp(eventCount, lastRecordedAt, start, end);

  if (eventCount === 0) {
    if (
      inputTokens !== 0 ||
      outputTokens !== 0 ||
      cachedTokens !== 0 ||
      inputSeconds !== 0 ||
      missingInputSecondsEventCount !== 0
    ) {
      throw new Error('empty aggregate group has usage');
    }
    return;
  }
  if (lastRecordedAt === null) throw new Error('missing aggregate timestamp');

  window.recordedEventCount = addSafeInteger(window.recordedEventCount, eventCount);
  const windowOutcome = window.calls[row.fixture_mode];
  const outcome = row.status === 'ok' ? 'succeeded' : 'failed';
  windowOutcome[outcome] = addSafeInteger(windowOutcome[outcome], eventCount);
  windowOutcome.total = addSafeInteger(windowOutcome.total, eventCount);

  const operation = window.operations[operationKey(row.operation)];
  const field = outcomeField(row.fixture_mode, row.status);
  operation[field] = addSafeInteger(operation[field], eventCount);

  const provider = findOrCreateProvider(providers, row.provider, lastRecordedAt);
  provider.recordedEventCount = addSafeInteger(provider.recordedEventCount, eventCount);
  const providerOutcome = provider.calls[row.fixture_mode];
  providerOutcome[outcome] = addSafeInteger(providerOutcome[outcome], eventCount);
  providerOutcome.total = addSafeInteger(providerOutcome.total, eventCount);

  if (row.provider === 'other') {
    window.unclassifiedVendorEventCount = addSafeInteger(
      window.unclassifiedVendorEventCount,
      eventCount,
    );
  }

  const providerAttributableSuccess = row.status === 'ok' && row.fixture_mode !== 'replay';
  if (providerAttributableSuccess && row.operation !== 'transcribe') {
    window.successfulProviderUsage.inputTokens = addSafeInteger(
      window.successfulProviderUsage.inputTokens,
      inputTokens,
    );
    window.successfulProviderUsage.outputTokens = addSafeInteger(
      window.successfulProviderUsage.outputTokens,
      outputTokens,
    );
    window.successfulProviderUsage.cachedTokens = addSafeInteger(
      window.successfulProviderUsage.cachedTokens,
      cachedTokens,
    );
    provider.successfulProviderUsage.inputTokens = addSafeInteger(
      provider.successfulProviderUsage.inputTokens,
      inputTokens,
    );
    provider.successfulProviderUsage.outputTokens = addSafeInteger(
      provider.successfulProviderUsage.outputTokens,
      outputTokens,
    );
    provider.successfulProviderUsage.cachedTokens = addSafeInteger(
      provider.successfulProviderUsage.cachedTokens,
      cachedTokens,
    );
  }

  if (providerAttributableSuccess && row.operation === 'transcribe') {
    window.successfulProviderUsage.inputSeconds = addSeconds(
      window.successfulProviderUsage.inputSeconds,
      inputSeconds,
    );
    provider.successfulProviderUsage.inputSeconds = addSeconds(
      provider.successfulProviderUsage.inputSeconds,
      inputSeconds,
    );
    window.missingInputSecondsEventCount = addSafeInteger(
      window.missingInputSecondsEventCount,
      missingInputSecondsEventCount,
    );
  }

  window.lastRecordedAt = maxTimestamp(window.lastRecordedAt, lastRecordedAt);
}

function finalizeWindow(
  window: AiUsageWindow,
  providers: Map<AiUsageProviderCategory, AiUsageProvider>,
): void {
  window.providers = PROVIDERS.flatMap((provider) => {
    const value = providers.get(provider);
    return value ? [value] : [];
  });
  if (window.unclassifiedVendorEventCount > 0) {
    window.warnings.push('unclassified_vendor_events');
  }
  if (window.missingInputSecondsEventCount > 0) {
    window.warnings.push('missing_transcription_duration');
  }
}

function statementFor(monthStart: Date, dayStart: Date, observedAt: Date): SQL {
  const earliestStart = monthStart.getTime() <= dayStart.getTime() ? monthStart : dayStart;
  return sql`
    SELECT
      CASE
        WHEN vendor = 'openai' THEN 'openai'
        WHEN vendor = 'groq' THEN 'groq'
        WHEN vendor = 'kimi' THEN 'kimi'
        ELSE 'other'
      END AS provider,
      operation::text AS operation,
      fixture_mode::text AS fixture_mode,
      status::text AS status,
      count(*) FILTER (
        WHERE created_at >= ${monthStart} AND created_at < ${observedAt}
      )::text AS month_event_count,
      count(*) FILTER (
        WHERE created_at >= ${dayStart} AND created_at < ${observedAt}
      )::text AS day_event_count,
      coalesce(sum(input_tokens) FILTER (
        WHERE created_at >= ${monthStart} AND created_at < ${observedAt}
          AND status = 'ok' AND fixture_mode IN ('live', 'record')
          AND operation IN ('chat', 'generate_report')
      ), 0)::text AS month_input_tokens,
      coalesce(sum(input_tokens) FILTER (
        WHERE created_at >= ${dayStart} AND created_at < ${observedAt}
          AND status = 'ok' AND fixture_mode IN ('live', 'record')
          AND operation IN ('chat', 'generate_report')
      ), 0)::text AS day_input_tokens,
      coalesce(sum(output_tokens) FILTER (
        WHERE created_at >= ${monthStart} AND created_at < ${observedAt}
          AND status = 'ok' AND fixture_mode IN ('live', 'record')
          AND operation IN ('chat', 'generate_report')
      ), 0)::text AS month_output_tokens,
      coalesce(sum(output_tokens) FILTER (
        WHERE created_at >= ${dayStart} AND created_at < ${observedAt}
          AND status = 'ok' AND fixture_mode IN ('live', 'record')
          AND operation IN ('chat', 'generate_report')
      ), 0)::text AS day_output_tokens,
      coalesce(sum(cached_tokens) FILTER (
        WHERE created_at >= ${monthStart} AND created_at < ${observedAt}
          AND status = 'ok' AND fixture_mode IN ('live', 'record')
          AND operation IN ('chat', 'generate_report')
      ), 0)::text AS month_cached_tokens,
      coalesce(sum(cached_tokens) FILTER (
        WHERE created_at >= ${dayStart} AND created_at < ${observedAt}
          AND status = 'ok' AND fixture_mode IN ('live', 'record')
          AND operation IN ('chat', 'generate_report')
      ), 0)::text AS day_cached_tokens,
      coalesce(sum(input_seconds) FILTER (
        WHERE created_at >= ${monthStart} AND created_at < ${observedAt}
          AND status = 'ok' AND fixture_mode IN ('live', 'record')
          AND operation = 'transcribe'
      ), 0)::text AS month_input_seconds,
      coalesce(sum(input_seconds) FILTER (
        WHERE created_at >= ${dayStart} AND created_at < ${observedAt}
          AND status = 'ok' AND fixture_mode IN ('live', 'record')
          AND operation = 'transcribe'
      ), 0)::text AS day_input_seconds,
      count(*) FILTER (
        WHERE created_at >= ${monthStart} AND created_at < ${observedAt}
          AND status = 'ok' AND fixture_mode IN ('live', 'record')
          AND operation = 'transcribe' AND input_seconds IS NULL
      )::text AS month_missing_input_seconds_event_count,
      count(*) FILTER (
        WHERE created_at >= ${dayStart} AND created_at < ${observedAt}
          AND status = 'ok' AND fixture_mode IN ('live', 'record')
          AND operation = 'transcribe' AND input_seconds IS NULL
      )::text AS day_missing_input_seconds_event_count,
      max(created_at) FILTER (
        WHERE created_at >= ${monthStart} AND created_at < ${observedAt}
      ) AS month_last_recorded_at,
      max(created_at) FILTER (
        WHERE created_at >= ${dayStart} AND created_at < ${observedAt}
      ) AS day_last_recorded_at
    FROM app.llm_usage_events
    WHERE created_at >= ${earliestStart}
      AND created_at < ${observedAt}
    GROUP BY
      CASE
        WHEN vendor = 'openai' THEN 'openai'
        WHEN vendor = 'groq' THEN 'groq'
        WHEN vendor = 'kimi' THEN 'kimi'
        ELSE 'other'
      END,
      operation,
      fixture_mode,
      status
    ORDER BY provider, operation, fixture_mode, status
  `;
}

function databaseReason(
  error: unknown,
): Extract<AiUsageObservation, { status: 'unknown' }>['reason'] {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (code === '57014') return 'timeout';
  if (code === '42P01' || code === '42703') return 'schema_unavailable';
  return 'database_unavailable';
}

function unknownObservation(
  observedAt: string,
  reason: Extract<AiUsageObservation, { status: 'unknown' }>['reason'],
): AiUsageObservation {
  return { observedAt, status: 'unknown', reason };
}

export async function observeAdminAiUsage(
  options: ObserveAdminAiUsageOptions = {},
): Promise<AiUsageObservation> {
  const captured = (options.now ?? (() => new Date()))();
  if (!Number.isFinite(captured.getTime())) {
    return unknownObservation(new Date().toISOString(), 'invalid_response');
  }

  const observedAt = captured.toISOString();
  const monthStart = currentMonthStart(captured);
  const dayStart = new Date(captured.getTime() - DAY_MS);
  const query: AggregateQuery =
    options.query ??
    (async (statement) => {
      const result = await rawDb().execute(statement);
      return { rows: result.rows };
    });

  let rawRows: unknown[];
  try {
    const result = await query(statementFor(monthStart, dayStart, captured));
    rawRows = result.rows;
  } catch (error) {
    return unknownObservation(observedAt, databaseReason(error));
  }

  try {
    if (!Array.isArray(rawRows) || rawRows.length > MAX_AGGREGATE_ROWS) {
      throw new Error('aggregate row bound exceeded');
    }

    const rows = rawRows.map((row) => aggregateRow.parse(row));
    const dimensions = new Set<string>();
    const monthToDate = emptyWindow(monthStart, captured);
    const last24Hours = emptyWindow(dayStart, captured);
    const monthProviders = new Map<AiUsageProviderCategory, AiUsageProvider>();
    const dayProviders = new Map<AiUsageProviderCategory, AiUsageProvider>();

    for (const row of rows) {
      const dimension = [row.provider, row.operation, row.fixture_mode, row.status].join(':');
      if (dimensions.has(dimension)) throw new Error('duplicate aggregate dimension');
      dimensions.add(dimension);

      applyAggregateRow(
        monthToDate,
        monthProviders,
        row,
        rowColumns(row, 'month'),
        monthStart,
        captured,
      );
      applyAggregateRow(last24Hours, dayProviders, row, rowColumns(row, 'day'), dayStart, captured);
    }

    finalizeWindow(monthToDate, monthProviders);
    finalizeWindow(last24Hours, dayProviders);

    const observation = {
      observedAt,
      status: 'available',
      source: 'harpa_usage_ledger',
      monthToDate,
      last24Hours,
      providerCapacity: PROVIDER_CAPACITY,
      caveats: CAVEATS,
    } as const;
    const parsed = operations.aiUsageObservation.safeParse(observation);
    return parsed.success ? parsed.data : unknownObservation(observedAt, 'invalid_response');
  } catch {
    return unknownObservation(observedAt, 'invalid_response');
  }
}
