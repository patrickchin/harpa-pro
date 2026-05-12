/**
 * Hono app skeleton. Routes mount here; server entry is src/server.ts.
 * Per-request scoped DB and auth are injected via middleware.
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { requestId } from './middleware/requestId.js';
import { errorMapper } from './middleware/errorMapper.js';
import { health } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { projectRoutes } from './routes/projects.js';
import { reportRoutes } from './routes/reports.js';
import { noteRoutes } from './routes/notes.js';
import { fileRoutes } from './routes/files.js';
import { settingsRoutes } from './routes/settings.js';
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
  app.onError(errorMapper());

  // Public routes
  app.route('/', health);
  app.route('/', authRoutes);

  // Authenticated routes
  app.route('/', meRoutes);
  app.route('/', projectRoutes);
  app.route('/', reportRoutes);
  app.route('/', noteRoutes);
  app.route('/', fileRoutes);
  app.route('/', settingsRoutes);

  // OpenAPI spec
  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'harpa-pro API', version: '0.0.0' },
  });

  return app;
}
