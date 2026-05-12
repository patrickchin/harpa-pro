/**
 * Reports CRUD routes. List/create are nested under /projects/:id;
 * get/patch/delete address the report directly. RLS in app.reports
 * (member of the parent project) does the access control.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import {
  reports as reportSchemas,
  paginated,
  errorEnvelope,
  cursor,
  limit,
  uuid,
} from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAuth } from '../middleware/auth.js';
import {
  createReport,
  deleteReport,
  getReport,
  listReports,
  updateReport,
} from '../services/reports.js';
import { getProject } from '../services/projects.js';

const projectIdParam = z.object({ id: uuid.openapi({ param: { name: 'id', in: 'path' } }) });
const reportIdParam = z.object({ reportId: uuid.openapi({ param: { name: 'reportId', in: 'path' } }) });

export const reportRoutes = new OpenAPIHono<AppEnv>();

// --------- list under project ----------
reportRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/projects/{id}/reports',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: projectIdParam,
      query: z.object({ cursor: cursor.optional(), limit: limit.optional() }),
    },
    responses: {
      200: { description: 'Page of reports.', content: { 'application/json': { schema: paginated(reportSchemas.report) } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Project not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { id } = c.req.valid('param');
    const q = c.req.valid('query');
    // Ensure caller can see the project (RLS will return null otherwise).
    const project = await db((d) => getProject(d, userId, id, false));
    if (!project) throw new HTTPException(404, { message: 'Project not found.' });
    const out = await db((d) => listReports(d, { projectId: id, cursor: q.cursor, limit: q.limit ?? 20 }));
    return c.json(out, 200);
  },
);

// --------- create under project ----------
reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects/{id}/reports',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: projectIdParam,
      body: { content: { 'application/json': { schema: reportSchemas.createReportRequest } } },
    },
    responses: {
      201: { description: 'Created.', content: { 'application/json': { schema: reportSchemas.report } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Project not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const project = await db((d) => getProject(d, userId, id, false));
    if (!project) throw new HTTPException(404, { message: 'Project not found.' });
    const report = await db((d) => createReport(d, id, userId, body));
    if (!report) throw new HTTPException(500, { message: 'create failed' });
    return c.json(report, 201);
  },
);

// --------- get ----------
reportRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/reports/{reportId}',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: reportIdParam },
    responses: {
      200: { description: 'Report.', content: { 'application/json': { schema: reportSchemas.report } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { reportId } = c.req.valid('param');
    const report = await db((d) => getReport(d, reportId));
    if (!report) throw new HTTPException(404, { message: 'Report not found.' });
    return c.json(report, 200);
  },
);

// --------- patch ----------
reportRoutes.openapi(
  createRoute({
    method: 'patch',
    path: '/reports/{reportId}',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: reportIdParam,
      body: { content: { 'application/json': { schema: reportSchemas.updateReportRequest } } },
    },
    responses: {
      200: { description: 'Updated.', content: { 'application/json': { schema: reportSchemas.report } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { reportId } = c.req.valid('param');
    const body = c.req.valid('json');
    const report = await db((d) => updateReport(d, reportId, body));
    if (!report) throw new HTTPException(404, { message: 'Report not found.' });
    return c.json(report, 200);
  },
);

// --------- delete ----------
reportRoutes.openapi(
  createRoute({
    method: 'delete',
    path: '/reports/{reportId}',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: reportIdParam },
    responses: {
      204: { description: 'Deleted.' },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { reportId } = c.req.valid('param');
    const ok = await db((d) => deleteReport(d, reportId));
    if (!ok) throw new HTTPException(404, { message: 'Report not found.' });
    return c.body(null, 204);
  },
);
