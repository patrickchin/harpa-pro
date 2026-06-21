/**
 * One-shot script to ensure password-login accounts exist:
 * - emails in `TEST_ACCOUNT_EMAILS` use `TEST_ACCOUNT_PASSWORD`
 * - emails in `APP_REVIEW_EMAILS` use `APP_REVIEW_PASSWORD`
 *
 * Used by deploys. It no-ops when neither password-login group is
 * configured.
 *
 * Truly bypasses the `disableSignUp` guard by going through
 * better-auth's internal adapter (`internalAdapter.createUser` +
 * `internalAdapter.linkAccount({ providerId: 'credential', password })`)
 * — the same path `auth.api.signUpEmail` takes after its public
 * checks pass. This works deploy-time because we have direct access
 * to `auth.$context`; it cannot be triggered over HTTP because no
 * route exposes the internal adapter. The before-hook in
 * `auth/auth.ts` still gates which emails can ever sign in over HTTP.
 *
 * NOTE: `auth.api.signUpEmail()` does NOT bypass `disableSignUp`
 * (better-auth's sign-up route checks the flag at the very top
 * regardless of whether the call originates over HTTP or in-process).
 * The earlier version of this script claimed to bypass the guard but
 * actually called signUpEmail and crashed on dev for weeks; see
 * docs/bugs/2026-06-06-test-accounts-never-seeded-on-dev.md.
 *
 * See docs/superpowers/specs/2026-06-02-migrate-auth-to-better-auth-design.md
 * §Test-account smoke-test path.
 */
import { sql } from 'drizzle-orm';
import { auth } from '../src/auth/auth.js';
import { rawDb } from '../src/db/client.js';
import { env } from '../src/env.js';

type SeedGroup = {
  label: string;
  emails: string[];
  password: string;
  emailVerified: boolean;
};

async function ensureCredentialAccount(
  ctx: Awaited<typeof auth.$context>,
  userId: string,
  passwordHash: string,
): Promise<'created' | 'updated'> {
  const db = rawDb();
  const updated = await db.execute(sql`
    UPDATE public."account"
    SET
      account_id = ${userId},
      password = ${passwordHash},
      updated_at = now()
    WHERE user_id = ${userId}
      AND provider_id = 'credential'
  `);

  if ((updated.rowCount ?? 0) > 0) {
    return 'updated';
  }

  await ctx.internalAdapter.linkAccount({
    userId,
    providerId: 'credential',
    accountId: userId,
    password: passwordHash,
  });
  return 'created';
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function seedPasswordAccounts(input: SeedGroup): Promise<void> {
  const ctx = await auth.$context;

  for (const email of input.emails) {
    try {
      const existing = await ctx.internalAdapter.findUserByEmail(email);
      const passwordHash = await ctx.password.hash(input.password);

      if (existing?.user) {
        const action = await ensureCredentialAccount(ctx, existing.user.id, passwordHash);
        console.log(`[seed-test-account] ${input.label} ${email} user exists; credential ${action}`);
        continue;
      }

      const created = await ctx.internalAdapter.createUser({
        email,
        name: email,
        emailVerified: input.emailVerified,
      });
      if (!created) {
        throw new Error('createUser returned no user');
      }
      await ensureCredentialAccount(ctx, created.id, passwordHash);
      console.log(`[seed-test-account] created ${input.label} ${email}; credential created`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[seed-test-account] ${input.label} ${email}: ${msg}`);
      throw err;
    }
  }
}

async function main(): Promise<void> {
  const groups: SeedGroup[] = [];

  if (env.TEST_ACCOUNT_EMAILS && env.TEST_ACCOUNT_PASSWORD) {
    groups.push({
      label: 'test-account',
      emails: splitCsv(env.TEST_ACCOUNT_EMAILS),
      password: env.TEST_ACCOUNT_PASSWORD,
      emailVerified: false,
    });
  }

  if (env.APP_REVIEW_EMAILS && env.APP_REVIEW_PASSWORD) {
    groups.push({
      label: 'app-review',
      emails: splitCsv(env.APP_REVIEW_EMAILS),
      password: env.APP_REVIEW_PASSWORD,
      emailVerified: true,
    });
  }

  const configuredGroups = groups.filter((group) => group.emails.length > 0);

  if (configuredGroups.length === 0) {
    console.log('[seed-test-account] no password accounts configured; skipping');
    return;
  }

  for (const group of configuredGroups) {
    await seedPasswordAccounts(group);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
