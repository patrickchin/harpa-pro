/**
 * GET /me — returns the authenticated user. Reads via withScopedConnection
 * to exercise the RLS path on every request (Pitfall 6).
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { auth as authSchemas } from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAuth } from '../middleware/auth.js';
import { fetchUser } from '../auth/service.js';

const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  requestId: z.string().optional(),
});

export const meRoutes = new OpenAPIHono<AppEnv>().openapi(
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
