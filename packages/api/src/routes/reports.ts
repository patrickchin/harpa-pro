/**
 * Reports routes — restructured in P3.0 Commit 3.
 *
 * List/create are nested under `/projects/:projectSlug/reports`.
 * Get/patch/delete/generate/regenerate/finalize/pdf are nested under
 * `/projects/:projectSlug/reports/:number`. The per-project number is
 * the user-visible identifier; the report UUID is purely internal.
 *
 * RLS (`reports_member_*` policies on app.reports) does access
 * control: the JOIN-on-slug lookup hides cross-project rows, so a
 * non-owned (slug, number) pair is indistinguishable from a missing
 * one and surfaces as 404 (Pitfall 6).
 *
 * The internal UUID lookup helper `getReport(db, reportId)` is kept
 * for routes that already received it from a slug→id resolution
 * step; never trust an `id` from the client. See
 * docs/v4/design-p30-ids-slugs.md §4 and arch-ids-and-urls.md.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import {
  reports as reportSchemas,
  paginated,
  errorEnvelope,
  cursor,
  limit,
  projectSlug,
  reportNumber,
} from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAuth } from '../middleware/auth.js';
import { withRateLimit } from '../middleware/rateLimit.js';
import { withIdempotency } from '../middleware/idempotency.js';
import {
  createReport,
  deleteReport,
  getReport,
  getReportByProjectSlugAndNumber,
  listReports,
  updateReport,
  collectNotesForGeneration,
  setReportBody,
  finalizeReport,
  setReportPdfFileId,
  type ReportRow,
} from '../services/reports.js';
import { getProjectBySlug } from '../services/projects.js';
import { generateReport as aiGenerateReport } from '../services/ai.js';
import { pickStorage } from '../services/storage.js';
import { registerFile } from '../services/files.js';
import { renderReportPdf } from '../services/report-pdf.js';

const projectSlugParam = z.object({
  projectSlug: projectSlug.openapi({ param: { name: 'projectSlug', in: 'path' } }),
});

const reportPathParam = z.object({
  projectSlug: projectSlug.openapi({ param: { name: 'projectSlug', in: 'path' } }),
  number: reportNumber.openapi({ param: { name: 'number', in: 'path' } }),
});

// AI route budgets (per arch-api-design.md §Rate limiting / §Idempotency).
const MIN = 60_000;
const generateRateLimit = withRateLimit({ name: 'reports.generate', limit: 30, windowMs: MIN });
const generateIdempotency = withIdempotency({ name: 'reports.generate' });

export const reportRoutes = new OpenAPIHono<AppEnv>();

/**
 * Shared slug→report lookup. Returns the report row (used by every
 * non-list handler below) or throws a 404 if the report is missing OR
 * RLS hides it. Always run under `c.get('db')(d => ...)` so the lookup
 * respects scope.
 */
async function loadReport(
  db: NonNullable<AppEnv['Variables']['db']>,
  projectSlugValue: string,
  number: number,
): Promise<ReportRow> {
  const report = await db((d) => getReportByProjectSlugAndNumber(d, projectSlugValue, number));
  if (!report) throw new HTTPException(404, { message: 'Report not found.' });
  return report;
}

// --------- list under project ----------
reportRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/projects/{projectSlug}/reports',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: projectSlugParam,
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
    const { projectSlug: slug } = c.req.valid('param');
    const q = c.req.valid('query');
    const project = await db((d) => getProjectBySlug(d, userId, slug, false));
    if (!project) throw new HTTPException(404, { message: 'Project not found.' });
    const out = await db((d) => listReports(d, { projectId: project.id, cursor: q.cursor, limit: q.limit ?? 20 }));
    return c.json(out, 200);
  },
);

// --------- create under project ----------
reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects/{projectSlug}/reports',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: projectSlugParam,
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
    const { projectSlug: slug } = c.req.valid('param');
    const body = c.req.valid('json');
    const project = await db((d) => getProjectBySlug(d, userId, slug, false));
    if (!project) throw new HTTPException(404, { message: 'Project not found.' });
    const report = await db((d) => createReport(d, project.id, userId, body));
    if (!report) throw new HTTPException(500, { message: 'create failed' });
    return c.json(report, 201);
  },
);

// --------- get ----------
reportRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/projects/{projectSlug}/reports/{number}',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: reportPathParam },
    responses: {
      200: { description: 'Report.', content: { 'application/json': { schema: reportSchemas.report } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { projectSlug: slug, number } = c.req.valid('param');
    const report = await loadReport(db, slug, number);
    return c.json(report, 200);
  },
);

// --------- patch ----------
reportRoutes.openapi(
  createRoute({
    method: 'patch',
    path: '/projects/{projectSlug}/reports/{number}',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: reportPathParam,
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
    const { projectSlug: slug, number } = c.req.valid('param');
    const body = c.req.valid('json');
    const existing = await loadReport(db, slug, number);
    const report = await db((d) => updateReport(d, existing.id, body));
    if (!report) throw new HTTPException(404, { message: 'Report not found.' });
    return c.json(report, 200);
  },
);

// --------- delete ----------
reportRoutes.openapi(
  createRoute({
    method: 'delete',
    path: '/projects/{projectSlug}/reports/{number}',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: reportPathParam },
    responses: {
      204: { description: 'Deleted.' },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { projectSlug: slug, number } = c.req.valid('param');
    const existing = await loadReport(db, slug, number);
    const ok = await db((d) => deleteReport(d, existing.id));
    if (!ok) throw new HTTPException(404, { message: 'Report not found.' });
    return c.body(null, 204);
  },
);

// ===========================================================================
// AI generation / finalize / pdf (P1.7)
//
// Ownership: every handler resolves the report under the per-request scoped
// drizzle handle BEFORE doing anything else; RLS hides cross-project rows so
// a non-owned (slug, number) pair is indistinguishable from a missing one
// and surfaces as 404. AI provider failures are wrapped as
// `AiProviderError` in services/ai.ts; errorMapper maps them to 502 +
// code='ai_provider_error' with no provider detail in the envelope or log.
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
 * POST /reports/.../generate and /regenerate share an implementation
 * — the difference is intent, not wire shape. Both reject when the
 * report is finalized; both replace `body` and reset
 * `notes_since_last_generation`.
 */
async function runGenerate(
  db: NonNullable<AppEnv['Variables']['db']>,
  report: ReportRow,
  fixtureName: string | undefined,
) {
  if (report.status === 'finalized') {
    throw new HTTPException(409, { message: 'Report is finalized.' });
  }
  const notes = await db((d) => collectNotesForGeneration(d, report.id));
  const out = await aiGenerateReport({ notes, fixtureName });
  const updated = await db((d) => setReportBody(d, report.id, out.body));
  if (!updated) throw new HTTPException(404, { message: 'Report not found.' });
  return updated;
}

reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects/{projectSlug}/reports/{number}/generate',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth(), generateRateLimit, generateIdempotency] as const,
    request: {
      params: reportPathParam,
      body: { content: { 'application/json': { schema: reportSchemas.generateReportRequest } } },
    },
    responses: generateResponses,
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { projectSlug: slug, number } = c.req.valid('param');
    const body = c.req.valid('json');
    const report = await loadReport(db, slug, number);
    const updated = await runGenerate(db, report, body.fixtureName);
    return c.json({ report: updated }, 200);
  },
);

reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects/{projectSlug}/reports/{number}/regenerate',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth(), generateRateLimit, generateIdempotency] as const,
    request: {
      params: reportPathParam,
      body: { content: { 'application/json': { schema: reportSchemas.regenerateReportRequest } } },
    },
    responses: generateResponses,
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { projectSlug: slug, number } = c.req.valid('param');
    const body = c.req.valid('json');
    const report = await loadReport(db, slug, number);
    const updated = await runGenerate(db, report, body.fixtureName);
    return c.json({ report: updated }, 200);
  },
);

// ---------- POST /projects/:projectSlug/reports/:number/finalize ----------
reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects/{projectSlug}/reports/{number}/finalize',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: reportPathParam },
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
    const { projectSlug: slug, number } = c.req.valid('param');

    const report = await loadReport(db, slug, number);
    if (!report.body) {
      throw new HTTPException(409, { message: 'Report has no body to finalize.' });
    }
    const updated = await db((d) => finalizeReport(d, report.id));
    if (!updated) throw new HTTPException(404, { message: 'Report not found.' });
    return c.json({ report: updated }, 200);
  },
);

// ---------- POST /projects/:projectSlug/reports/:number/pdf ----------
reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects/{projectSlug}/reports/{number}/pdf',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: reportPathParam },
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
    const { projectSlug: slug, number } = c.req.valid('param');

    const report = await loadReport(db, slug, number);
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
    await db((d) => setReportPdfFileId(d, report.id, file.id));

    const signed = await storage.signGet(put.fileKey);
    return c.json({ url: signed.url, expiresAt: signed.expiresAt }, 200);
  },
);

// Re-export the internal lookup so notes routes (which still address
// reports by UUID until P3.1) keep working without circular imports.
export { getReport };
