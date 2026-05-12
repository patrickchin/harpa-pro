/**
 * /me routes — current-user profile + monthly usage. All read/write goes
 * through `c.get('db')(fn)` so the per-request scope wrapper is what
 * isolates one user's row from another (Pitfall 6).
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { auth as authSchemas } from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAuth } from '../middleware/auth.js';
import { fetchUser, updateUser, fetchUsage } from '../auth/service.js';

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
    const usage = await db((d) => fetchUsage(d, userId));
    return c.json(usage, 200);
  },
);
