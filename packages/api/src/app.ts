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
import { resolverRoutes } from './routes/resolvers.js';
import { wellKnownRoutes } from './routes/well-known.js';
import { billingRoutes } from './routes/billing.js';
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

  // CORS — limited to /waitlist/* so cross-origin signups from the
  // marketing site (https://harpapro.com → https://api.harpapro.com)
  // work. Every other route stays same-origin only.
  // Allowlist comes from env (WAITLIST_CORS_ORIGINS, comma-separated).
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
  app.onError(errorMapper());

  // Register the Bearer security scheme. Better-auth's expo() plugin
  // emits an opaque session token; routes reference this via
  // `security: [{ bearerAuth: [] }]` to mark themselves as authed.
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'better-auth session token',
  });

  // Better-auth handler — owns all `/api/auth/**` routes (sign-in,
  // sign-out, email-OTP, session lookup, etc.). Mounted at the raw
  // Hono level so we don't fight the OpenAPI router's path matching.
  app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw));

  // Public routes
  app.route('/', health);
  app.route('/', readyz);
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
  app.route('/', adminRoutes);
  app.route('/', billingRoutes);

  // OpenAPI spec
  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Harpa Pro API', version: '0.0.0' },
  });

  return app;
}
