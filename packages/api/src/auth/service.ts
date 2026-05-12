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
    .values({ phone, twilioVerificationSid: verificationId });
  return { verificationId };
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

  // Upsert user by phone.
  const existing = await db.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
  const user =
    existing[0] ??
    (await db
      .insert(schema.users)
      .values({ phone })
      .returning()
      .then((r) => r[0]));
  if (!user) throw new Error('user upsert failed');

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

  // Create session row.
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const sessionRows = await db
    .insert(schema.sessions)
    .values({ userId: user.id, expiresAt })
    .returning({ id: schema.sessions.id });
  const session = sessionRows[0];
  if (!session) throw new Error('session insert failed');

  const token = await signJwt({ sub: user.id, sid: session.id });
  return {
    token,
    user: toPublicUser(user),
  };
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
    WHERE id = ${userId}::uuid
  `);
  return fetchUser(db, userId);
}

export interface UsageMonth {
  month: string; // YYYY-MM
  reports: number;
  voiceNotes: number;
}

export interface UsageSummary {
  months: UsageMonth[];
  totals: { reports: number; voiceNotes: number };
}

/**
 * Per-month counts of reports authored + voice notes recorded by the
 * caller. All filters use `author_id = userId` so the RLS path on
 * `app.reports` / `app.notes` is what excludes other actors.
 */
export async function fetchUsage(db: Db, userId: string): Promise<UsageSummary> {
  const reportsRes = await db.execute<{ month: string; count: string }>(sql`
    SELECT to_char(created_at, 'YYYY-MM') AS month, count(*)::text AS count
    FROM app.reports
    WHERE author_id = ${userId}::uuid
    GROUP BY month
    ORDER BY month
  `);
  const notesRes = await db.execute<{ month: string; count: string }>(sql`
    SELECT to_char(created_at, 'YYYY-MM') AS month, count(*)::text AS count
    FROM app.notes
    WHERE author_id = ${userId}::uuid AND kind = 'voice'
    GROUP BY month
    ORDER BY month
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
  const totals = months.reduce(
    (acc, m) => ({ reports: acc.reports + m.reports, voiceNotes: acc.voiceNotes + m.voiceNotes }),
    { reports: 0, voiceNotes: 0 },
  );
  return { months, totals };
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
