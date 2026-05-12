/**
 * Twilio Verify wrapper.
 *
 * - `TWILIO_LIVE=1` → real Twilio Verify REST API call.
 * - `TWILIO_LIVE=0` (default) → fake mode: any code matching
 *   `TWILIO_VERIFY_FAKE_CODE` (default `000000`) is accepted. Used by
 *   tests and `:mock` builds. Resolves Pitfall 5.
 */
import { env } from '../env.js';

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
    async check(_phone, code) {
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
