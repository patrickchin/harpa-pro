/**
 * Short-URL resolver routes — P3.1 slug-native shape.
 *
 * `GET /p/:project`  → resolves to `{ type: 'project', projectId }`
 * `GET /r/:report`   → resolves to `{ type: 'report', projectId, reportId, reportNumber }`
 *
 * The API returns JSON (not a 308 redirect) so the mobile client can
 * `router.replace` to the canonical long URL without a visible flash.
 * See docs/v4/arch-ids-and-urls.md and design-p31-slug-only-ids.md.
 *
 * Access control is enforced by RLS via the per-request scoped drizzle
 * handle — a slug owned by another user looks identical to a missing
 * one and surfaces as 404 (Pitfall 6).
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import {
  errorEnvelope,
  projectId,
  reportId,
  resolvers as resolverSchemas,
} from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAuth } from '../middleware/auth.js';
import { resolveProjectSlug } from '../services/projects.js';
import { resolveReportSlug } from '../services/reports.js';

const projectParam = z.object({
  project: projectId.openapi({ param: { name: 'project', in: 'path' } }),
});
const reportParam = z.object({
  report: reportId.openapi({ param: { name: 'report', in: 'path' } }),
});

export const resolverRoutes = new OpenAPIHono<AppEnv>();

resolverRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/p/{project}',
    tags: ['resolvers'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: projectParam },
    responses: {
      200: {
        description: 'Resolved.',
        content: { 'application/json': { schema: resolverSchemas.projectResolverResponse } },
      },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { project } = c.req.valid('param');
    const resolved = await db((d) => resolveProjectSlug(d, project));
    if (!resolved) throw new HTTPException(404, { message: 'Project not found.' });
    return c.json({ type: 'project' as const, projectId: resolved.projectId }, 200);
  },
);

resolverRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/r/{report}',
    tags: ['resolvers'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: reportParam },
    responses: {
      200: {
        description: 'Resolved.',
        content: { 'application/json': { schema: resolverSchemas.reportResolverResponse } },
      },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { report } = c.req.valid('param');
    const resolved = await db((d) => resolveReportSlug(d, report));
    if (!resolved) throw new HTTPException(404, { message: 'Report not found.' });
    return c.json(
      {
        type: 'report' as const,
        projectId: resolved.projectId,
        reportId: resolved.reportId,
        reportNumber: resolved.reportNumber,
      },
      200,
    );
  },
);
