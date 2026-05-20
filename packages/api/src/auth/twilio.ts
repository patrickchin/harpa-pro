/**
 * Twilio Verify wrapper.
 *
 * - `TWILIO_LIVE=1` → real Twilio Verify REST API call.
 * - `TWILIO_LIVE=0` (default) → fake mode: any code matching
 *   `TWILIO_VERIFY_FAKE_CODE` (default `000000`) is accepted. Used by
 *   tests and `:mock` builds. Refused at boot in production by env.ts.
 *   Resolves Pitfall 5.
 *
 * In BOTH modes, if `SMOKE_TEST_PHONE` + `SMOKE_TEST_CODE` are set,
 * that one (phone, code) pair short-circuits to "approved" without any
 * Twilio API call. Lets the post-deploy smoke journey authenticate
 * against a live prod API without sending real SMS.
 */
import { env } from '../env.js';

/**
 * Returns true iff `phone` is the smoke-test phone. start() uses this
 * to skip the Verify "send SMS" call so a smoke run doesn't burn
 * Twilio quota on a number nobody owns.
 */
export function isSmokePhone(
  phone: string,
  smokePhone: string | undefined = env.SMOKE_TEST_PHONE,
): boolean {
  return !!smokePhone && phone === smokePhone;
}

/**
 * Returns true iff (phone, code) is the configured smoke pair.
 * Returns false (not null) when the phone matches the smoke phone but
 * the code is wrong — i.e. the smoke phone has exactly one valid code
 * and never falls back to the regular Twilio path. Otherwise returns
 * null meaning "not a smoke request, handle normally".
 *
 * Exported with explicit args so tests can exercise it without
 * mutating process.env (env.ts is parsed once at import time).
 */
export function checkSmokeBackdoor(
  phone: string,
  code: string,
  smokePhone: string | undefined = env.SMOKE_TEST_PHONE,
  smokeCode: string | undefined = env.SMOKE_TEST_CODE,
): boolean | null {
  if (!smokePhone || !smokeCode) return null;
  if (phone !== smokePhone) return null;
  return code === smokeCode;
}

export interface VerifyStartResult {
  verificationId: string; // sid in live mode, deterministic stub in fake mode
}

export interface VerifyCheckResult {
  approved: boolean;
}

export interface TwilioClient {
  start(phone: string): Promise<VerifyStartResult>;
  check(phone: string, code: string): Promise<VerifyCheckResult>;
}

export function createTwilioClient(fetchImpl: typeof fetch = fetch): TwilioClient {
  if (env.TWILIO_LIVE !== '1') return fakeTwilio();
  return liveTwilio(fetchImpl);
}

function fakeTwilio(): TwilioClient {
  return {
    async start(phone: string) {
      return { verificationId: `fake-${phone}` };
    },
    async check(phone, code) {
      const smoke = checkSmokeBackdoor(phone, code);
      if (smoke !== null) return { approved: smoke };
      return { approved: code === env.TWILIO_VERIFY_FAKE_CODE };
    },
  };
}

function liveTwilio(fetchImpl: typeof fetch): TwilioClient {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const verifySid = env.TWILIO_VERIFY_SID;
  if (!sid || !token || !verifySid) {
    throw new Error('TWILIO_LIVE=1 but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_VERIFY_SID missing');
  }
  const authHeader = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
  const base = `https://verify.twilio.com/v2/Services/${verifySid}`;

  return {
    async start(phone: string) {
      // Skip the real Twilio "send SMS" for the smoke phone — there is
      // no actual handset to receive it, and it would burn Verify quota.
      if (isSmokePhone(phone)) return { verificationId: `smoke-${phone}` };
      const body = new URLSearchParams({ To: phone, Channel: 'sms' });
      const res = await fetchImpl(`${base}/Verifications`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) throw new Error(`twilio start ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { sid: string };
      return { verificationId: json.sid };
    },
    async check(phone, code) {
      const smoke = checkSmokeBackdoor(phone, code);
      if (smoke !== null) return { approved: smoke };
      const body = new URLSearchParams({ To: phone, Code: code });
      const res = await fetchImpl(`${base}/VerificationCheck`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) throw new Error(`twilio check ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { status: string };
      return { approved: json.status === 'approved' };
    },
  };
}
