import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { requestId } from './middleware/requestId.js';
import { errorMapper } from './middleware/errorMapper.js';
import { globalRateLimit } from './middleware/globalRateLimit.js';
import { health } from './routes/health.js';
import { readyz } from './routes/readyz.js';
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
import { devRoutes } from './routes/dev.js';
import { auth } from './auth/auth.js';
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
    user?: {
      id: string;
      email: string;
      name: string;
      displayName: string | null;
      companyName: string | null;
      isAdmin: boolean | null;
      plan: string | null;
    };
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

  // Register the Bearer security scheme that authed routes reference
  // via `security: [{ bearerAuth: [] }]`. Without this the emitted
  // spec is invalid OpenAPI (security requirements pointing at an
  // undeclared scheme).
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  // Public routes
  app.route('/', health);
  app.route('/', readyz);
  app.route('/', waitlistRoutes);
  app.route('/', wellKnownRoutes);
  if (env.NODE_ENV !== 'production') app.route('/', devRoutes);

  // better-auth handles all /api/auth/** routes (sign-in, OTP, session, etc.)
  app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw));

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

  // OpenAPI spec
  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Harpa Pro API', version: '0.0.0' },
  });

  return app;
}
