/**
 * /me routes — current-user profile + monthly usage. All read/write goes
 * through `c.get('db')(fn)` so the per-request scope wrapper is what
 * isolates one user's row from another (Pitfall 6).
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { auth as authSchemas, usageLimits as usageLimitsSchemas, cursor as cursorSchema } from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAuth } from '../middleware/auth.js';
import { fetchUser, updateUser, fetchUsage, listUsageEvents } from '../services/me.js';
import { getEffectiveLimits } from '../services/usage-limits.js';

const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  requestId: z.string().optional(),
});

export const meRoutes = new OpenAPIHono<AppEnv>();

meRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    tags: ['auth'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    responses: {
      200: { description: 'Current user.', content: { 'application/json': { schema: authSchemas.meResponse } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorBody } } },
      404: { description: 'User not found.', content: { 'application/json': { schema: errorBody } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const user = await db((d) => fetchUser(d, userId));
    if (!user) throw new HTTPException(404, { message: 'User not found.' });
    return c.json({ user }, 200);
  },
);

meRoutes.openapi(
  createRoute({
    method: 'patch',
    path: '/me',
    tags: ['auth'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      body: { content: { 'application/json': { schema: authSchemas.updateMeRequest } } },
    },
    responses: {
      200: { description: 'Updated.', content: { 'application/json': { schema: authSchemas.meResponse } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorBody } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorBody } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorBody } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const input = c.req.valid('json');
    const user = await db((d) => updateUser(d, userId, input));
    if (!user) throw new HTTPException(404, { message: 'User not found.' });
    return c.json({ user }, 200);
  },
);

meRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/me/usage',
    tags: ['auth'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    responses: {
      200: { description: 'Usage summary.', content: { 'application/json': { schema: authSchemas.usageResponse } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorBody } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const [usage, effective] = await Promise.all([
      db((d) => fetchUsage(d, userId)),
      db((d) => getEffectiveLimits(d, userId)),
    ]);
    return c.json({ ...usage, plan: effective.plan, limits: effective.buckets }, 200);
  },
);

meRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/me/usage/events',
    tags: ['auth'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      query: z.object({
        cursor: cursorSchema.optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        operation: z.enum(['chat', 'transcribe', 'generate_report']).optional(),
        vendor: z.string().min(1).max(64).optional(),
      }),
    },
    responses: {
      200: {
        description: 'Paginated raw LLM usage events, newest first.',
        content: { 'application/json': { schema: authSchemas.usageEventsResponse } },
      },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorBody } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorBody } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const q = c.req.valid('query');
    try {
      const out = await db((d) =>
        listUsageEvents(d, userId, {
          cursor: q.cursor,
          limit: q.limit ?? 50,
          operation: q.operation,
          vendor: q.vendor,
        }),
      );
      return c.json(out, 200);
    } catch (err) {
      if (err instanceof Error && err.message === 'invalid cursor') {
        throw new HTTPException(400, { message: 'Invalid cursor.' });
      }
      throw err;
    }
  },
);

meRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/me/limits',
    tags: ['auth'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    responses: {
      200: { description: 'Effective limits.', content: { 'application/json': { schema: usageLimitsSchemas.limitsResponse } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorBody } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const out = await db((d) => getEffectiveLimits(d, userId));
    return c.json({ plan: out.plan, buckets: out.buckets }, 200);
  },
);
