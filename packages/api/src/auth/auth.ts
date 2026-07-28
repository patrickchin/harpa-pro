/**
 * better-auth server configuration.
 *
 * - Email-OTP via Resend (live or fake based on EMAIL_OTP_LIVE).
 * - Demo account access uses emailAndPassword for exact configured
 *   demo emails; normal users stay on email-OTP.
 * - emailAndPassword enabled but gated to TEST_ACCOUNT_EMAILS +
 *   DEMO_ACCOUNT_EMAILS via a before-hook.
 * - Custom slug IDs (usr_/ses_/vrf_/idn_) via advanced.database.generateId.
 * - expo() plugin owns the bearer/cookie storage flow used by the Expo
 *   client.
 *
 * See docs/v4/arch-auth-and-rls.md and
 * docs/superpowers/specs/2026-06-02-migrate-auth-to-better-auth-design.md.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP, bearer } from 'better-auth/plugins';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { expo } from '@better-auth/expo';
import { rawDb } from '../db/client.js';
import * as authSchema from '../db/auth-schema.js';
import { env } from '../env.js';
import { logEmailOtpPreview } from '../lib/email-diagnostics.js';
import { createResendClient } from '../lib/resend.js';
import { newId } from '../lib/ids.js';
import { recordActivityEvent } from '../services/activity-events.js';
import { captureApiException } from '../telemetry/sentry.js';

const TEST_EMAILS = (env.TEST_ACCOUNT_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const DEMO_ACCOUNT_EMAILS = (env.DEMO_ACCOUNT_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const PASSWORD_LOGIN_EMAILS = new Set([...TEST_EMAILS, ...DEMO_ACCOUNT_EMAILS]);

const ADMIN_WEB_ORIGINS = env.ADMIN_CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const FROM_EMAIL = 'Harpa Pro <noreply@harpapro.com>';
const OTP_SUBJECT = 'Your Harpa Pro sign-in code';

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
    ...ADMIN_WEB_ORIGINS,
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
        after: async (user, ctx) => {
          if (ctx?.path !== '/sign-in/email-otp') return;

          const incomingRequestId = ctx.request?.headers.get('x-request-id') ?? null;
          const requestId =
            incomingRequestId && /^[\w-]{6,128}$/.test(incomingRequestId)
              ? incomingRequestId
              : null;

          try {
            await recordActivityEvent(rawDb(), {
              eventType: 'user.signed_up',
              actorUserId: user.id,
              subjectId: user.id,
              projectId: null,
              requestId,
              dedupeKey: `user.signed_up:${user.id}`,
              metadata: { method: 'email_otp' },
            });
          } catch (error) {
            ctx.context.logger.error('Failed to record signup activity', error, {
              userId: user.id,
              requestId,
            });
            captureApiException(error, {
              requestId: requestId ?? 'signup-activity-hook',
              method: 'AUTH',
              route: 'user.create.after',
              status: 0,
            });
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
        if (PASSWORD_LOGIN_EMAILS.size === 0 || !PASSWORD_LOGIN_EMAILS.has(email)) {
          throw new APIError('UNAUTHORIZED', { message: 'Invalid credentials' });
        }
        if (DEMO_ACCOUNT_EMAILS.includes(email)) {
          logDemoAccountAttempt(email, 'password_attempt');
        } else {
          ctx.context.logger?.info?.(`test_account_password_login_attempt email=${email}`);
        }
        return;
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
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (env.EMAIL_OTP_LIVE !== '1') {
          if (env.NODE_ENV !== 'test') {
            logEmailOtpPreview({ recipient: email, type });
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

function logDemoAccountAttempt(email: string, outcome: string): void {
  if (env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    level: 'info',
    msg: 'demo_account_sign_in_attempt',
    email,
    outcome,
  }));
}
