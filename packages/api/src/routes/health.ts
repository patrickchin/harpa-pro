import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { AppEnv } from '../app.js';

const HealthResponse = z.object({
  ok: z.literal(true),
  service: z.literal('api'),
  version: z.string(),
});

export const health = new OpenAPIHono<AppEnv>().openapi(
  createRoute({
    method: 'get',
    path: '/healthz',
    tags: ['health'],
    responses: {
      200: {
        description: 'Service is alive.',
        content: { 'application/json': { schema: HealthResponse } },
      },
    },
  }),
  (c) => c.json({ ok: true as const, service: 'api' as const, version: '0.0.0' }, 200),
);
