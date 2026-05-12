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
import { startOtp, verifyOtp, logout, OtpVerificationError } from '../auth/service.js';
import { createTwilioClient } from '../auth/twilio.js';
import { withAuth } from '../middleware/auth.js';

const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  requestId: z.string().optional(),
});

export const authRoutes = new OpenAPIHono<AppEnv>();

authRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/auth/otp/start',
    tags: ['auth'],
    request: {
      body: { content: { 'application/json': { schema: authSchemas.otpStartRequest } } },
    },
    responses: {
      200: { description: 'OTP sent.', content: { 'application/json': { schema: authSchemas.otpStartResponse } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorBody } } },
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
    request: {
      body: { content: { 'application/json': { schema: authSchemas.otpVerifyRequest } } },
    },
    responses: {
      200: { description: 'Verified.', content: { 'application/json': { schema: authSchemas.otpVerifyResponse } } },
      401: { description: 'Invalid code.', content: { 'application/json': { schema: errorBody } } },
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
