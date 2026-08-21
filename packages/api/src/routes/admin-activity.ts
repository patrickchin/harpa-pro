import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { activity as activitySchemas, errorEnvelope } from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { openApiHonoOptions } from '../lib/openapi.js';
import { getAdminRateLimiter } from '../lib/adminRateLimiter.js';
import { adminAuthIpWindow } from '../middleware/admin-rate-limit.js';
import { withAdminSession } from '../middleware/admin-session.js';
import { withRateLimit } from '../middleware/rateLimit.js';
import { listAdminActivity } from '../services/admin-activity.js';

const MINUTE_MS = 60_000;

function adminActivityRateLimitKey(c: Context<AppEnv>): string {
  const identityId = c.get('adminIdentityId');
  const sessionId = c.get('adminSessionId');
  if (!identityId || !sessionId) {
    throw new HTTPException(401, { message: 'Unauthorized.' });
  }
  return `${identityId}:${sessionId}`;
}

const adminActivityRateLimit = withRateLimit({
  name: 'admin.activity.read.1m',
  keyBy: adminActivityRateLimitKey,
  limit: 120,
  windowMs: MINUTE_MS,
  getLimiter: getAdminRateLimiter,
});

export const adminActivityRoutes = new OpenAPIHono<AppEnv>(openApiHonoOptions);

adminActivityRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/activity',
    tags: ['admin'],
    security: [{ adminSession: [] }],
    // Gate random-token database probes by trusted Fly IP, then authenticate
    // before consuming the identity-and-session activity bucket.
    middleware: [adminAuthIpWindow, withAdminSession(), adminActivityRateLimit] as const,
    request: {
      query: activitySchemas.listQuery,
    },
    responses: {
      200: {
        description: 'Paginated business activity, newest first.',
        content: {
          'application/json': { schema: activitySchemas.listResponse },
        },
      },
      400: {
        description: 'Bad request.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
      401: {
        description: 'Unauthorized.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
      429: {
        description: 'Rate limited.',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  }),
  async (c) => {
    try {
      const result = await listAdminActivity(c.req.valid('query'));
      c.header('Cache-Control', 'private, no-store');
      return c.json(result, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid cursor') {
        throw new HTTPException(400, { message: 'Invalid cursor.' });
      }
      throw error;
    }
  },
);
