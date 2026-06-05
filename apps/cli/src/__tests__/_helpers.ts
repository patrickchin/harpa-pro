/**
 * Shared CLI integration-test helpers.
 *
 * Reads the latest better-auth OTP for an email straight from the
 * Postgres `verification` table — same approach as
 * `packages/api/src/__tests__/journeys/_login.ts`. We can't go through
 * the dev `/api/dev/last-otp` HTTP route here because the in-process
 * app doesn't share its mount with the Fly deployment, but the
 * `value` column shape is identical (`<otp>:<extra>`).
 *
 * Identifier format is fixed by better-auth's emailOtp plugin:
 *   `${type}-otp-${email}` (see node_modules/better-auth/dist/plugins/email-otp/utils.mjs).
 * For the sign-in flow the type is `'sign-in'`, so we look up the row
 * with an exact equality match — never `LIKE %email%`. Wildcard
 * patterns enable two failure modes that bit us before:
 *   1. Wildcard injection — `email = '%@e2e.harpapro.com'` matches
 *      every test user's row at once.
 *   2. Substring oracle — `alice@e2e.harpapro.com` matches a row whose
 *      identifier is `sign-in-otp-bob+alice@e2e.harpapro.com.evil`,
 *      letting one test trample another's OTP.
 * See docs/bugs/README.md §OTP introspection LIKE wildcard.
 */
import { getPool } from '../../../../packages/api/src/db/client.js';

const VERIFICATION_TYPE = 'sign-in';

export async function readLatestOtp(email: string): Promise<string> {
  const pool = getPool();
  const identifier = `${VERIFICATION_TYPE}-otp-${email}`;
  const r = await pool.query<{ value: string }>(
    `SELECT value FROM "verification" WHERE identifier = $1 ORDER BY created_at DESC LIMIT 1`,
    [identifier],
  );
  if (r.rows.length === 0) throw new Error(`no verification row for ${email}`);
  const v = String(r.rows[0]!.value);
  return v.split(':')[0]!;
}
