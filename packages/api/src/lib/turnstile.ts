/**
 * Cloudflare Turnstile verification.
 *
 * - `TURNSTILE_LIVE=1` → real siteverify call.
 * - `TURNSTILE_LIVE=0` (default) → fake mode: any non-empty token is
 *   accepted. This is what `docker compose up` and `:mock` builds run
 *   with, so the marketing site's Cloudflare test-key widget (which
 *   issues real-format tokens like `XXXX.DUMMY.TOKEN.XXXX`) can hit
 *   the API end-to-end. Empty tokens are still rejected — an empty
 *   token means the caller forgot to wire the widget, which is a
 *   bug, not abuse. Integration tests that want to assert the
 *   failure path inject `alwaysFailTurnstile()` via
 *   `setWaitlistClients({ turnstile })`.
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

export function fakeTurnstile(): TurnstileClient {
  return {
    async verify(token) {
      if (typeof token === 'string' && token.length > 0) {
        return { success: true };
      }
      return { success: false, errorCodes: ['fake-empty-token'] };
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
