/**
 * /auth/* routes — phone-OTP via Twilio Verify.
 *
 * These run *outside* the per-request scope because they need to upsert
 * `auth.users` and insert into `auth.sessions` before the user has a
 * session at all. They use a `rawDb` handle scoped explicitly to
 * `auth.*` writes; per-request scope kicks in on the next request via
 * `withAuth`.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { auth as authSchemas } from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { rawDb } from '../db/client.js';
import { startOtp, verifyOtp, logout, issueSessionForPhone, OtpVerificationError } from '../auth/service.js';
import { createTwilioClient } from '../auth/twilio.js';
import { withAuth } from '../middleware/auth.js';
import { isPasswordBypassEnabled, verifyTestPassword } from '../auth/password.js';
import { withRateLimit } from '../middleware/rateLimit.js';

const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  requestId: z.string().optional(),
});

export const authRoutes = new OpenAPIHono<AppEnv>();

// SMS-pumping protection on /auth/otp/* (docs/v4/arch-rate-limiting.md §3.3).
// Twilio Verify charges per SMS — leaving these routes unlimited is a
// money-burn DoS vector. Both layers (per-phone + per-IP) MUST trip
// before any provider call is made.
const MIN = 60_000;
const HOUR = 60 * MIN;
const QUARTER_HOUR = 15 * MIN;

const otpStartPerPhone = withRateLimit({
  name: 'auth.otp.start',
  keyBy: 'phone',
  limit: 3,
  windowMs: QUARTER_HOUR,
});
const otpStartPerIp = withRateLimit({
  name: 'auth.otp.start',
  keyBy: 'ip',
  limit: 10,
  windowMs: HOUR,
});
const otpVerifyPerPhone = withRateLimit({
  name: 'auth.otp.verify',
  keyBy: 'phone',
  limit: 10,
  windowMs: QUARTER_HOUR,
});
const otpVerifyPerIp = withRateLimit({
  name: 'auth.otp.verify',
  keyBy: 'ip',
  limit: 30,
  windowMs: HOUR,
});
const passwordVerifyPerPhone = withRateLimit({
  name: 'auth.password.verify',
  keyBy: 'phone',
  limit: 10,
  windowMs: MIN,
});

authRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/auth/otp/start',
    tags: ['auth'],
    middleware: [otpStartPerIp, otpStartPerPhone] as const,
    request: {
      body: { content: { 'application/json': { schema: authSchemas.otpStartRequest } } },
    },
    responses: {
      200: { description: 'OTP sent.', content: { 'application/json': { schema: authSchemas.otpStartResponse } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorBody } } },
      429: { description: 'Rate limited.', content: { 'application/json': { schema: errorBody } } },
    },
  }),
  async (c) => {
    const { phone } = c.req.valid('json');
    const twilio = createTwilioClient();
    const result = await startOtp(twilio, rawDb(), phone);
    return c.json(result, 200);
  },
);

authRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/auth/otp/verify',
    tags: ['auth'],
    middleware: [otpVerifyPerIp, otpVerifyPerPhone] as const,
    request: {
      body: { content: { 'application/json': { schema: authSchemas.otpVerifyRequest } } },
    },
    responses: {
      200: { description: 'Verified.', content: { 'application/json': { schema: authSchemas.otpVerifyResponse } } },
      401: { description: 'Invalid code.', content: { 'application/json': { schema: errorBody } } },
      429: { description: 'Rate limited.', content: { 'application/json': { schema: errorBody } } },
    },
  }),
  async (c) => {
    const { phone, code } = c.req.valid('json');
    const twilio = createTwilioClient();
    try {
      const result = await verifyOtp(twilio, rawDb(), phone, code);
      return c.json(result, 200);
    } catch (err) {
      if (err instanceof OtpVerificationError) {
        throw new HTTPException(401, { message: err.message });
      }
      throw err;
    }
  },
);

authRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/auth/password/verify',
    tags: ['auth'],
    middleware: [passwordVerifyPerPhone] as const,
    description:
      'Test-account password bypass. Disabled (returns 404) unless TEST_ACCOUNT_PHONES + TEST_ACCOUNT_PASSWORD are configured on the server. See docs/v4/arch-auth-and-rls.md.',
    request: {
      body: { content: { 'application/json': { schema: authSchemas.passwordVerifyRequest } } },
    },
    responses: {
      200: { description: 'Verified.', content: { 'application/json': { schema: authSchemas.passwordVerifyResponse } } },
      401: { description: 'Invalid phone or password.', content: { 'application/json': { schema: errorBody } } },
      404: { description: 'Feature disabled.', content: { 'application/json': { schema: errorBody } } },
      429: { description: 'Rate limited.', content: { 'application/json': { schema: errorBody } } },
    },
  }),
  async (c) => {
    if (!isPasswordBypassEnabled()) {
      throw new HTTPException(404, { message: 'Not found.' });
    }

    const { phone, password } = c.req.valid('json');

    if (!verifyTestPassword(phone, password)) {
      // Generic 401 — do not reveal whether the phone is allow-listed.
      throw new HTTPException(401, { message: 'Invalid phone or password.' });
    }

    const result = await issueSessionForPhone(rawDb(), phone);
    // eslint-disable-next-line no-console -- intentional audit log
    console.info(
      JSON.stringify({
        level: 'info',
        msg: 'test_account_password_login',
        phone,
        userId: result.user.id,
        requestId: c.get('requestId'),
      }),
    );
    return c.json(result, 200);
  },
);

authRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/auth/logout',
    tags: ['auth'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    responses: {
      200: { description: 'Logged out.', content: { 'application/json': { schema: authSchemas.logoutResponse } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorBody } } },
    },
  }),
  async (c) => {
    const sid = c.get('sessionId');
    if (!sid) throw new HTTPException(401);
    await logout(rawDb(), sid);
    return c.json({ ok: true as const }, 200);
  },
);
