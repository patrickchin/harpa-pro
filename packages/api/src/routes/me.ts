/**
 * /me routes — current-user profile + monthly usage. All read/write goes
 * through `c.get('db')(fn)` so the per-request scope wrapper is what
 * isolates one user's row from another (Pitfall 6).
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import {
  auth as authSchemas,
  usageLimits as usageLimitsSchemas,
  cursor as cursorSchema,
  errorEnvelope,
} from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { openApiHonoOptions } from '../lib/openapi.js';
import { withAuth } from '../middleware/auth.js';
import { fetchUser, updateUser, fetchUsage, listUsageEvents } from '../services/me.js';
import { getEffectiveLimits } from '../services/usage-limits.js';
import {
  deleteCurrentAccount,
  getAccountDeletionPreview,
} from '../services/account-deletion.js';
import { drainStorageDeleteJobs } from '../services/storage-delete-jobs.js';
import { captureApiException } from '../telemetry/sentry.js';
import { getPgError } from '../lib/pg-error.js';

export const meRoutes = new OpenAPIHono<AppEnv>(openApiHonoOptions);

meRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    tags: ['auth'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    responses: {
      200: { description: 'Current user.', content: { 'application/json': { schema: authSchemas.meResponse } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'User not found.', content: { 'application/json': { schema: errorEnvelope } } },
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
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
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
    path: '/me/deletion-preview',
    tags: ['auth'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    responses: {
      200: {
        description: 'Account deletion consequences for the signed-in user.',
        content: { 'application/json': { schema: authSchemas.accountDeletionPreviewResponse } },
      },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'User not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const preview = await db((d) => getAccountDeletionPreview(d, userId));
    if (!preview) throw new HTTPException(404, { message: 'User not found.' });
    return c.json(preview, 200);
  },
);

meRoutes.openapi(
  createRoute({
    method: 'delete',
    path: '/me',
    tags: ['auth'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    responses: {
      204: { description: 'Account deleted.' },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'User not found.', content: { 'application/json': { schema: errorEnvelope } } },
      503: { description: 'Deletion temporarily unavailable during storage-lifecycle rollout.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    try {
      await db((d) => deleteCurrentAccount(d));
    } catch (err) {
      const pgError = getPgError(err);
      if (pgError?.code === 'P0002') {
        throw new HTTPException(404, { message: 'User not found.' });
      }
      if (
        pgError?.code === '55000' &&
        /file_upload_lease_rollout_pending/.test(pgError.message ?? '')
      ) {
        throw new HTTPException(503, {
          message: 'Account deletion is temporarily unavailable.',
        });
      }
      throw err;
    }

    const requestId = c.get('requestId');
    try {
      const cleanup = await drainStorageDeleteJobs({
        maxJobs: 1,
        userId,
      });
      if (cleanup.failed > 0) {
        reportStorageCleanupIncomplete(
          {
            userId,
            requestId,
            ...cleanup,
          },
        );
      }
    } catch (error) {
      reportStorageCleanupIncomplete(
        {
          userId,
          requestId,
          claimed: 0,
          completed: 0,
          failed: 1,
        },
        error,
      );
    }

    return c.body(null, 204);
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
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
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

function reportStorageCleanupIncomplete(
  input: {
    userId: string;
    requestId: string;
    claimed: number;
    completed: number;
    failed: number;
  },
  error?: unknown,
): void {
  console.warn(
    JSON.stringify({
      level: 'warn',
      event: 'account_storage_cleanup_incomplete',
      ...input,
    }),
  );
  captureApiException(
    error ?? new Error('Post-commit account storage cleanup incomplete'),
    {
      requestId: input.requestId,
      method: 'DELETE',
      route: '/me',
      status: 204,
    },
  );
}

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
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
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
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
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
