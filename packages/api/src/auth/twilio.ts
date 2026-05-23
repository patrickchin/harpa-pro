/**
 * Twilio Verify wrapper.
 *
 * Live mode is gated by the `twilio-live` PostHog flag (preferred) with
 * fallback to the legacy `TWILIO_LIVE=1` env var. See
 * docs/v4/arch-analytics.md — the env var is scheduled to be removed
 * from Doppler once the flag is set in PostHog for prod and dev.
 *
 * - live → real Twilio Verify REST API call.
 * - fake (default) → any code matching `TWILIO_VERIFY_FAKE_CODE`
 *   (default `000000`) is accepted. Used by tests and `:mock` builds.
 */
import { env } from '../env.js';
import { liveToggle } from '../lib/flags.js';
import { BOOLEAN_FLAGS } from '@harpa/analytics-events';

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
  if (!liveToggle(BOOLEAN_FLAGS.TWILIO_LIVE, env.TWILIO_LIVE)) return fakeTwilio();
  // Flag says live but creds missing → fall back to fake with a warning
  // rather than crash the API. Pitfall 13 — the integration test for
  // this factory exercises both legs.
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_VERIFY_SID) {
    // eslint-disable-next-line no-console
    console.warn(
      '[twilio] live flag set but TWILIO_ACCOUNT_SID/AUTH_TOKEN/VERIFY_SID missing — falling back to fake mode',
    );
    return fakeTwilio();
  }
  return liveTwilio(fetchImpl);
}

function fakeTwilio(): TwilioClient {
  return {
    async start(phone: string) {
      return { verificationId: `fake-${phone}` };
    },
    async check(_phone, code) {
      return { approved: code === env.TWILIO_VERIFY_FAKE_CODE };
    },
  };
}

function liveTwilio(fetchImpl: typeof fetch): TwilioClient {
  const sid = env.TWILIO_ACCOUNT_SID!;
  const token = env.TWILIO_AUTH_TOKEN!;
  const verifySid = env.TWILIO_VERIFY_SID!;
  const authHeader = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
  const base = `https://verify.twilio.com/v2/Services/${verifySid}`;

  return {
    async start(phone: string) {
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
