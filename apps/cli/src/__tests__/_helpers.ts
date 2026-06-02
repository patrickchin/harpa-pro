/**
 * Shared CLI integration-test helpers.
 *
 * Reads the latest better-auth OTP for an email straight from the
 * Postgres `verification` table — same approach as
 * `packages/api/src/__tests__/journeys/_login.ts`. We can't go through
 * the Maestro `dev/last-otp` endpoint here because the in-process app
 * doesn't mount it under the same path Fly does, but the value column
 * is identical (`<otp>:<extra>`).
 */
import { getPool } from '../../../../packages/api/src/db/client.js';

export async function readLatestOtp(email: string): Promise<string> {
  const pool = getPool();
  const r = await pool.query<{ value: string }>(
    `SELECT value FROM "verification" WHERE identifier LIKE $1 ORDER BY created_at DESC LIMIT 1`,
    [`%${email}%`],
  );
  if (r.rows.length === 0) throw new Error(`no verification row for ${email}`);
  const v = String(r.rows[0]!.value);
  return v.split(':')[0]!;
}
