/**
 * Hono app skeleton. Routes mount here; server entry is src/server.ts.
 * Per-request scoped DB and auth are injected via middleware.
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { requestId } from './middleware/requestId.js';
import { errorMapper } from './middleware/errorMapper.js';
import { globalRateLimit } from './middleware/globalRateLimit.js';
import { health } from './routes/health.js';
import { readyz } from './routes/readyz.js';
import { auth } from './auth/auth.js';
import { meRoutes } from './routes/me.js';
import { projectRoutes } from './routes/projects.js';
import { reportRoutes } from './routes/reports.js';
import { noteRoutes } from './routes/notes.js';
import { fileRoutes } from './routes/files.js';
import { voiceRoutes } from './routes/voice.js';
import { settingsRoutes } from './routes/settings.js';
import { waitlistRoutes } from './routes/waitlist.js';
import { adminRoutes } from './routes/admin.js';
import { adminActivityRoutes } from './routes/admin-activity.js';
import { adminAuthRoutes } from './routes/admin-auth.js';
import { adminReadyz } from './routes/admin-readyz.js';
import { adminOperationsRoutes } from './routes/admin-operations.js';
import { resolverRoutes } from './routes/resolvers.js';
import { wellKnownRoutes } from './routes/well-known.js';
import { env } from './env.js';
import { createSentryMiddleware } from './telemetry/sentry.js';
import type { ScopedDb } from './db/scope.js';

/**
 * Scoped DB accessor injected by withAuth (see middleware/auth.ts).
 * Route handlers MUST go through `c.get('db')(fn)` rather than importing
 * the raw drizzle handle; the lint rule in .eslintrc.cjs enforces this.
 * See docs/v4/arch-auth-and-rls.md.
 */
export type ScopedDbAccessor = <T>(fn: (db: ScopedDb) => Promise<T>) => Promise<T>;

export type AppEnv = {
  Variables: {
    requestId: string;
    // Auth-scoped claims, populated by withAuth middleware on protected routes.
    userId?: string;
    sessionId?: string;
    // Separate browser-admin claims, populated only by withAdminSession.
    adminIdentityId?: string;
    adminSessionId?: string;
    adminEmail?: string;
    // Per-request scoped DB accessor; populated by withAuth.
    db?: ScopedDbAccessor;
  };
};

export function createApp(): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();

  app.use('*', requestId());
  const sentryMiddleware = createSentryMiddleware(app);
  if (sentryMiddleware) app.use('*', sentryMiddleware);
  // Global catch-all rate limiter (arch-rate-limiting.md §3.3). Runs
  // before any route-level middleware so it bounds total traffic per
  // user / IP — including misbehaving clients hammering unauthed
  // routes. Per-route + shared-AI buckets remain on the relevant routes.
  app.use('*', globalRateLimit());

  const dashboardOriginPatterns = env.DASHBOARD_CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const dashboardCors = cors({
    origin: (origin) =>
      dashboardOriginPatterns.some((pattern) => originMatchesPattern(origin, pattern))
        ? origin
        : null,
    allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Requested-With'],
    exposeHeaders: ['Set-Auth-Token', 'X-Usage-Warning'],
    credentials: true,
    maxAge: 86400,
  });
  app.use('*', async (c, next) => {
    // Public waitlist and admin routes keep their own narrower allowlists below.
    const hasDedicatedCors =
      c.req.path === '/waitlist' ||
      c.req.path.startsWith('/waitlist/') ||
      c.req.path === '/admin' ||
      c.req.path.startsWith('/admin/');
    if (hasDedicatedCors) {
      return next();
    }
    const origin = c.req.header('origin') ?? '';
    const isDashboardOrigin = dashboardOriginPatterns.some((pattern) =>
      originMatchesPattern(origin, pattern),
    );
    return isDashboardOrigin ? dashboardCors(c, next) : next();
  });

  // Public, non-credentialed CORS for marketing waitlist submissions.
  // Credentialed dashboard and admin CORS is configured separately.
  const allowedOrigins = env.WAITLIST_CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    '/waitlist/*',
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ['POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      credentials: false,
      maxAge: 86400,
    }),
  );
  // Hono path patterns: '/waitlist/*' doesn't match '/waitlist' itself.
  app.use(
    '/waitlist',
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ['POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      credentials: false,
      maxAge: 86400,
    }),
  );

  const adminOrigins = env.ADMIN_CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const credentialedOrigin = (origin: string) => (adminOrigins.includes(origin) ? origin : null);

  app.use(
    '/admin/*',
    cors({
      origin: credentialedOrigin,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'X-Request-ID'],
      credentials: true,
      maxAge: 86400,
    }),
  );
  app.use(
    '/readyz',
    cors({
      origin: credentialedOrigin,
      allowMethods: ['GET', 'OPTIONS'],
      credentials: true,
      maxAge: 86400,
    }),
  );
  app.onError(errorMapper());

  // Register the Bearer security scheme. Better-auth's expo() plugin
  // emits an opaque session token; routes reference this via
  // `security: [{ bearerAuth: [] }]` to mark themselves as authed.
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'better-auth session token',
  });
  app.openAPIRegistry.registerComponent('securitySchemes', 'adminSession', {
    type: 'apiKey',
    in: 'cookie',
    name: '__Host-harpa_admin_session',
    description: 'Dedicated HttpOnly administrator session cookie.',
  });

  // Better-auth handler — owns all `/api/auth/**` routes (sign-in,
  // sign-out, email-OTP, session lookup, etc.). Mounted at the raw
  // Hono level so we don't fight the OpenAPI router's path matching.
  app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw));

  // Public routes
  app.route('/', health);
  app.route('/', readyz);
  app.route('/', adminReadyz);
  app.route('/', waitlistRoutes);
  app.route('/', wellKnownRoutes);

  // Authenticated routes
  app.route('/', meRoutes);
  app.route('/', projectRoutes);
  app.route('/', reportRoutes);
  app.route('/', resolverRoutes);
  app.route('/', noteRoutes);
  app.route('/', fileRoutes);
  app.route('/', voiceRoutes);
  app.route('/', settingsRoutes);
  app.route('/', adminAuthRoutes);
  app.route('/', adminActivityRoutes);
  app.route('/', adminOperationsRoutes);
  app.route('/', adminRoutes);

  // OpenAPI spec
  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Harpa Pro API', version: '0.0.0' },
  });

  return app;
}

function originMatchesPattern(origin: string, pattern: string): boolean {
  if (!origin || !pattern) return false;
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${escaped}$`).test(origin);
}
