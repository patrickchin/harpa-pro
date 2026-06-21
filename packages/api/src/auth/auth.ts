/**
 * better-auth server configuration.
 *
 * - Email-OTP via Resend (live or fake based on EMAIL_OTP_LIVE).
 * - App Store Review access uses the same email-OTP send + sign-in
 *   endpoints, but the exact configured reviewer email receives a
 *   static server-side 12-digit code.
 * - emailAndPassword enabled but gated to TEST_ACCOUNT_EMAILS allowlist
 *   via a before-hook (test-account smoke-test bypass).
 * - Custom slug IDs (usr_/ses_/vrf_/idn_) via advanced.database.generateId.
 * - expo() plugin owns the bearer/cookie storage flow used by the Expo
 *   client.
 *
 * See docs/v4/arch-auth-and-rls.md and
 * docs/superpowers/specs/2026-06-02-migrate-auth-to-better-auth-design.md.
 */
import { createHash } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP, bearer } from 'better-auth/plugins';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { expo } from '@better-auth/expo';
import { rawDb } from '../db/client.js';
import * as authSchema from '../db/auth-schema.js';
import { env } from '../env.js';
import { createResendClient } from '../lib/resend.js';
import { newId } from '../lib/ids.js';

const TEST_EMAILS = (env.TEST_ACCOUNT_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const FROM_EMAIL = 'Harpa Pro <noreply@harpapro.com>';
const OTP_SUBJECT = 'Your Harpa Pro sign-in code';
const APP_REVIEW_CODE_LENGTH = 12;
const APP_REVIEW_CODE_REGEX = /^\d{12}$/;

const resend = createResendClient();

const dbProxy = new Proxy({} as ReturnType<typeof rawDb>, {
  get(_, prop, receiver) {
    return Reflect.get(rawDb(), prop, receiver);
  },
});

/**
 * `$context` exposes better-auth's internal adapter and password
 * helpers. It is the documented escape hatch (see
 * `node_modules/better-auth/dist/auth/base.mjs` — the returned
 * object includes `$context: authContext`) used by deploy-time
 * scripts (e.g. `scripts/seed-test-account.ts`) that need to create
 * users while `emailAndPassword.disableSignUp` is `true`.
 *
 * We type only the surface we actually use; the runtime object
 * carries the full `AuthContext`.
 */
type AuthInternalContext = {
  internalAdapter: {
    findUserByEmail: (
      email: string,
    ) => Promise<{ user: { id: string } } | null | undefined>;
    createUser: (input: {
      email: string;
      name: string;
      emailVerified: boolean;
    }) => Promise<{ id: string } | null | undefined>;
    linkAccount: (input: {
      userId: string;
      providerId: string;
      accountId: string;
      password: string;
    }) => Promise<unknown>;
  };
  password: {
    hash: (password: string) => Promise<string>;
  };
};

type BetterAuthInstance = {
  handler: (req: Request) => Promise<Response>;
  api: {
    getSession: (input: {
      headers: Headers;
    }) => Promise<{
      session: { id: string; userId: string };
      user: { id: string };
    } | null>;
    signUpEmail: (input: {
      body: {
        email: string;
        password: string;
        name?: string;
      };
    }) => Promise<unknown>;
  };
  $context: Promise<AuthInternalContext>;
};

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  database: drizzleAdapter(dbProxy, {
    provider: 'pg',
    schema: authSchema,
    usePlural: false,
  }),

  trustedOrigins: [
    'harpa://',
    'harpa://*',
    ...(env.NODE_ENV === 'development'
      ? ['exp://', 'exp://**', 'exp://192.168.*.*:*/**']
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
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },

  user: {
    additionalFields: {
      displayName: { type: 'string', required: false, defaultValue: null },
      companyName: { type: 'string', required: false, defaultValue: null },
      isAdmin: { type: 'boolean', required: false, defaultValue: false, input: false },
      plan: { type: 'string', required: false, defaultValue: 'free', input: false },
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
          if (ctx?.path === '/sign-up/email') {
            throw new APIError('FORBIDDEN', { message: 'sign-up disabled' });
          }
        },
      },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/sign-in/email') {
        const body = (ctx.body ?? {}) as { email?: unknown };
        const email = String(body.email ?? '').toLowerCase();
        if (TEST_EMAILS.length === 0 || !TEST_EMAILS.includes(email)) {
          throw new APIError('UNAUTHORIZED', { message: 'Invalid credentials' });
        }
        ctx.context.logger?.info?.(`test_account_password_login_attempt email=${email}`);
        return;
      }

      if (ctx.path === '/sign-in/email-otp') {
        const body = (ctx.body ?? {}) as { email?: unknown; otp?: unknown };
        const email = String(body.email ?? '').trim().toLowerCase();
        const otpLength = String(body.otp ?? '').trim().length;
        if (isConfiguredAppReviewEmail(email)) {
          logAppReviewAttempt(email, 'verify_attempt');
        } else if (otpLength === APP_REVIEW_CODE_LENGTH) {
          logAppReviewAttempt(email, 'email_mismatch');
        }
      }
    }),
  },

  plugins: [
    expo(),
    bearer(),
    emailOTP({
      otpLength: 6,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      disableSignUp: false,
      generateOTP: ({ email, type }) => {
        if (type === 'sign-in' && isConfiguredAppReviewEmail(email)) {
          logAppReviewAttempt(email, 'static_code_generated');
          return env.APP_REVIEW_CODE;
        }
        return undefined;
      },
      storeOTP: {
        hash: async (otp) => {
          // Better Auth applies storeOTP globally. Keep normal 6-digit OTPs
          // readable for dev/Maestro introspection, but avoid persisting the
          // static 12-digit review code in plaintext.
          if (APP_REVIEW_CODE_REGEX.test(otp)) return sha256Hex(otp);
          return otp;
        },
      },
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (isConfiguredAppReviewEmail(email)) {
          logAppReviewAttempt(email, 'send_code_suppressed');
          return;
        }
        if (env.EMAIL_OTP_LIVE !== '1') {
          if (env.NODE_ENV !== 'test') {
            // eslint-disable-next-line no-console
            console.log(`[emailOTP/fake] → ${email} (${type}): ${otp}`);
          }
          return;
        }
        await resend.send({
          from: FROM_EMAIL,
          to: email,
          subject: OTP_SUBJECT,
          text: `Your sign-in code is: ${otp}\n\nIt expires in 10 minutes.\nIf you didn't request this, you can ignore this email.`,
          html: `<p>Your sign-in code is: <strong>${otp}</strong></p><p>It expires in 10 minutes.</p><p>If you didn't request this, you can ignore this email.</p>`,
        });
      },
    }),
  ],
}) as unknown as BetterAuthInstance;

export type Auth = typeof auth;

function isAppReviewConfigured(): boolean {
  return !!env.APP_REVIEW_EMAIL && !!env.APP_REVIEW_CODE;
}

function isConfiguredAppReviewEmail(email: string): boolean {
  return isAppReviewConfigured()
    && email.trim().toLowerCase() === env.APP_REVIEW_EMAIL!.toLowerCase();
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function logAppReviewAttempt(email: string, outcome: string): void {
  if (env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    level: 'info',
    msg: 'app_review_sign_in_attempt',
    email,
    outcome,
  }));
}
