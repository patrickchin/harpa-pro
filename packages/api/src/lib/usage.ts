/**
 * Usage query helpers extracted from the old auth/service.ts.
 * These only touch app.* tables and have no dependency on the
 * auth schema. Route handlers pass the scoped DB handle in.
 */
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';

type Db = NodePgDatabase<typeof schema>;

export interface UsageMonth {
  month: string; // YYYY-MM
  reports: number;
  voiceNotes: number;
}

export interface UsageTokenMonth {
  month: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** Sum of transcribe audio seconds for the month. */
  inputSeconds: number;
  calls: number;
}

export interface UsageByModelRow {
  vendor: string;
  model: string;
  operation: 'chat' | 'transcribe' | 'generate_report';
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** Sum of transcribe audio seconds. 0 for non-transcribe rows. */
  inputSeconds: number;
}

export interface UsageSummary {
  months: UsageMonth[];
  totals: {
    reports: number;
    voiceNotes: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    inputSeconds: number;
    calls: number;
  };
  usageTokens: UsageTokenMonth[];
  usageByModel: UsageByModelRow[];
}

/** Round seconds to 3dp to match the column scale and avoid noisy floats. */
function roundSeconds(v: number | string): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 1000) / 1000;
}

function encodeUsageCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}

function decodeUsageCursor(c: string): { createdAt: string; id: string } {
  const raw = Buffer.from(c, 'base64url').toString('utf8');
  const [createdAt, id] = raw.split('|');
  if (!createdAt || !id) throw new Error('invalid cursor');
  return { createdAt, id };
}

/**
 * Per-month counts (reports + voice notes) AND per-month LLM token
 * totals + a per-(vendor,model,operation) breakdown. Only `status='ok'`
 * usage events count toward token totals.
 */
export async function fetchUsage(db: Db, userId: string): Promise<UsageSummary> {
  const reportsRes = await db.execute<{ month: string; count: string }>(sql`
    SELECT to_char(created_at, 'YYYY-MM') AS month, count(*)::text AS count
    FROM app.reports
    WHERE author_id = ${userId}
    GROUP BY month
    ORDER BY month
  `);
  const notesRes = await db.execute<{ month: string; count: string }>(sql`
    SELECT to_char(created_at, 'YYYY-MM') AS month, count(*)::text AS count
    FROM app.notes
    WHERE author_id = ${userId} AND kind = 'voice'
    GROUP BY month
    ORDER BY month
  `);
  const tokensRes = await db.execute<{
    month: string;
    input_tokens: string;
    output_tokens: string;
    cached_tokens: string;
    input_seconds: string;
    calls: string;
  }>(sql`
    SELECT
      to_char(created_at, 'YYYY-MM') AS month,
      coalesce(sum(input_tokens), 0)::text             AS input_tokens,
      coalesce(sum(output_tokens), 0)::text            AS output_tokens,
      coalesce(sum(cached_tokens), 0)::text            AS cached_tokens,
      coalesce(sum(input_seconds), 0)::text            AS input_seconds,
      count(*)::text                                   AS calls
    FROM app.llm_usage_events
    WHERE user_id = ${userId} AND status = 'ok'
    GROUP BY month
    ORDER BY month
  `);
  const byModelRes = await db.execute<{
    vendor: string;
    model: string;
    operation: 'chat' | 'transcribe' | 'generate_report';
    calls: string;
    input_tokens: string;
    output_tokens: string;
    cached_tokens: string;
    input_seconds: string;
  }>(sql`
    SELECT
      vendor,
      model,
      operation,
      count(*)::text                                   AS calls,
      coalesce(sum(input_tokens), 0)::text             AS input_tokens,
      coalesce(sum(output_tokens), 0)::text            AS output_tokens,
      coalesce(sum(cached_tokens), 0)::text            AS cached_tokens,
      coalesce(sum(input_seconds), 0)::text            AS input_seconds
    FROM app.llm_usage_events
    WHERE user_id = ${userId} AND status = 'ok'
    GROUP BY vendor, model, operation
    ORDER BY vendor, model, operation
  `);

  const monthMap = new Map<string, UsageMonth>();
  for (const r of reportsRes.rows) {
    monthMap.set(r.month, { month: r.month, reports: Number(r.count), voiceNotes: 0 });
  }
  for (const r of notesRes.rows) {
    const existing = monthMap.get(r.month) ?? { month: r.month, reports: 0, voiceNotes: 0 };
    existing.voiceNotes = Number(r.count);
    monthMap.set(r.month, existing);
  }
  const months = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

  const usageTokens: UsageTokenMonth[] = tokensRes.rows.map((r) => ({
    month: r.month,
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    cachedTokens: Number(r.cached_tokens),
    inputSeconds: roundSeconds(r.input_seconds),
    calls: Number(r.calls),
  }));
  const usageByModel: UsageByModelRow[] = byModelRes.rows.map((r) => ({
    vendor: r.vendor,
    model: r.model,
    operation: r.operation,
    calls: Number(r.calls),
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    cachedTokens: Number(r.cached_tokens),
    inputSeconds: roundSeconds(r.input_seconds),
  }));

  const totals = {
    reports: months.reduce((a, m) => a + m.reports, 0),
    voiceNotes: months.reduce((a, m) => a + m.voiceNotes, 0),
    inputTokens: usageTokens.reduce((a, m) => a + m.inputTokens, 0),
    outputTokens: usageTokens.reduce((a, m) => a + m.outputTokens, 0),
    cachedTokens: usageTokens.reduce((a, m) => a + m.cachedTokens, 0),
    inputSeconds: roundSeconds(usageTokens.reduce((a, m) => a + m.inputSeconds, 0)),
    calls: usageTokens.reduce((a, m) => a + m.calls, 0),
  };
  return { months, totals, usageTokens, usageByModel };
}

export interface UsageEventRow {
  id: string;
  createdAt: string;
  vendor: string;
  model: string;
  operation: 'chat' | 'transcribe' | 'generate_report';
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  inputSeconds: number | null;
  latencyMs: number;
  fixtureMode: 'live' | 'replay' | 'record';
  status: 'ok' | 'error';
  projectId: string | null;
  reportId: string | null;
}

export interface ListUsageEventsInput {
  cursor?: string;
  limit: number;
  operation?: 'chat' | 'transcribe' | 'generate_report';
  vendor?: string;
}

/**
 * Raw events timeline for `/me/usage/events` — newest first.
 * Pagination is keyset on `(created_at DESC, id DESC)`.
 */
export async function listUsageEvents(
  db: Db,
  userId: string,
  input: ListUsageEventsInput,
): Promise<{ items: UsageEventRow[]; nextCursor: string | null }> {
  const { cursor, limit, operation, vendor } = input;
  const overFetch = limit + 1;

  type Row = {
    id: string;
    created_at: string;
    vendor: string;
    model: string;
    operation: 'chat' | 'transcribe' | 'generate_report';
    input_tokens: string;
    output_tokens: string;
    cached_tokens: string;
    input_seconds: string | null;
    latency_ms: string;
    fixture_mode: 'live' | 'replay' | 'record';
    status: 'ok' | 'error';
    project_id: string | null;
    report_id: string | null;
  };

  let rows: Row[];
  if (cursor) {
    const { createdAt, id } = decodeUsageCursor(cursor);
    const res = await db.execute<Row>(sql`
      SELECT id, created_at, vendor, model, operation,
             input_tokens, output_tokens, cached_tokens, input_seconds,
             latency_ms, fixture_mode, status, project_id, report_id
      FROM app.llm_usage_events
      WHERE user_id = ${userId}
        AND (
          (created_at = ${createdAt}::timestamptz AND id < ${id})
          OR created_at < ${createdAt}::timestamptz
        )
        ${operation ? sql`AND operation = ${operation}::app.llm_operation` : sql``}
        ${vendor ? sql`AND vendor = ${vendor}` : sql``}
      ORDER BY created_at DESC, id DESC
      LIMIT ${overFetch}
    `);
    rows = res.rows as Row[];
  } else {
    const res = await db.execute<Row>(sql`
      SELECT id, created_at, vendor, model, operation,
             input_tokens, output_tokens, cached_tokens, input_seconds,
             latency_ms, fixture_mode, status, project_id, report_id
      FROM app.llm_usage_events
      WHERE user_id = ${userId}
        ${operation ? sql`AND operation = ${operation}::app.llm_operation` : sql``}
        ${vendor ? sql`AND vendor = ${vendor}` : sql``}
      ORDER BY created_at DESC, id DESC
      LIMIT ${overFetch}
    `);
    rows = res.rows as Row[];
  }

  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
    id: r.id,
    createdAt: new Date(r.created_at).toISOString(),
    vendor: r.vendor,
    model: r.model,
    operation: r.operation,
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    cachedTokens: Number(r.cached_tokens),
    inputSeconds: r.input_seconds == null ? null : roundSeconds(r.input_seconds),
    latencyMs: Number(r.latency_ms),
    fixtureMode: r.fixture_mode,
    status: r.status,
    projectId: r.project_id,
    reportId: r.report_id,
  }));

  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeUsageCursor(new Date(last.createdAt).toISOString(), last.id)
        : null,
  };
}
