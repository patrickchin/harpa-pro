/**
 * Auth service — phone-OTP flow.
 *
 * `startOtp` and `verifyOtp` are pure functions over a `TwilioClient` and a
 * raw drizzle handle, so they're easy to test without standing up Hono.
 * Route handlers in `src/routes/auth.ts` are thin wrappers around these.
 */
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { newId } from '../lib/ids.js';
import type { TwilioClient } from './twilio.js';
import { signJwt } from './jwt.js';

type Db = NodePgDatabase<typeof schema>;

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PublicUser {
  id: string;
  phone: string;
  displayName: string | null;
  companyName: string | null;
  createdAt: string;
}

export interface StartOtpResult {
  verificationId: string;
}

export interface VerifyOtpResult {
  token: string;
  user: PublicUser;
}

export async function startOtp(
  twilio: TwilioClient,
  db: Db,
  phone: string,
): Promise<StartOtpResult> {
  const { verificationId } = await twilio.start(phone);
  await db
    .insert(schema.verifications)
    .values({ id: newId('vrf'), phone, twilioVerificationSid: verificationId });
  return { verificationId };
}

/**
 * Upsert the user for `phone`, create a session row, and mint a JWT.
 * Shared by the OTP flow and the test-account password bypass — both
 * are equivalent once the caller has been authenticated by some other
 * means (Twilio OTP / shared password / future SSO).
 */
export async function issueSessionForPhone(
  db: Db,
  phone: string,
): Promise<VerifyOtpResult> {
  const existing = await db.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
  const user =
    existing[0] ??
    (await db
      .insert(schema.users)
      .values({ id: newId('usr'), phone })
      .returning()
      .then((r) => r[0]));
  if (!user) throw new Error('user upsert failed');

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const sessionRows = await db
    .insert(schema.sessions)
    .values({ id: newId('ses'), userId: user.id, expiresAt })
    .returning({ id: schema.sessions.id });
  const session = sessionRows[0];
  if (!session) throw new Error('session insert failed');

  const token = await signJwt({ sub: user.id, sid: session.id });
  return { token, user: toPublicUser(user) };
}

export async function verifyOtp(
  twilio: TwilioClient,
  db: Db,
  phone: string,
  code: string,
): Promise<VerifyOtpResult> {
  const { approved } = await twilio.check(phone, code);
  if (!approved) {
    throw new OtpVerificationError('otp_invalid', 'Invalid verification code.');
  }

  // Mark verification consumed (most recent unconsumed row for this phone).
  await db.execute(sql`
    UPDATE auth.verifications
    SET consumed_at = now()
    WHERE id = (
      SELECT id FROM auth.verifications
      WHERE phone = ${phone} AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    )
  `);

  return issueSessionForPhone(db, phone);
}

export async function logout(db: Db, sessionId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

export async function fetchUser(db: Db, userId: string): Promise<PublicUser | null> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const u = rows[0];
  return u ? toPublicUser(u) : null;
}

export interface UpdateUserInput {
  displayName?: string;
  companyName?: string;
}

/**
 * Self-update for /me. The scope wrapper does not let one user mutate
 * `auth.users` rows other than their own (only SELECT is granted on
 * `auth.users` to `app_authenticated`); this helper runs against a
 * pre-fetched id and returns the row through the scoped handle so the
 * RLS path stays exercised on writes.
 */
export async function updateUser(
  db: Db,
  userId: string,
  input: UpdateUserInput,
): Promise<PublicUser | null> {
  await db.execute(sql`
    UPDATE auth.users
    SET
      display_name = COALESCE(${input.displayName ?? null}, display_name),
      company_name = COALESCE(${input.companyName ?? null}, company_name),
      updated_at = now()
    WHERE id = ${userId}
  `);
  return fetchUser(db, userId);
}

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

/**
 * Per-month counts (reports + voice notes) AND per-month LLM token
 * totals + a per-(vendor,model,operation) breakdown across the full
 * window. All queries pin on `author_id = userId` / `user_id = userId`;
 * the RLS path on each table (`app.reports`, `app.notes`,
 * `app.llm_usage_events`) excludes other actors as defence-in-depth.
 *
 * Only `status='ok'` usage events count toward token totals — error
 * rows are recorded for postmortem visibility but shouldn't bill.
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

/** Round seconds to 3dp to match the column scale and avoid noisy floats. */
function roundSeconds(v: number | string): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 1000) / 1000;
}

export async function sessionIsValid(db: Db, sessionId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.sessions.id, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);
  const s = rows[0];
  if (!s) return false;
  return s.expiresAt.getTime() > Date.now();
}

function toPublicUser(u: typeof schema.users.$inferSelect): PublicUser {
  return {
    id: u.id,
    phone: u.phone,
    displayName: u.displayName,
    companyName: u.companyName,
    createdAt: u.createdAt.toISOString(),
  };
}

export class OtpVerificationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'OtpVerificationError';
  }
}
