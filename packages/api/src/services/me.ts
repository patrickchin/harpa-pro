/**
 * Profile + usage queries for `routes/me.ts`. Carved out of the
 * pre-better-auth `auth/service.ts` (which conflated OTP/JWT/JWT-flow
 * with the read paths). The OTP/JWT bits are gone; what remains here
 * is purely the SELECT/UPDATE surface against `public."user"` and the
 * usage tables — all of which run through the per-request scoped
 * accessor (`c.get('db')(fn)`), so RLS is what isolates one user's
 * rows from another's.
 *
 * `email` replaces `phone` in `PublicUser` per the better-auth schema.
 * `displayName`/`companyName` are still user-updatable; `email` /
 * `is_admin` / `plan` are read-only from the app role's POV (see the
 * `user_self_update` policy in migration 0014).
 */
import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';

type Db = NodePgDatabase<typeof schema>;

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  companyName: string | null;
  createdAt: string;
}

export async function fetchUser(db: Db, userId: string): Promise<PublicUser | null> {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const u = rows[0];
  return u ? toPublicUser(u) : null;
}

export interface UpdateUserInput {
  displayName?: string;
  companyName?: string;
}

/**
 * Self-update for /me. The scope wrapper does not let one user mutate
 * `public."user"` rows other than their own — only `display_name` /
 * `company_name` / `updated_at` are GRANTed to `app_authenticated`,
 * and the `user_self_update` policy further restricts the set to the
 * caller's row.
 */
export async function updateUser(
  db: Db,
  userId: string,
  input: UpdateUserInput,
): Promise<PublicUser | null> {
  await db
    .update(schema.users)
    .set({
      ...(input.displayName != null ? { displayName: input.displayName } : {}),
      ...(input.companyName != null ? { companyName: input.companyName } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(schema.users.id, userId));
  return fetchUser(db, userId);
}

export interface UsageMonth {
  month: string;
  reports: number;
  voiceNotes: number;
}

export interface UsageTokenMonth {
  month: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
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

function roundSeconds(v: number | string): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 1000) / 1000;
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

function encodeUsageCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}

function decodeUsageCursor(c: string): { createdAt: string; id: string } {
  const raw = Buffer.from(c, 'base64url').toString('utf8');
  const [createdAt, id] = raw.split('|');
  if (!createdAt || !id) throw new Error('invalid cursor');
  return { createdAt, id };
}

export async function listUsageEvents(
  db: Db,
  userId: string,
  input: ListUsageEventsInput,
): Promise<{ items: UsageEventRow[]; nextCursor: string | null }> {
  const { cursor, limit, operation, vendor } = input;
  const overFetch = limit + 1;

  const operationFilter = operation
    ? sql`AND operation = ${operation}::app.llm_operation`
    : sql``;
  const vendorFilter = vendor ? sql`AND vendor = ${vendor}` : sql``;

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

  let result;
  if (cursor) {
    const { createdAt, id } = decodeUsageCursor(cursor);
    result = await db.execute<Row>(sql`
      SELECT id, created_at, vendor, model, operation,
             input_tokens::text, output_tokens::text, cached_tokens::text,
             input_seconds::text AS input_seconds,
             latency_ms::text, fixture_mode, status,
             project_id, report_id
      FROM app.llm_usage_events
      WHERE user_id = ${userId}
        AND (created_at, id) < (${createdAt}::timestamptz, ${id})
        ${operationFilter}
        ${vendorFilter}
      ORDER BY created_at DESC, id DESC
      LIMIT ${overFetch}
    `);
  } else {
    result = await db.execute<Row>(sql`
      SELECT id, created_at, vendor, model, operation,
             input_tokens::text, output_tokens::text, cached_tokens::text,
             input_seconds::text AS input_seconds,
             latency_ms::text, fixture_mode, status,
             project_id, report_id
      FROM app.llm_usage_events
      WHERE user_id = ${userId}
        ${operationFilter}
        ${vendorFilter}
      ORDER BY created_at DESC, id DESC
      LIMIT ${overFetch}
    `);
  }

  const rows = result.rows;
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  const items: UsageEventRow[] = slice.map((r) => ({
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
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeUsageCursor(new Date(last.created_at).toISOString(), last.id)
        : null,
  };
}

function toPublicUser(u: typeof schema.users.$inferSelect): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    companyName: u.companyName,
    createdAt: u.createdAt.toISOString(),
  };
}
