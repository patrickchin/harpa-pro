import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { operations } from '@harpa/api-contract';
import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../app.js';
import { observeAdminNeonInventory } from '../lib/neon-operations.js';
import { getAdminRateLimiter } from '../lib/adminRateLimiter.js';
import { adminAuthIpWindow } from '../middleware/admin-rate-limit.js';
import { withAdminSession } from '../middleware/admin-session.js';
import { withRateLimit } from '../middleware/rateLimit.js';

const MINUTE_MS = 60_000;

const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  requestId: z.string().optional(),
});

const privateNoStore: MiddlewareHandler<AppEnv> = async (c, next) => {
  // This must run before either limiter and authentication so their 401/429
  // responses inherit the same cache policy as successful observations.
  c.header('Cache-Control', 'private, no-store');
  await next();
};

function adminOperationsRateLimitKey(c: Context<AppEnv>): string {
  const identityId = c.get('adminIdentityId');
  const sessionId = c.get('adminSessionId');
  if (!identityId || !sessionId) {
    throw new HTTPException(401, { message: 'Unauthorized.' });
  }
  return `${identityId}:${sessionId}`;
}

const adminOperationsRateLimit = withRateLimit({
  name: 'admin.operations.neon.read.1m',
  keyBy: adminOperationsRateLimitKey,
  limit: 12,
  windowMs: MINUTE_MS,
  getLimiter: getAdminRateLimiter,
});

export const adminOperationsRoutes = new OpenAPIHono<AppEnv>();

adminOperationsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/operations/neon',
    tags: ['admin'],
    security: [{ adminSession: [] }],
    middleware: [
      privateNoStore,
      adminAuthIpWindow,
      withAdminSession(),
      adminOperationsRateLimit,
    ] as const,
    responses: {
      200: {
        description: 'Bounded, read-only Neon organization inventory.',
        content: {
          'application/json': { schema: operations.neonInventoryObservation },
        },
      },
      401: {
        description: 'Unauthorized.',
        content: { 'application/json': { schema: errorBody } },
      },
      429: {
        description: 'Rate limited.',
        content: { 'application/json': { schema: errorBody } },
      },
    },
  }),
  async (c) => c.json(await observeAdminNeonInventory(), 200),
);
