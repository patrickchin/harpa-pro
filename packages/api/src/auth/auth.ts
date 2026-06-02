/**
 * Better-auth server config for harpa-pro.
 *
 * - Email-OTP (Resend) is the user-facing sign-in path.
 * - emailAndPassword is enabled but gated by a `before` hook against
 *   `TEST_ACCOUNT_EMAILS` so only Doppler-allowlisted accounts can
 *   ever sign in via password — used by `scripts/journeys/*.sh` and
 *   the `:mock` build's e2e-password-login screen.
 * - Custom slug IDs (`usr_*`, `ses_*`, `vrf_*`, `idn_*`) are minted by
 *   `advanced.database.generateId({model})`.
 * - The `expo()` plugin handles bearer-header auth and the Expo
 *   `harpa://` scheme on `trustedOrigins`.
 *
 * See docs/v4/arch-auth-and-rls.md and
 * docs/superpowers/specs/2026-06-02-migrate-auth-to-better-auth-design.md.
 */
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { expo } from '@better-auth/expo';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { rawDb } from '../db/client.js';
import * as authSchema from '../db/auth-schema.js';
import { env } from '../env.js';
import { createResendClient } from '../lib/resend.js';
import { newId } from '../lib/ids.js';

const TEST_EMAILS = (env.TEST_ACCOUNT_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * Block password sign-ins whose email is not in the Doppler-only
 * `TEST_ACCOUNT_EMAILS` allowlist. Returns the same 401 shape
 * better-auth emits on a wrong password so allowlist membership
 * doesn't leak.
 */
const allowlistGate = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== '/sign-in/email') return;
  const email = String(
    (ctx.body as { email?: unknown } | undefined)?.email ?? '',
  ).toLowerCase();
  if (TEST_EMAILS.length === 0 || !TEST_EMAILS.includes(email)) {
    throw new APIError('UNAUTHORIZED', { message: 'Invalid credentials' });
  }
  ctx.context.logger?.info?.(`test_account_password_login_attempt: ${email}`);
});

const options = {
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  database: drizzleAdapter(rawDb(), { provider: 'pg', schema: authSchema }),

  trustedOrigins: [
    'harpa://',
    'harpa://*',
    ...(env.NODE_ENV === 'development'
      ? ['exp://', 'exp://**']
      : []),
  ],

  advanced: {
    database: {
      generateId: ({ model }) => {
        if (model === 'user') return newId('usr');
        if (model === 'session') return newId('ses');
        if (model === 'verification') return newId('vrf');
        if (model === 'account') return newId('idn');
        return crypto.randomUUID();
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days, matches old TTL
    updateAge: 60 * 60 * 24,     // refresh once per day on use
  },

  user: {
    additionalFields: {
      displayName: { type: 'string',  required: false, defaultValue: null },
      companyName: { type: 'string',  required: false, defaultValue: null },
      isAdmin:     { type: 'boolean', required: false, defaultValue: false, input: false },
      plan:        { type: 'string',  required: false, defaultValue: 'free', input: false },
    },
  },

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    autoSignIn: false,
  },

  databaseHooks: {
    user: {
      create: {
        before: async (_user, ctx) => {
          // Belt-and-braces: fail loudly if anything tries to create a
          // password user via the public sign-up endpoint. The seed
          // script bypasses this hook by calling the Drizzle adapter
          // directly — see scripts/seed-test-account.ts.
          if (ctx?.context?.path === '/sign-up/email') {
            throw new APIError('FORBIDDEN', { message: 'sign-up disabled' });
          }
        },
      },
    },
  },

  hooks: {
    before: allowlistGate,
  },

  plugins: [
    expo(),
    emailOTP({
      otpLength: 6,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      disableSignUp: false, // first verify creates the user
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (env.EMAIL_OTP_LIVE !== '1') {
          // Fake mode: do not send. The OTP is persisted to
          // public.verification by the plugin; :mock + Maestro flows
          // read it via POST /api/dev/last-otp.
          return;
        }
        const resend = createResendClient();
        await resend.send({
          from: env.WAITLIST_FROM_EMAIL,
          to: email,
          subject:
            type === 'sign-in'
              ? 'Your Harpa Pro sign-in code'
              : 'Your Harpa Pro verification code',
          text: `Your code is: ${otp}\n\nIt expires in 10 minutes.`,
          html: `<p>Your code is: <strong>${otp}</strong></p><p>It expires in 10 minutes.</p>`,
        });
      },
    }),
  ],
} satisfies BetterAuthOptions;

export const auth = betterAuth(options);
export type Auth = typeof auth;
