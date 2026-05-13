/**
 * Cloudflare Turnstile verification.
 *
 * - `TURNSTILE_LIVE=1` → real siteverify call.
 * - `TURNSTILE_LIVE=0` (default) → fake mode: any non-empty token
 *   starting with `tt-` is accepted; anything else fails. Used by
 *   tests and `:mock` builds. Mirrors the Twilio fake pattern in
 *   src/auth/twilio.ts.
 *
 * See https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
import { env } from '../env.js';

export interface TurnstileVerifyResult {
  success: boolean;
  /** Cloudflare error codes, useful for logging. */
  errorCodes?: string[];
}

export interface TurnstileClient {
  verify(token: string, ip?: string): Promise<TurnstileVerifyResult>;
}

export function createTurnstileClient(fetchImpl: typeof fetch = fetch): TurnstileClient {
  if (env.TURNSTILE_LIVE !== '1') return fakeTurnstile();
  return liveTurnstile(fetchImpl);
}

function fakeTurnstile(): TurnstileClient {
  return {
    async verify(token) {
      // Accept any token starting with `tt-` in fake mode. Reject empty
      // strings; an empty token in fake mode means the caller forgot
      // to wire the widget (test failure, not abuse).
      if (typeof token === 'string' && token.startsWith('tt-')) {
        return { success: true };
      }
      return { success: false, errorCodes: ['fake-rejected'] };
    },
  };
}

function liveTurnstile(fetchImpl: typeof fetch): TurnstileClient {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new Error('TURNSTILE_LIVE=1 but TURNSTILE_SECRET_KEY missing');
  }
  return {
    async verify(token: string, ip?: string) {
      const body = new URLSearchParams({ secret, response: token });
      if (ip) body.set('remoteip', ip);
      const res = await fetchImpl(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
        },
      );
      if (!res.ok) {
        return { success: false, errorCodes: [`http-${res.status}`] };
      }
      const json = (await res.json()) as {
        success: boolean;
        'error-codes'?: string[];
      };
      return {
        success: json.success === true,
        errorCodes: json['error-codes'],
      };
    },
  };
}
