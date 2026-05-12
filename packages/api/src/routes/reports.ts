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
  collectNotesForGeneration,
  setReportBody,
  finalizeReport,
  setReportPdfFileId,
} from '../services/reports.js';
import { getProject } from '../services/projects.js';
import { generateReport as aiGenerateReport } from '../services/ai.js';
import { pickStorage } from '../services/storage.js';
import { registerFile } from '../services/files.js';
import { renderReportPdf } from '../services/report-pdf.js';

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

// ===========================================================================
// AI generation / finalize / pdf (P1.7)
//
// Ownership: every handler resolves `getReport` under the per-request scoped
// drizzle handle BEFORE doing anything else; RLS hides cross-project rows so
// a non-owned id is indistinguishable from a missing id and surfaces as 404.
// AI provider failures are wrapped as `AiProviderError` in services/ai.ts;
// errorMapper maps them to 502 + code='ai_provider_error' with no provider
// detail in the envelope or operator log.
// ===========================================================================

const generateResponses = {
  200: { description: 'Generated.', content: { 'application/json': { schema: reportSchemas.generateReportResponse } } },
  400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
  401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
  404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
  409: { description: 'Conflict.', content: { 'application/json': { schema: errorEnvelope } } },
  502: { description: 'Upstream AI provider error.', content: { 'application/json': { schema: errorEnvelope } } },
};

/**
 * POST /reports/:reportId/generate and /regenerate share an implementation
 * — the difference is intent, not wire shape. Both reject when the report
 * is finalized; both replace `body` and reset `notes_since_last_generation`.
 */
async function runGenerate(
  db: NonNullable<AppEnv['Variables']['db']>,
  reportId: string,
  fixtureName: string | undefined,
) {
  const report = await db((d) => getReport(d, reportId));
  if (!report) throw new HTTPException(404, { message: 'Report not found.' });
  if (report.status === 'finalized') {
    throw new HTTPException(409, { message: 'Report is finalized.' });
  }
  const notes = await db((d) => collectNotesForGeneration(d, reportId));
  const out = await aiGenerateReport({ notes, fixtureName });
  const updated = await db((d) => setReportBody(d, reportId, out.body));
  if (!updated) throw new HTTPException(404, { message: 'Report not found.' });
  return updated;
}

reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/reports/{reportId}/generate',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: reportIdParam,
      body: { content: { 'application/json': { schema: reportSchemas.generateReportRequest } } },
    },
    responses: generateResponses,
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { reportId } = c.req.valid('param');
    const body = c.req.valid('json');
    const updated = await runGenerate(db, reportId, body.fixtureName);
    return c.json({ report: updated }, 200);
  },
);

reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/reports/{reportId}/regenerate',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: reportIdParam,
      body: { content: { 'application/json': { schema: reportSchemas.regenerateReportRequest } } },
    },
    responses: generateResponses,
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { reportId } = c.req.valid('param');
    const body = c.req.valid('json');
    const updated = await runGenerate(db, reportId, body.fixtureName);
    return c.json({ report: updated }, 200);
  },
);

// ---------- POST /reports/:reportId/finalize ----------
reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/reports/{reportId}/finalize',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: reportIdParam },
    responses: {
      200: { description: 'Finalized.', content: { 'application/json': { schema: reportSchemas.finalizeReportResponse } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
      409: { description: 'Conflict.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { reportId } = c.req.valid('param');

    const report = await db((d) => getReport(d, reportId));
    if (!report) throw new HTTPException(404, { message: 'Report not found.' });
    if (!report.body) {
      throw new HTTPException(409, { message: 'Report has no body to finalize.' });
    }
    const updated = await db((d) => finalizeReport(d, reportId));
    if (!updated) throw new HTTPException(404, { message: 'Report not found.' });
    return c.json({ report: updated }, 200);
  },
);

// ---------- POST /reports/:reportId/pdf ----------
reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/reports/{reportId}/pdf',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: reportIdParam },
    responses: {
      200: { description: 'Signed URL to rendered PDF.', content: { 'application/json': { schema: reportSchemas.renderPdfResponse } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
      409: { description: 'Conflict.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { reportId } = c.req.valid('param');

    const report = await db((d) => getReport(d, reportId));
    if (!report) throw new HTTPException(404, { message: 'Report not found.' });
    if (!report.body) {
      throw new HTTPException(409, { message: 'Report has no body to render.' });
    }

    const bytes = renderReportPdf(report);
    const storage = pickStorage();
    // Server-built key (mirrors files.ts presign — never trust client input).
    const put = await storage.putObject({
      userId,
      kind: 'pdf',
      contentType: 'application/pdf',
      bytes,
    });
    const file = await db((d) =>
      registerFile(d, userId, {
        kind: 'pdf',
        fileKey: put.fileKey,
        sizeBytes: put.sizeBytes,
        contentType: 'application/pdf',
      }),
    );
    if (!file) throw new HTTPException(500, { message: 'pdf register failed' });
    await db((d) => setReportPdfFileId(d, reportId, file.id));

    const signed = await storage.signGet(put.fileKey);
    return c.json({ url: signed.url, expiresAt: signed.expiresAt }, 200);
  },
);
