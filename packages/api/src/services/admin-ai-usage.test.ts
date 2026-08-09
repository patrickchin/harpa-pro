import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { observeAdminAiUsage } from './admin-ai-usage.js';

const NOW = new Date('2026-08-08T12:34:56.000Z');
const MONTH_START = new Date('2026-08-01T00:00:00.000Z');
const DAY_START = new Date('2026-08-07T12:34:56.000Z');
const dialect = new PgDialect();

type Provider = 'openai' | 'groq' | 'kimi' | 'other';
type Operation = 'chat' | 'generate_report' | 'transcribe';
type FixtureMode = 'live' | 'record' | 'replay';
type UsageStatus = 'ok' | 'error';

interface AggregateRow {
  provider: Provider;
  operation: Operation;
  fixture_mode: FixtureMode;
  status: UsageStatus;
  month_event_count: string;
  day_event_count: string;
  month_input_tokens: string;
  day_input_tokens: string;
  month_output_tokens: string;
  day_output_tokens: string;
  month_cached_tokens: string;
  day_cached_tokens: string;
  month_input_seconds: string;
  day_input_seconds: string;
  month_missing_input_seconds_event_count: string;
  day_missing_input_seconds_event_count: string;
  month_last_recorded_at: string | null;
  day_last_recorded_at: string | null;
}

type QueryResult = { rows: Array<AggregateRow & Record<string, unknown>> };
type Query = (statement: SQL) => Promise<QueryResult>;

function aggregateRow(
  overrides: Record<string, unknown> = {},
): AggregateRow & Record<string, unknown> {
  return {
    provider: 'openai',
    operation: 'chat',
    fixture_mode: 'live',
    status: 'ok',
    month_event_count: '1',
    day_event_count: '1',
    month_input_tokens: '10',
    day_input_tokens: '10',
    month_output_tokens: '5',
    day_output_tokens: '5',
    month_cached_tokens: '2',
    day_cached_tokens: '2',
    month_input_seconds: '0',
    day_input_seconds: '0',
    month_missing_input_seconds_event_count: '0',
    day_missing_input_seconds_event_count: '0',
    month_last_recorded_at: '2026-08-08T12:00:00.000Z',
    day_last_recorded_at: '2026-08-08T12:00:00.000Z',
    ...overrides,
  } as AggregateRow & Record<string, unknown>;
}

function queryReturning(rows: QueryResult['rows']): ReturnType<typeof vi.fn<Query>> {
  return vi.fn<Query>(async () => ({ rows }));
}

function compiled(statement: SQL): { sql: string; params: unknown[] } {
  const query = dialect.sqlToQuery(statement);
  return { sql: query.sql.replace(/\s+/g, ' ').trim(), params: query.params };
}

function emptyWindow(windowStart: Date) {
  return {
    windowStart: windowStart.toISOString(),
    windowEnd: NOW.toISOString(),
    recordedEventCount: 0,
    calls: {
      live: { succeeded: 0, failed: 0, total: 0 },
      record: { succeeded: 0, failed: 0, total: 0 },
      replay: { succeeded: 0, failed: 0, total: 0 },
    },
    successfulProviderUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      inputSeconds: 0,
    },
    operations: {
      chat: {
        liveSucceeded: 0,
        liveFailed: 0,
        recordSucceeded: 0,
        recordFailed: 0,
        replaySucceeded: 0,
        replayFailed: 0,
      },
      generateReport: {
        liveSucceeded: 0,
        liveFailed: 0,
        recordSucceeded: 0,
        recordFailed: 0,
        replaySucceeded: 0,
        replayFailed: 0,
      },
      transcribe: {
        liveSucceeded: 0,
        liveFailed: 0,
        recordSucceeded: 0,
        recordFailed: 0,
        replaySucceeded: 0,
        replayFailed: 0,
      },
    },
    providers: [],
    unclassifiedVendorEventCount: 0,
    missingInputSecondsEventCount: 0,
    lastRecordedAt: null,
    warnings: [],
  };
}

const providerCapacity = {
  openai: { status: 'unknown', reason: 'not_observed' },
  groq: { status: 'unknown', reason: 'not_observed' },
  kimi: { status: 'unknown', reason: 'not_observed' },
};

const caveats = [
  'best_effort_ledger',
  'not_provider_billing',
  'replay_not_provider_usage',
  'record_mode_calls_provider',
  'deleted_history_excluded',
];

describe('observeAdminAiUsage', () => {
  it('performs one time-bounded aggregate query and returns valid empty UTC windows', async () => {
    const query = queryReturning([]);
    const now = vi.fn(() => NOW);

    await expect(observeAdminAiUsage({ query, now })).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'available',
      source: 'harpa_usage_ledger',
      monthToDate: emptyWindow(MONTH_START),
      last24Hours: emptyWindow(DAY_START),
      providerCapacity,
      caveats,
    });

    expect(now).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledOnce();
    const statement = compiled(query.mock.calls[0]![0]);
    expect(statement.sql).toMatch(/FROM app\.llm_usage_events/i);
    expect(statement.sql).toMatch(/created_at\s*>=/i);
    expect(statement.sql).toMatch(/created_at\s*</i);
    expect(statement.sql).toMatch(/CASE[\s\S]+vendor[\s\S]+other/i);
    expect(statement.sql).toMatch(/GROUP BY[\s\S]+operation[\s\S]+fixture_mode[\s\S]+status/i);
    expect(statement.sql).not.toMatch(/\b(user_id|project_id|report_id|model)\b/i);
    expect(
      statement.params.map((value) => (value instanceof Date ? value.toISOString() : value)),
    ).toEqual(
      expect.arrayContaining([
        MONTH_START.toISOString(),
        DAY_START.toISOString(),
        NOW.toISOString(),
      ]),
    );
  });

  it('scans from the 24-hour start when it precedes the current UTC month', async () => {
    const earlyMonthNow = new Date('2026-08-01T00:30:00.000Z');
    const precedingDay = new Date('2026-07-31T00:30:00.000Z');
    const query = queryReturning([]);

    await observeAdminAiUsage({ query, now: () => earlyMonthNow });

    const statement = compiled(query.mock.calls[0]![0]);
    expect(
      statement.params.map((value) => (value instanceof Date ? value.toISOString() : value)),
    ).toContain(precedingDay.toISOString());
  });

  it('accounts for provider modes, outcomes, operations, tokens, seconds, and warnings', async () => {
    const query = queryReturning([
      aggregateRow({
        provider: 'openai',
        operation: 'chat',
        fixture_mode: 'live',
        status: 'ok',
        month_event_count: '3',
        day_event_count: '2',
        month_input_tokens: '120',
        day_input_tokens: '80',
        month_output_tokens: '60',
        day_output_tokens: '40',
        month_cached_tokens: '30',
        day_cached_tokens: '20',
        month_last_recorded_at: '2026-08-08T11:00:00.000Z',
        day_last_recorded_at: '2026-08-08T11:00:00.000Z',
      }),
      aggregateRow({
        provider: 'openai',
        operation: 'chat',
        fixture_mode: 'live',
        status: 'error',
        month_event_count: '1',
        day_event_count: '1',
        month_input_tokens: '999999',
        day_input_tokens: '999999',
        month_output_tokens: '999999',
        day_output_tokens: '999999',
        month_cached_tokens: '999999',
        day_cached_tokens: '999999',
        month_last_recorded_at: '2026-08-08T11:30:00.000Z',
        day_last_recorded_at: '2026-08-08T11:30:00.000Z',
      }),
      aggregateRow({
        provider: 'groq',
        operation: 'transcribe',
        fixture_mode: 'record',
        status: 'ok',
        month_event_count: '2',
        day_event_count: '1',
        month_input_tokens: '999999',
        day_input_tokens: '999999',
        month_output_tokens: '999999',
        day_output_tokens: '999999',
        month_cached_tokens: '999999',
        day_cached_tokens: '999999',
        month_input_seconds: '12.345',
        day_input_seconds: '4.500',
        month_missing_input_seconds_event_count: '1',
        month_last_recorded_at: '2026-08-07T15:00:00.000Z',
        day_last_recorded_at: '2026-08-07T15:00:00.000Z',
      }),
      aggregateRow({
        provider: 'other',
        operation: 'generate_report',
        fixture_mode: 'replay',
        status: 'ok',
        month_event_count: '4',
        day_event_count: '0',
        month_input_tokens: '888888',
        day_input_tokens: '0',
        month_output_tokens: '888888',
        day_output_tokens: '0',
        month_cached_tokens: '888888',
        day_cached_tokens: '0',
        month_last_recorded_at: '2026-08-06T10:00:00.000Z',
        day_last_recorded_at: null,
        raw_vendor: 'private-vendor-label',
        model: 'private-model-name',
        user_id: 'private-user-id',
        prompt: 'private prompt contents',
      }),
      aggregateRow({
        provider: 'kimi',
        operation: 'generate_report',
        fixture_mode: 'record',
        status: 'ok',
        month_event_count: '1',
        day_event_count: '1',
        month_input_tokens: '30',
        day_input_tokens: '30',
        month_output_tokens: '12',
        day_output_tokens: '12',
        month_cached_tokens: '5',
        day_cached_tokens: '5',
        month_last_recorded_at: '2026-08-08T12:00:00.000Z',
        day_last_recorded_at: '2026-08-08T12:00:00.000Z',
      }),
      aggregateRow({
        provider: 'kimi',
        operation: 'generate_report',
        fixture_mode: 'record',
        status: 'error',
        month_event_count: '2',
        day_event_count: '0',
        month_input_tokens: '777777',
        day_input_tokens: '0',
        month_output_tokens: '777777',
        day_output_tokens: '0',
        month_cached_tokens: '777777',
        day_cached_tokens: '0',
        month_last_recorded_at: '2026-08-03T12:00:00.000Z',
        day_last_recorded_at: null,
      }),
      aggregateRow({
        provider: 'groq',
        operation: 'transcribe',
        fixture_mode: 'replay',
        status: 'error',
        month_event_count: '1',
        day_event_count: '1',
        month_input_tokens: '666666',
        day_input_tokens: '666666',
        month_output_tokens: '666666',
        day_output_tokens: '666666',
        month_cached_tokens: '666666',
        day_cached_tokens: '666666',
        month_last_recorded_at: '2026-08-08T09:00:00.000Z',
        day_last_recorded_at: '2026-08-08T09:00:00.000Z',
      }),
    ]);

    const result = await observeAdminAiUsage({ query, now: () => NOW });

    expect(result).toMatchObject({
      observedAt: NOW.toISOString(),
      status: 'available',
      source: 'harpa_usage_ledger',
      monthToDate: {
        windowStart: MONTH_START.toISOString(),
        windowEnd: NOW.toISOString(),
        recordedEventCount: 14,
        calls: {
          live: { succeeded: 3, failed: 1, total: 4 },
          record: { succeeded: 3, failed: 2, total: 5 },
          replay: { succeeded: 4, failed: 1, total: 5 },
        },
        successfulProviderUsage: {
          inputTokens: 150,
          outputTokens: 72,
          cachedTokens: 35,
          inputSeconds: 12.345,
        },
        operations: {
          chat: {
            liveSucceeded: 3,
            liveFailed: 1,
            recordSucceeded: 0,
            recordFailed: 0,
            replaySucceeded: 0,
            replayFailed: 0,
          },
          generateReport: {
            liveSucceeded: 0,
            liveFailed: 0,
            recordSucceeded: 1,
            recordFailed: 2,
            replaySucceeded: 4,
            replayFailed: 0,
          },
          transcribe: {
            liveSucceeded: 0,
            liveFailed: 0,
            recordSucceeded: 2,
            recordFailed: 0,
            replaySucceeded: 0,
            replayFailed: 1,
          },
        },
        unclassifiedVendorEventCount: 4,
        missingInputSecondsEventCount: 1,
        lastRecordedAt: '2026-08-08T12:00:00.000Z',
        warnings: ['unclassified_vendor_events', 'missing_transcription_duration'],
      },
      last24Hours: {
        windowStart: DAY_START.toISOString(),
        windowEnd: NOW.toISOString(),
        recordedEventCount: 6,
        calls: {
          live: { succeeded: 2, failed: 1, total: 3 },
          record: { succeeded: 2, failed: 0, total: 2 },
          replay: { succeeded: 0, failed: 1, total: 1 },
        },
        successfulProviderUsage: {
          inputTokens: 110,
          outputTokens: 52,
          cachedTokens: 25,
          inputSeconds: 4.5,
        },
        operations: {
          chat: {
            liveSucceeded: 2,
            liveFailed: 1,
            recordSucceeded: 0,
            recordFailed: 0,
            replaySucceeded: 0,
            replayFailed: 0,
          },
          generateReport: {
            liveSucceeded: 0,
            liveFailed: 0,
            recordSucceeded: 1,
            recordFailed: 0,
            replaySucceeded: 0,
            replayFailed: 0,
          },
          transcribe: {
            liveSucceeded: 0,
            liveFailed: 0,
            recordSucceeded: 1,
            recordFailed: 0,
            replaySucceeded: 0,
            replayFailed: 1,
          },
        },
        unclassifiedVendorEventCount: 0,
        missingInputSecondsEventCount: 0,
        lastRecordedAt: '2026-08-08T12:00:00.000Z',
        warnings: [],
      },
      providerCapacity,
      caveats,
    });

    if (result.status === 'unknown') throw new Error('expected available usage observation');
    expect(result.monthToDate.providers).toEqual([
      {
        provider: 'openai',
        recordedEventCount: 4,
        calls: {
          live: { succeeded: 3, failed: 1, total: 4 },
          record: { succeeded: 0, failed: 0, total: 0 },
          replay: { succeeded: 0, failed: 0, total: 0 },
        },
        successfulProviderUsage: {
          inputTokens: 120,
          outputTokens: 60,
          cachedTokens: 30,
          inputSeconds: 0,
        },
        lastRecordedAt: '2026-08-08T11:30:00.000Z',
      },
      {
        provider: 'groq',
        recordedEventCount: 3,
        calls: {
          live: { succeeded: 0, failed: 0, total: 0 },
          record: { succeeded: 2, failed: 0, total: 2 },
          replay: { succeeded: 0, failed: 1, total: 1 },
        },
        successfulProviderUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          inputSeconds: 12.345,
        },
        lastRecordedAt: '2026-08-08T09:00:00.000Z',
      },
      {
        provider: 'kimi',
        recordedEventCount: 3,
        calls: {
          live: { succeeded: 0, failed: 0, total: 0 },
          record: { succeeded: 1, failed: 2, total: 3 },
          replay: { succeeded: 0, failed: 0, total: 0 },
        },
        successfulProviderUsage: {
          inputTokens: 30,
          outputTokens: 12,
          cachedTokens: 5,
          inputSeconds: 0,
        },
        lastRecordedAt: '2026-08-08T12:00:00.000Z',
      },
      {
        provider: 'other',
        recordedEventCount: 4,
        calls: {
          live: { succeeded: 0, failed: 0, total: 0 },
          record: { succeeded: 0, failed: 0, total: 0 },
          replay: { succeeded: 4, failed: 0, total: 4 },
        },
        successfulProviderUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          inputSeconds: 0,
        },
        lastRecordedAt: '2026-08-06T10:00:00.000Z',
      },
    ]);
    expect(
      result.last24Hours.providers.map(({ provider }: { provider: Provider }) => provider),
    ).toEqual(['openai', 'groq', 'kimi']);
    expect(JSON.stringify(result)).not.toMatch(
      /private-vendor-label|private-model-name|private-user-id|private prompt contents|999999|888888|777777|666666/,
    );
  });

  it.each([
    ['fractional count', { month_event_count: '1.5' }],
    ['negative count', { day_event_count: '-1' }],
    ['unsafe token total', { month_input_tokens: '9007199254740992' }],
    ['non-finite seconds', { month_input_seconds: 'Infinity' }],
    ['unrecognized provider category', { provider: 'private-provider' }],
    ['invalid timestamp', { month_last_recorded_at: 'not-a-timestamp' }],
    ['timestamp outside its window', { day_last_recorded_at: '2026-08-01T00:00:00.000Z' }],
    ['count without a correlated timestamp', { day_event_count: '1', day_last_recorded_at: null }],
    ['cached tokens above input tokens', { month_input_tokens: '1', month_cached_tokens: '2' }],
  ] as const)('fails closed on a malformed aggregate row: %s', async (_label, overrides) => {
    const query = queryReturning([aggregateRow(overrides)]);

    await expect(observeAdminAiUsage({ query, now: () => NOW })).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'invalid_response',
    });
  });

  it('fails closed on duplicate aggregate dimensions', async () => {
    const duplicate = aggregateRow();
    const query = queryReturning([duplicate, { ...duplicate }]);

    await expect(observeAdminAiUsage({ query, now: () => NOW })).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'invalid_response',
    });
  });

  it('fails closed when the aggregate row bound exceeds 72', async () => {
    const query = queryReturning(
      Array.from({ length: 73 }, (_, index) =>
        aggregateRow({
          provider: 'openai',
          operation: 'chat',
          fixture_mode: 'live',
          status: 'ok',
          synthetic_row: index,
        }),
      ),
    );

    await expect(observeAdminAiUsage({ query, now: () => NOW })).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'invalid_response',
    });
  });

  it('fails closed before querying when the captured clock is invalid', async () => {
    const query = queryReturning([]);

    const result = await observeAdminAiUsage({ query, now: () => new Date(Number.NaN) });

    expect(result).toMatchObject({ status: 'unknown', reason: 'invalid_response' });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ['57014', 'timeout'],
    ['42P01', 'schema_unavailable'],
    ['42703', 'schema_unavailable'],
    ['08006', 'database_unavailable'],
  ] as const)('maps SQLSTATE %s without leaking raw database text', async (code, reason) => {
    const query = vi.fn<Query>(async () => {
      throw Object.assign(new Error('private database host and SQL must not leak'), { code });
    });

    const result = await observeAdminAiUsage({ query, now: () => NOW });

    expect(result).toEqual({ observedAt: NOW.toISOString(), status: 'unknown', reason });
    expect(query).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toMatch(/private database host|SQL must not leak/);
  });
});
