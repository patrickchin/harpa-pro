/**
 * Resend transactional-email client.
 *
 * - `RESEND_LIVE=1` → real POST https://api.resend.com/emails.
 * - `RESEND_LIVE=0` (default) → fake mode: records the most recent
 *   send in-process so tests can assert on it. Mirrors the Twilio
 *   fake pattern in src/auth/twilio.ts.
 *
 * Subject lines and bodies are produced by callers (see
 * src/emails/waitlist-confirmation.tsx in M1.5).
 */
import { env } from '../env.js';

export interface EmailSendParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface EmailSendResult {
  /** Resend message id, or a `fake-` stub. */
  id: string;
}

export interface ResendClient {
  send(params: EmailSendParams): Promise<EmailSendResult>;
}

/** Fake-mode in-process record, used by tests. */
const fakeRecord: EmailSendParams[] = [];

export function getFakeResendSends(): readonly EmailSendParams[] {
  return fakeRecord;
}

export function resetFakeResendSends(): void {
  fakeRecord.length = 0;
}

export function createResendClient(fetchImpl: typeof fetch = fetch): ResendClient {
  if (env.RESEND_LIVE !== '1') return fakeResend();
  return liveResend(fetchImpl);
}

function fakeResend(): ResendClient {
  return {
    async send(params) {
      fakeRecord.push(params);
      return { id: `fake-${fakeRecord.length}` };
    },
  };
}

function liveResend(fetchImpl: typeof fetch): ResendClient {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_LIVE=1 but RESEND_API_KEY missing');
  }
  return {
    async send(params) {
      const from = params.from ?? env.WAITLIST_FROM_EMAIL;
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [params.to],
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });
      if (!res.ok) {
        throw new Error(`resend send ${res.status}: ${await res.text()}`);
      }
      const json = (await res.json()) as { id: string };
      return { id: json.id };
    },
  };
}
