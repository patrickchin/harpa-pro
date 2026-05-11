/**
 * Hono app skeleton. Routes mount here; server entry is src/server.ts.
 * Per-request scoped DB and auth are injected via middleware.
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { requestId } from './middleware/requestId.js';
import { errorMapper } from './middleware/errorMapper.js';
import { health } from './routes/health.js';

export type AppEnv = {
  Variables: {
    requestId: string;
    // Auth-scoped claims, populated by withAuth middleware on protected routes.
    userId?: string;
    sessionId?: string;
  };
};

export function createApp(): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();

  app.use('*', requestId());
  app.onError(errorMapper());

  // Public routes
  app.route('/', health);

  // OpenAPI spec
  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'harpa-pro API', version: '0.0.0' },
  });

  return app;
}
