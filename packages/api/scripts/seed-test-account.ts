/**
 * One-shot script to ensure each email in `TEST_ACCOUNT_EMAILS`
 * exists as a better-auth user with `TEST_ACCOUNT_PASSWORD` set.
 *
 * Used by the dev deploy: production has both env vars unset so this
 * script no-ops.
 *
 * Bypasses the `disableSignUp` guard intentionally — we run as a
 * deploy-time script, not over HTTP. The before-hook in
 * `auth/auth.ts` still gates which emails can ever sign in with
 * password.
 *
 * See docs/superpowers/specs/2026-06-02-migrate-auth-to-better-auth-design.md
 * §Test-account smoke-test path.
 */
import { auth } from '../src/auth/auth.js';
import { env } from '../src/env.js';

async function main(): Promise<void> {
  if (!env.TEST_ACCOUNT_EMAILS || !env.TEST_ACCOUNT_PASSWORD) {
    console.log('[seed-test-account] no TEST_ACCOUNT_EMAILS configured; skipping');
    return;
  }

  const emails = env.TEST_ACCOUNT_EMAILS.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const email of emails) {
    try {
      await auth.api.signUpEmail({
        body: {
          email,
          password: env.TEST_ACCOUNT_PASSWORD,
          name: email,
        },
      });
      console.log(`[seed-test-account] created ${email}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already exists|USER_ALREADY_EXISTS|email.*exists/i.test(msg)) {
        console.log(`[seed-test-account] ${email} already exists`);
        continue;
      }
      console.error(`[seed-test-account] ${email}: ${msg}`);
      throw err;
    }
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
