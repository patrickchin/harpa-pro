/**
 * Sign-in / Sign-out flows for the v2 TUI.
 *
 * Sign-in is a single guided flow:
 *   1. ask phone
 *   2. POST /auth/otp/start
 *   3. ask code
 *   4. POST /auth/otp/verify  → bearer token
 *   5. GET /me                → fill SessionUser
 *   6. session.setAuth(creds, user)  → 0600 on disk + state=authed
 *
 * No setTimeout, no fire-and-forget. Every API call goes through
 * performRequest so the same error rendering as the leaves applies.
 *
 * Sign-out:
 *   1. confirm
 *   2. POST /auth/logout (best-effort — server errors don't block the
 *      local intent)
 *   3. session.clearAuth('logged-out')
 *
 * Tested at the behaviour level in TUI-app.4 by driving the scripted
 * prompter against the in-process Hono app + Twilio fixtures (the
 * existing pattern from auth integration tests).
 */
import chalk from 'chalk';
import { createApiClient } from '../../lib/client.js';
import { performRequest } from '../../lib/run.js';
import type { Flow, FlowResult } from '../flow.js';
import { stay } from '../flow.js';
import { defaultValidateToken } from '../state.js';
import type { StoredCredentials } from '../credentials.js';

const PHONE_PLACEHOLDER = '+15551234567';
const PHONE_RE = /^\+[1-9]\d{6,14}$/;
const CODE_RE = /^\d{4,8}$/;

function validatePhone(s: string): string | undefined {
  return PHONE_RE.test(s.trim()) ? undefined : 'Must be E.164 format, e.g. +15551234567';
}
function validateCode(s: string): string | undefined {
  return CODE_RE.test(s.trim()) ? undefined : 'Must be 4–8 digits';
}

export const signInFlow: Flow = {
  id: 'sign-in',
  label: 'Sign in',
  hint: 'Phone + OTP',
  visibleIn: ['auth'],
  async run({ prompter, session }): Promise<FlowResult> {
    const apiUrl = session.effectiveEnv().HARPA_API_URL;
    if (!apiUrl) {
      prompter.log.error('No API URL set. Pick "Set API URL" first.');
      return stay;
    }

    const phone = await prompter.text({
      label: 'Phone',
      placeholder: PHONE_PLACEHOLDER,
      validate: validatePhone,
    });
    if (prompter.isCancel(phone)) return stay;

    const startClient = createApiClient({
      HARPA_API_URL: apiUrl,
      HARPA_DEBUG: '0',
    });
    const startOutcome = await performRequest(() =>
      startClient.POST('/auth/otp/start', { body: { phone: phone.trim() } }),
    );
    if (startOutcome.kind !== 'ok') {
      prompter.log.error(formatOutcomeError(startOutcome, 'POST /auth/otp/start'));
      return stay;
    }
    prompter.log.success(`Code sent to ${phone.trim()}`);

    // Up to 3 verify attempts before bailing back to the auth menu.
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = await prompter.text({
        label: 'OTP code',
        placeholder: '123456',
        validate: validateCode,
      });
      if (prompter.isCancel(code)) return stay;

      const verifyOutcome = await performRequest(() =>
        startClient.POST('/auth/otp/verify', {
          body: { phone: phone.trim(), code: code.trim() },
        }),
      );
      if (verifyOutcome.kind !== 'ok') {
        const last = attempt === 2;
        prompter.log.error(
          `${formatOutcomeError(verifyOutcome, 'POST /auth/otp/verify')}` +
            (last ? '' : ' — try again'),
        );
        if (last) return stay;
        continue;
      }

      const data = verifyOutcome.data as {
        token: string;
        user: { id: string; phone?: string; displayName?: string | null };
      };
      // Validate the token end-to-end via /me — caches the user too.
      const me = await defaultValidateToken({ apiUrl, token: data.token });
      if (me.kind !== 'ok') {
        prompter.log.error(
          me.kind === 'unauthorized'
            ? 'Server accepted the OTP but rejected the token at /me. Please try again.'
            : `Could not load /me: ${me.message}`,
        );
        return stay;
      }

      const creds: StoredCredentials = {
        version: 1,
        apiUrl,
        token: data.token,
        userId: data.user.id,
        ...(data.user.phone ? { phone: data.user.phone } : {}),
        ...(data.user.displayName ? { displayName: data.user.displayName } : {}),
        savedAt: new Date().toISOString(),
      };
      await session.setAuth(creds, me.user);
      const who = me.user.displayName ?? data.user.phone ?? me.user.userId;
      prompter.log.success(
        `${chalk.green('✓')} Signed in as ${chalk.bold(who)} (credentials saved to ${session.credentials.path})`,
      );
      return stay;
    }
    return stay;
  },
};

export const signOutFlow: Flow = {
  id: 'sign-out',
  label: 'Sign out',
  hint: 'Clear local credentials and revoke the server token',
  visibleIn: ['authed'],
  async run({ prompter, session }): Promise<FlowResult> {
    const confirmed = await prompter.confirm({
      label: 'Sign out and delete the local credentials file?',
      default: false,
    });
    if (prompter.isCancel(confirmed) || !confirmed) return stay;

    const env = session.effectiveEnv();
    if (env.HARPA_TOKEN) {
      const client = createApiClient(env);
      const outcome = await performRequest(() => client.POST('/auth/logout', {}));
      if (outcome.kind !== 'ok') {
        // Local sign-out is the user's intent — surface but don't block.
        prompter.log.warn(
          `Server rejected sign-out (${formatOutcomeError(outcome, 'POST /auth/logout')}); clearing local credentials anyway.`,
        );
      }
    }
    await session.clearAuth('logged-out');
    prompter.log.success('Signed out. Local credentials cleared.');
    return stay;
  },
};

function formatOutcomeError(
  outcome: Awaited<ReturnType<typeof performRequest>>,
  label: string,
): string {
  if (outcome.kind === 'apiError') {
    const code = outcome.body?.error?.code ?? `HTTP ${outcome.status}`;
    const msg = outcome.body?.error?.message ?? '';
    return `${label} → ${code}${msg ? `: ${msg}` : ''}`;
  }
  if (outcome.kind === 'transport') {
    return `${label} → ${(outcome.error as Error).message ?? 'transport error'}`;
  }
  if (outcome.kind === 'missingToken') {
    return `${label} → no token in env (state machine bug?)`;
  }
  return `${label} → unknown outcome`;
}
