import { createHash } from 'node:crypto';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../app.js';
import { env } from '../env.js';
import { clearAdminSessionCookie, setAdminSessionCookie } from '../lib/admin-cookie.js';
import { getAdminRateLimiter } from '../lib/adminRateLimiter.js';
import { adminAuthIpWindow, adminClientIp } from '../middleware/admin-rate-limit.js';
import { withAdminSession } from '../middleware/admin-session.js';
import {
  consumeRateLimit,
  rejectRateLimit,
  withRateLimit,
  type RateLimitOptions,
} from '../middleware/rateLimit.js';
import {
  authenticateAdmin,
  canonicalAdminEmail,
  revokeAdminSession,
} from '../services/admin-auth.js';

const MINUTE_MS = 60_000;
const FIFTEEN_MINUTES_MS = 15 * MINUTE_MS;
const LOGIN_FAILURE_FLOOR_MS = 300;
const ADMIN_LOGIN_MAX_BODY_BYTES = 8 * 1024;

const loginRequest = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
});

const authenticatedResponse = z.object({
  authenticated: z.literal(true),
  email: z.string(),
});

const signedOutResponse = z.object({
  authenticated: z.literal(false),
});

const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  requestId: z.string().optional(),
});

const trustedAdminOrigins = new Set(
  env.ADMIN_CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function withTrustedAdminOrigin(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const origin = c.req.header('origin');
    if (!origin || !trustedAdminOrigins.has(origin)) {
      audit(c, 'origin_rejected');
      throw new HTTPException(403, { message: 'Forbidden.' });
    }
    await next();
  };
}

async function canonicalEmailRateLimitKey(c: Context<AppEnv>): Promise<string> {
  try {
    const body = (await c.req.json()) as { email?: unknown };
    const email = typeof body.email === 'string' ? canonicalAdminEmail(body.email) : null;
    return email ? createHash('sha256').update(email).digest('hex') : 'invalid';
  } catch {
    return 'invalid';
  }
}

const loginIpWindow = withRateLimit({
  name: 'admin.auth.login.ip.15m',
  keyBy: adminClientIp,
  limit: 20,
  windowMs: FIFTEEN_MINUTES_MS,
  getLimiter: getAdminRateLimiter,
});

const loginEmailWindow: RateLimitOptions = {
  name: 'admin.auth.login.email.15m',
  keyBy: canonicalEmailRateLimitKey,
  limit: 5,
  windowMs: FIFTEEN_MINUTES_MS,
  getLimiter: getAdminRateLimiter,
};

const loginIpBurst = withRateLimit({
  name: 'admin.auth.login.ip.1m',
  keyBy: adminClientIp,
  limit: 3,
  windowMs: MINUTE_MS,
  getLimiter: getAdminRateLimiter,
});

const adminLoginBodyLimit = bodyLimit({
  maxSize: ADMIN_LOGIN_MAX_BODY_BYTES,
  onError: (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(
      {
        error: {
          code: 'payload_too_large',
          message: 'Request body is too large.',
        },
        requestId: c.get('requestId'),
      },
      413,
    );
  },
});

function audit(c: Context<AppEnv>, outcome: string, email?: string | null): void {
  console.info(
    '[admin-auth]',
    JSON.stringify({
      requestId: c.get('requestId'),
      ip: adminClientIp(c).slice(0, 128),
      email: email ?? undefined,
      outcome,
    }),
  );
}

async function waitForLoginFailureFloor(startedAt: number): Promise<void> {
  const remaining = LOGIN_FAILURE_FLOOR_MS - (performance.now() - startedAt);
  if (remaining <= 0) return;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, remaining);
  });
}

export const adminAuthRoutes = new OpenAPIHono<AppEnv>();

adminAuthRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/auth/login',
    tags: ['admin-auth'],
    middleware: [
      withTrustedAdminOrigin(),
      adminLoginBodyLimit,
      adminAuthIpWindow,
      loginIpBurst,
      loginIpWindow,
    ] as const,
    request: {
      body: {
        content: {
          'application/json': { schema: loginRequest },
        },
      },
    },
    responses: {
      200: {
        description: 'Dedicated admin session created.',
        content: {
          'application/json': { schema: authenticatedResponse },
        },
      },
      400: {
        description: 'Bad request.',
        content: { 'application/json': { schema: errorBody } },
      },
      401: {
        description: 'Invalid credentials.',
        content: { 'application/json': { schema: errorBody } },
      },
      403: {
        description: 'Untrusted browser origin.',
        content: { 'application/json': { schema: errorBody } },
      },
      413: {
        description: 'Request body exceeds 8 KiB.',
        content: { 'application/json': { schema: errorBody } },
      },
      429: {
        description: 'Rate limited.',
        content: { 'application/json': { schema: errorBody } },
      },
    },
  }),
  async (c) => {
    c.header('Cache-Control', 'no-store');
    const startedAt = performance.now();
    const body = c.req.valid('json');
    const email = canonicalAdminEmail(body.email);
    const emailLimit = await consumeRateLimit(c, loginEmailWindow);
    const session = await authenticateAdmin(body.email, body.password);

    if (!session) {
      await waitForLoginFailureFloor(startedAt);
      if (emailLimit && !emailLimit.success) {
        audit(c, 'login_rate_limited', email);
        return rejectRateLimit(c, emailLimit);
      }
      audit(c, 'login_failed', email);
      return c.json(
        {
          error: {
            code: 'unauthorized',
            message: 'Invalid email or password.',
          },
        },
        401,
      );
    }

    setAdminSessionCookie(c, session.token);
    audit(c, 'login_succeeded', session.email);
    return c.json(
      {
        authenticated: true as const,
        email: session.email,
      },
      200,
    );
  },
);

adminAuthRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/auth/session',
    tags: ['admin-auth'],
    security: [{ adminSession: [] }],
    middleware: [adminAuthIpWindow, withAdminSession()] as const,
    responses: {
      200: {
        description: 'Current dedicated admin session.',
        content: {
          'application/json': { schema: authenticatedResponse },
        },
      },
      401: {
        description: 'No valid admin session.',
        content: { 'application/json': { schema: errorBody } },
      },
      429: {
        description: 'Rate limited.',
        content: { 'application/json': { schema: errorBody } },
      },
    },
  }),
  (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(
      {
        authenticated: true as const,
        email: c.get('adminEmail')!,
      },
      200,
    );
  },
);

adminAuthRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/auth/logout',
    tags: ['admin-auth'],
    security: [{ adminSession: [] }],
    middleware: [withTrustedAdminOrigin(), adminAuthIpWindow, withAdminSession()] as const,
    responses: {
      200: {
        description: 'Admin session revoked.',
        content: {
          'application/json': { schema: signedOutResponse },
        },
      },
      401: {
        description: 'No valid admin session.',
        content: { 'application/json': { schema: errorBody } },
      },
      403: {
        description: 'Untrusted browser origin.',
        content: { 'application/json': { schema: errorBody } },
      },
      429: {
        description: 'Rate limited.',
        content: { 'application/json': { schema: errorBody } },
      },
    },
  }),
  async (c) => {
    const sessionId = c.get('adminSessionId');
    const email = c.get('adminEmail');
    if (!sessionId) {
      throw new HTTPException(401, { message: 'Unauthorized.' });
    }

    await revokeAdminSession(sessionId);
    clearAdminSessionCookie(c);
    c.header('Cache-Control', 'no-store');
    audit(c, 'logout_succeeded', email);
    return c.json({ authenticated: false as const }, 200);
  },
);
