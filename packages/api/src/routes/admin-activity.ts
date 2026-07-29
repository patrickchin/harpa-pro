import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { activity as activitySchemas } from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAdmin } from '../middleware/admin.js';
import { withAuth } from '../middleware/auth.js';
import { listAdminActivity } from '../services/admin-activity.js';

const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  requestId: z.string().optional(),
});

export const adminActivityRoutes = new OpenAPIHono<AppEnv>();

adminActivityRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/activity',
    tags: ['admin'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth(), withAdmin()] as const,
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
        content: { 'application/json': { schema: errorBody } },
      },
      401: {
        description: 'Unauthorized.',
        content: { 'application/json': { schema: errorBody } },
      },
      403: {
        description: 'Admin access required.',
        content: { 'application/json': { schema: errorBody } },
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
