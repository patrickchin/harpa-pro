/**
 * Hono app skeleton. Routes mount here; server entry is src/server.ts.
 * Per-request scoped DB and auth are injected via middleware.
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { requestId } from './middleware/requestId.js';
import { errorMapper } from './middleware/errorMapper.js';
import { health } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { projectRoutes } from './routes/projects.js';
import { reportRoutes } from './routes/reports.js';
import { noteRoutes } from './routes/notes.js';
import { fileRoutes } from './routes/files.js';
import { voiceRoutes } from './routes/voice.js';
import { settingsRoutes } from './routes/settings.js';
import { waitlistRoutes } from './routes/waitlist.js';
import { adminRoutes } from './routes/admin.js';
import { env } from './env.js';
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
  app.route('/', authRoutes);
  app.route('/', waitlistRoutes);

  // Authenticated routes
  app.route('/', meRoutes);
  app.route('/', projectRoutes);
  app.route('/', reportRoutes);
  app.route('/', noteRoutes);
  app.route('/', fileRoutes);
  app.route('/', voiceRoutes);
  app.route('/', settingsRoutes);
  app.route('/', adminRoutes);

  // OpenAPI spec
  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'harpa-pro API', version: '0.0.0' },
  });

  return app;
}
