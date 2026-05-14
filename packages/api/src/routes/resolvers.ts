/**
 * Short-URL resolver routes — added in P3.0 Commit 3.
 *
 * `GET /p/:projectSlug`  → resolves to `{ type: 'project', projectSlug }`
 * `GET /r/:reportSlug`   → resolves to `{ type: 'report', projectSlug, reportSlug, reportNumber }`
 *
 * The API returns JSON (not a 308 redirect) so the mobile client can
 * `router.replace` to the canonical long URL without a visible flash.
 * See docs/v4/arch-ids-and-urls.md and design-p30-ids-slugs.md §4.
 *
 * Access control is enforced by RLS via the per-request scoped drizzle
 * handle — a slug owned by another user looks identical to a missing
 * one and surfaces as 404 (Pitfall 6).
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import {
  errorEnvelope,
  projectSlug,
  reportSlug,
  resolvers as resolverSchemas,
} from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAuth } from '../middleware/auth.js';
import { resolveProjectSlug } from '../services/projects.js';
import { resolveReportSlug } from '../services/reports.js';

const projectSlugParam = z.object({
  projectSlug: projectSlug.openapi({ param: { name: 'projectSlug', in: 'path' } }),
});
const reportSlugParam = z.object({
  reportSlug: reportSlug.openapi({ param: { name: 'reportSlug', in: 'path' } }),
});

export const resolverRoutes = new OpenAPIHono<AppEnv>();

resolverRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/p/{projectSlug}',
    tags: ['resolvers'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: projectSlugParam },
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
    const { projectSlug: slug } = c.req.valid('param');
    const resolved = await db((d) => resolveProjectSlug(d, slug));
    if (!resolved) throw new HTTPException(404, { message: 'Project not found.' });
    return c.json({ type: 'project' as const, projectSlug: resolved.projectSlug }, 200);
  },
);

resolverRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/r/{reportSlug}',
    tags: ['resolvers'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: reportSlugParam },
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
    const { reportSlug: slug } = c.req.valid('param');
    const resolved = await db((d) => resolveReportSlug(d, slug));
    if (!resolved) throw new HTTPException(404, { message: 'Report not found.' });
    return c.json(
      {
        type: 'report' as const,
        projectSlug: resolved.projectSlug,
        reportSlug: resolved.reportSlug,
        reportNumber: resolved.reportNumber,
      },
      200,
    );
  },
);
