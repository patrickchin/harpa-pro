/**
 * Reports routes — restructured in P3.0 Commit 3.
 *
 * List/create are nested under `/projects/:project/reports`.
 * Get/patch/delete/generate/regenerate/finalize/pdf are nested under
 * `/projects/:project/reports/:number`. The per-project number is
 * the user-visible identifier; the report UUID is purely internal.
 *
 * RLS (`reports_member_*` policies on app.reports) hides cross-project
 * rows. Mutating handlers additionally use the shared project-role
 * guard so row visibility is not mistaken for write authorization.
 * A hidden or role-denied (slug, number) pair surfaces as 404
 * (Pitfall 6).
 *
 * The internal UUID lookup helper `getReport(db, reportId)` is kept
 * for routes that already received it from a slug→id resolution
 * step; never trust an `id` from the client. See
 * docs/v4/design-p30-ids-slugs.md §4 and arch-ids-and-urls.md.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  reports as reportSchemas,
  paginated,
  errorEnvelope,
  cursor,
  limit,
  projectId,
  reportNumber,
} from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import {
  requireProjectOwner,
  requireProjectWriter,
} from '../lib/project-authorization.js';
import { withAuth } from '../middleware/auth.js';
import { withRateLimit } from '../middleware/rateLimit.js';
import { withIdempotency } from '../middleware/idempotency.js';
import {
  createReport,
  deleteReport,
  getReport,
  getReportByProjectSlugAndNumber,
  getReportDebug,
  listReports,
  updateReport,
  collectNotesForGeneration,
  setReportBody,
  finalizeReport,
  unfinalizeReport,
  setReportPdfFileId,
  placeNoteInReport,
  toReportResponse,
  type ReportLastGeneration,
  type ReportRow,
} from '../services/reports.js';
import { getProjectBySlug } from '../services/projects.js';
import { createReportComment, listReportComments } from '../services/report-comments.js';
import { generateReport as aiGenerateReport } from '../services/ai.js';
import { enforceUsageLimit, attachUsageWarning } from '../services/usage-limits.js';
import { getAiSettings } from '../services/settings.js';
import {
  buildStorageKey,
  pickStorage,
} from '../services/storage.js';
import {
  createFileUploadLease,
  lockFileUploadLease,
  lockFileUploadOwner,
  registerFileFromUploadLease,
} from '../services/files.js';
import { renderReportPdf } from '../services/report-pdf.js';

const projectParam = z.object({
  project: projectId.openapi({ param: { name: 'project', in: 'path' } }),
});

const reportPathParam = z.object({
  project: projectId.openapi({ param: { name: 'project', in: 'path' } }),
  number: reportNumber.openapi({ param: { name: 'number', in: 'path' } }),
});

// AI route budgets (per arch-api-design.md §Rate limiting / §Idempotency).
const MIN = 60_000;
const SERVER_PDF_UPLOAD_LEASE_MS = 5 * MIN;
const generateRateLimit = withRateLimit({ name: 'reports.generate', limit: 30, windowMs: MIN });
const generateIdempotency = withIdempotency({ name: 'reports.generate' });
// Shared per-user AI budget — same instance shape as voice.ts so the
// 60/min cap applies across voice + reports.generate. See
// arch-rate-limiting.md §3.3.
const aiUserSharedRateLimit = withRateLimit({ name: 'ai.user', limit: 60, windowMs: MIN });

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

function reportHasChanged(
  report: ReportRow,
  expectedUpdatedAt: string | undefined,
): boolean {
  return expectedUpdatedAt !== undefined
    && report.updatedAt !== expectedUpdatedAt;
}

function reportConflict(report: ReportRow) {
  return { report: toReportResponse(report) };
}

/**
 * Older mobile callers send `content-type: application/json` with no body on
 * finalize/unfinalize. Seed Hono's body cache with `{}` so adding the optional
 * precondition remains backward-compatible instead of treating that shape as
 * malformed JSON.
 */
const allowEmptyJsonBody: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (
    c.req.raw.body === null
    && c.req.header('content-type')?.startsWith('application/json')
  ) {
    c.req.bodyCache.json = Promise.resolve({});
  }
  await next();
};

// --------- list under project ----------
reportRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/projects/{project}/reports',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: projectParam,
      query: z.object({
        cursor: cursor.optional(),
        limit: limit.optional(),
        status: reportSchemas.reportStatus.optional(),
      }),
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
    const { project: slug } = c.req.valid('param');
    const q = c.req.valid('query');
    const project = await db((d) => getProjectBySlug(d, userId, slug, false));
    if (!project) throw new HTTPException(404, { message: 'Project not found.' });
    const out = await db((d) => listReports(d, {
      projectId: project.id,
      cursor: q.cursor,
      limit: q.limit ?? 20,
      status: q.status,
    }));
    return c.json({ ...out, items: out.items.map(toReportResponse) }, 200);
  },
);

// --------- finalized-report review comments ----------
reportRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/projects/{project}/reports/{number}/comments',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: reportPathParam },
    responses: {
      200: {
        description: 'Published report review comments.',
        content: { 'application/json': { schema: reportSchemas.listReportCommentsResponse } },
      },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
      409: { description: 'Report is not finalized.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { project: slug, number } = c.req.valid('param');
    const report = await loadReport(db, slug, number);
    if (report.status !== 'finalized') {
      throw new HTTPException(409, { message: 'Report must be finalized before review.' });
    }
    const items = await db((d) => listReportComments(d, report.id));
    return c.json({ items }, 200);
  },
);

reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects/{project}/reports/{number}/comments',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: reportPathParam,
      body: { content: { 'application/json': { schema: reportSchemas.createReportCommentRequest } } },
    },
    responses: {
      201: {
        description: 'Review comment created.',
        content: { 'application/json': { schema: reportSchemas.reportComment } },
      },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
      409: { description: 'Report is not finalized.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { project: slug, number } = c.req.valid('param');
    const { body } = c.req.valid('json');
    const report = await loadReport(db, slug, number);
    if (report.status !== 'finalized') {
      throw new HTTPException(409, { message: 'Report must be finalized before review.' });
    }
    const comment = await db((d) => createReportComment(d, {
      reportId: report.id,
      authorId: userId,
      body,
    }));
    return c.json(comment, 201);
  },
);

// --------- create under project ----------
reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects/{project}/reports',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: projectParam,
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
    const { project: slug } = c.req.valid('param');
    const body = c.req.valid('json');
    const project = await requireProjectWriter(db, userId, slug);
    const report = await db((d) => createReport(d, project.id, userId, body));
    if (!report) throw new HTTPException(500, { message: 'create failed' });
    return c.json(toReportResponse(report), 201);
  },
);

// --------- get ----------
reportRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/projects/{project}/reports/{number}',
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
    const { project: slug, number } = c.req.valid('param');
    const report = await loadReport(db, slug, number);
    return c.json(toReportResponse(report), 200);
  },
);

// --------- debug (P4.8) ----------
//
// Read-only "what did the LLM see and say?" view. Gated on the same
// RLS as GET /reports/{number} — `loadReport` resolves under scope so
// a non-member surfaces as 404 (Pitfall 6). Mobile client gates the
// route navigation behind `showDeveloperSection`; the API does not
// restrict access by role beyond standard membership because the data
// it returns is the user's own notes + the prompt/response that
// generated their own report.
reportRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/projects/{project}/reports/{number}/debug',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: reportPathParam },
    responses: {
      200: { description: 'Report debug payload.', content: { 'application/json': { schema: reportSchemas.reportDebugResponse } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { project: slug, number } = c.req.valid('param');
    const report = await loadReport(db, slug, number);
    const debug = await db((d) => getReportDebug(d, report.id));
    if (!debug) throw new HTTPException(404, { message: 'Report not found.' });
    return c.json(debug, 200);
  },
);

// --------- patch ----------
reportRoutes.openapi(
  createRoute({
    method: 'patch',
    path: '/projects/{project}/reports/{number}',
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
      409: {
        description: 'Report is finalized or changed elsewhere.',
        content: {
          'application/json': {
            schema: reportSchemas.reportMutationConflictResponse,
          },
        },
      },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { project: slug, number } = c.req.valid('param');
    const body = c.req.valid('json');
    const { expectedUpdatedAt, ...patch } = body;
    await requireProjectWriter(db, userId, slug);
    const existing = await loadReport(db, slug, number);
    if (reportHasChanged(existing, expectedUpdatedAt)) {
      return c.json(reportConflict(existing), 409);
    }
    // Finalized reports are locked: PATCH would silently overwrite the
    // body the user finalized, which is the opposite of what "finalize"
    // means. Surface 409 — matches /generate, /regenerate, /finalize.
    if (existing.status === 'finalized') {
      throw new HTTPException(409, { message: 'Report is finalized.' });
    }
    const report = await db((d) =>
      updateReport(d, existing.id, patch, expectedUpdatedAt),
    );
    if (!report) {
      const current = await loadReport(db, slug, number);
      return c.json(reportConflict(current), 409);
    }
    return c.json(toReportResponse(report), 200);
  },
);

// --------- attachment placement ----------
reportRoutes.openapi(
  createRoute({
    method: 'patch',
    path: '/projects/{project}/reports/{number}/attachments',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: reportPathParam,
      body: { content: { 'application/json': { schema: reportSchemas.placeReportAttachmentRequest } } },
    },
    responses: {
      200: { description: 'Attachment placement updated.', content: { 'application/json': { schema: reportSchemas.placeReportAttachmentResponse } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
      409: { description: 'Report is finalized or has a stale body version.', content: { 'application/json': { schema: reportSchemas.placeReportAttachmentResponse } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!db || !userId) throw new HTTPException(401);
    const { project: slug, number } = c.req.valid('param');
    const body = c.req.valid('json');

    await requireProjectWriter(db, userId, slug);
    const report = await loadReport(db, slug, number);
    if (report.status === 'finalized') {
      return c.json({ report: toReportResponse(report) }, 409);
    }
    const result = await db((d) =>
      placeNoteInReport(
        d,
        report.id,
        body.noteId,
        body.target,
        body.expectedBodyVersion,
      ),
    );
    if (result.ok) {
      return c.json({ report: toReportResponse(result.report) }, 200);
    }
    if (result.reason === 'conflict') {
      return c.json({ report: toReportResponse(result.report) }, 409);
    }
    if (result.reason === 'wrong-kind') {
      throw new HTTPException(400, { message: 'Attachment placement requires an image or document note.' });
    }
    if (result.reason === 'bad-target') {
      throw new HTTPException(400, { message: 'Attachment target is out of range.' });
    }
    throw new HTTPException(404, { message: 'Report or note not found.' });
  },
);

// --------- delete ----------
reportRoutes.openapi(
  createRoute({
    method: 'delete',
    path: '/projects/{project}/reports/{number}',
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
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { project: slug, number } = c.req.valid('param');
    await requireProjectWriter(db, userId, slug);
    const existing = await loadReport(db, slug, number);
    const ok = await db((d) => deleteReport(d, existing.id));
    if (!ok) throw new HTTPException(404, { message: 'Report not found.' });
    return c.body(null, 204);
  },
);

// ===========================================================================
// AI generation / finalize / pdf (P1.7)
//
// Authorization: every mutating handler checks the project role, then resolves
// the report under the per-request scoped drizzle handle before side effects.
// Missing, cross-project, and role-denied requests surface as 404. AI provider
// failures are wrapped as
// `AiProviderError` in services/ai.ts; errorMapper maps them to 502 +
// code='ai_provider_error' with no provider detail in the envelope or log.
// ===========================================================================

const generateResponses = {
  200: { description: 'Generated.', content: { 'application/json': { schema: reportSchemas.generateReportResponse } } },
  400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
  401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
  404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
  409: {
    description: 'Conflict.',
    content: {
      'application/json': {
        schema: reportSchemas.reportMutationConflictResponse,
      },
    },
  },
  502: { description: 'Upstream AI provider error.', content: { 'application/json': { schema: errorEnvelope } } },
};

/**
 * POST /reports/.../generate and /regenerate share an implementation
 * — the difference is intent, not wire shape. Both reject when the
 * report is finalized; both replace `body` and capture
 * `notes_changed_at` BEFORE the AI call so a concurrent note bump
 * landing during the multi-second run remains visible afterwards
 * (auto-regenerator sees `notes_changed_at > generated_at` and
 * fires another round). During the expand window the legacy
 * `notes_since_last_generation` counter is still reset to 0 inside
 * `setReportBody` so old machines reading the counter see clean
 * state — see docs/superpowers/specs/2026-05-28-auto-regenerate-reports-design.md.
 *
 * The structured generation payload always includes the current
 * `report.body` (null on first generate) so the model and persistence
 * layer can preserve manual edits and attachment placement.
 */
async function runGenerate(
  db: NonNullable<AppEnv['Variables']['db']>,
  userId: string,
  report: ReportRow,
  fixtureName: string | undefined,
  expectedUpdatedAt: string | undefined,
  userVendor: Parameters<typeof aiGenerateReport>[0]['userVendor'],
  userModel: Parameters<typeof aiGenerateReport>[0]['userModel'],
) {
  if (report.status === 'finalized') {
    throw new HTTPException(409, { message: 'Report is finalized.' });
  }
  // Enforce per-account monthly cap BEFORE the costly AI call. The
  // service throws UsageLimitExceededError which the errorMapper
  // renders as 403 + structured details. See
  // docs/v4/arch-usage-limits.md §4.
  await db((d) => enforceUsageLimit(d, userId, { kind: 'report_generate' }));
  // Race-safety snapshot: captured BEFORE the AI call. setReportBody
  // will set `generated_at = COALESCE(snapshotTs, now())` so any note
  // bump that lands while AI is running keeps notes_changed_at >
  // generated_at and the queue-of-one fires another regen.
  const snapshotTs = report.notesChangedAt;
  const payload = await db((d) => collectNotesForGeneration(d, report.id));
  const requestedAt = new Date().toISOString();
  const out = await aiGenerateReport({
    notes: payload,
    fixtureName,
    userVendor,
    userModel,
    usageContext: { db, userId, projectId: report.projectId, reportId: report.id },
  });
  const finishedAt = new Date().toISOString();
  // Persist the prompt + raw response alongside the new body so the
  // Report Debug screen (P4.8) can surface them. usage tokens are not
  // wired yet — left as `null` until the provider interface exposes
  // them. See docs/v4/design-maestro-full-regression.md §3.4.
  const lastGeneration: ReportLastGeneration = {
    requestedAt,
    finishedAt,
    vendor: out.vendor,
    model: out.model,
    fixtureMode: out.fixtureMode,
    systemPrompt: out.systemPrompt,
    userPrompt: out.userPrompt,
    response: out.text,
    usage: null,
  };
  const updated = await db((d) =>
    setReportBody(
      d,
      report.id,
      out.body,
      lastGeneration,
      snapshotTs,
      payload.currentBody,
      expectedUpdatedAt,
    ),
  );
  if (!updated) return null;
  return {
    report: updated,
    debug: {
      systemPrompt: out.systemPrompt,
      userPrompt: out.userPrompt,
      rawText: out.text,
      model: out.model,
      vendor: out.vendor,
    },
  };
}

reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects/{project}/reports/{number}/generate',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth(), aiUserSharedRateLimit, generateRateLimit, generateIdempotency] as const,
    request: {
      params: reportPathParam,
      body: { content: { 'application/json': { schema: reportSchemas.generateReportRequest } } },
    },
    responses: generateResponses,
  }),
  async (c) => {
    const db = c.get('db');
    const userId = c.get('userId');
    if (!db || !userId) throw new HTTPException(401);
    const { project: slug, number } = c.req.valid('param');
    const body = c.req.valid('json');
    await requireProjectWriter(db, userId, slug);
    const report = await loadReport(db, slug, number);
    if (reportHasChanged(report, body.expectedUpdatedAt)) {
      return c.json(reportConflict(report), 409);
    }
    const settings = await db((d) => getAiSettings(d, userId));
    const result = await runGenerate(
      db,
      userId,
      report,
      body.fixtureName,
      body.expectedUpdatedAt,
      settings.vendor,
      settings.model,
    );
    if (!result) {
      const current = await loadReport(db, slug, number);
      return c.json(reportConflict(current), 409);
    }
    await db((d) => attachUsageWarning(d, userId, (k, v) => c.header(k, v)));
    return c.json({ report: toReportResponse(result.report), debug: result.debug }, 200);
  },
);

reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects/{project}/reports/{number}/regenerate',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth(), aiUserSharedRateLimit, generateRateLimit, generateIdempotency] as const,
    request: {
      params: reportPathParam,
      body: { content: { 'application/json': { schema: reportSchemas.regenerateReportRequest } } },
    },
    responses: generateResponses,
  }),
  async (c) => {
    const db = c.get('db');
    const userId = c.get('userId');
    if (!db || !userId) throw new HTTPException(401);
    const { project: slug, number } = c.req.valid('param');
    const body = c.req.valid('json');
    await requireProjectWriter(db, userId, slug);
    const report = await loadReport(db, slug, number);
    if (reportHasChanged(report, body.expectedUpdatedAt)) {
      return c.json(reportConflict(report), 409);
    }
    const settings = await db((d) => getAiSettings(d, userId));
    const result = await runGenerate(
      db,
      userId,
      report,
      body.fixtureName,
      body.expectedUpdatedAt,
      settings.vendor,
      settings.model,
    );
    if (!result) {
      const current = await loadReport(db, slug, number);
      return c.json(reportConflict(current), 409);
    }
    await db((d) => attachUsageWarning(d, userId, (k, v) => c.header(k, v)));
    return c.json({ report: toReportResponse(result.report), debug: result.debug }, 200);
  },
);

// ---------- POST /projects/:project/reports/:number/finalize ----------
reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects/{project}/reports/{number}/finalize',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth(), allowEmptyJsonBody] as const,
    request: {
      params: reportPathParam,
      body: {
        required: false,
        content: {
          'application/json': {
            schema: reportSchemas.finalizeReportRequest,
          },
        },
      },
    },
    responses: {
      200: { description: 'Finalized.', content: { 'application/json': { schema: reportSchemas.finalizeReportResponse } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
      409: {
        description: 'Conflict.',
        content: {
          'application/json': {
            schema: reportSchemas.reportMutationConflictResponse,
          },
        },
      },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { project: slug, number } = c.req.valid('param');
    const body = c.req.valid('json');

    await requireProjectOwner(db, userId, slug);
    const report = await loadReport(db, slug, number);
    if (reportHasChanged(report, body.expectedUpdatedAt)) {
      return c.json(reportConflict(report), 409);
    }
    if (!report.body) {
      throw new HTTPException(409, { message: 'Report has no body to finalize.' });
    }
    if (report.status === 'finalized') {
      return c.json({ report: toReportResponse(report) }, 200);
    }
    const updated = await db((d) =>
      finalizeReport(d, report.id, body.expectedUpdatedAt),
    );
    if (!updated) {
      const current = await loadReport(db, slug, number);
      if (
        current.status === 'finalized'
        && !reportHasChanged(current, body.expectedUpdatedAt)
      ) {
        return c.json({ report: toReportResponse(current) }, 200);
      }
      return c.json(reportConflict(current), 409);
    }
    return c.json({ report: toReportResponse(updated) }, 200);
  },
);

// ---------- POST /projects/:project/reports/:number/unfinalize ----------
//
// Reverse of /finalize: flips `finalized_at` back to NULL so the user
// can edit / regenerate the report. Matches the saved-report "Edit"
// affordance (see P3.15.3). 409 if the report isn't currently
// finalized — there's nothing to undo. RLS hides cross-project rows so
// a non-owned report surfaces as 404, identical to /finalize.
reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects/{project}/reports/{number}/unfinalize',
    tags: ['reports'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth(), allowEmptyJsonBody] as const,
    request: {
      params: reportPathParam,
      body: {
        required: false,
        content: {
          'application/json': {
            schema: reportSchemas.unfinalizeReportRequest,
          },
        },
      },
    },
    responses: {
      200: { description: 'Unfinalized.', content: { 'application/json': { schema: reportSchemas.unfinalizeReportResponse } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
      409: {
        description: 'Conflict.',
        content: {
          'application/json': {
            schema: reportSchemas.reportMutationConflictResponse,
          },
        },
      },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { project: slug, number } = c.req.valid('param');
    const body = c.req.valid('json');

    await requireProjectWriter(db, userId, slug);
    const report = await loadReport(db, slug, number);
    if (reportHasChanged(report, body.expectedUpdatedAt)) {
      return c.json(reportConflict(report), 409);
    }
    if (report.status !== 'finalized') {
      throw new HTTPException(409, { message: 'Report is not finalized.' });
    }
    const updated = await db((d) =>
      unfinalizeReport(d, report.id, body.expectedUpdatedAt),
    );
    if (!updated) {
      const current = await loadReport(db, slug, number);
      return c.json(reportConflict(current), 409);
    }
    return c.json({ report: toReportResponse(updated) }, 200);
  },
);

// ---------- POST /projects/:project/reports/:number/pdf ----------
reportRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects/{project}/reports/{number}/pdf',
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
    const { project: slug, number } = c.req.valid('param');

    const report = await loadReport(db, slug, number);
    if (!report.body) {
      throw new HTTPException(409, { message: 'Report has no body to render.' });
    }

    const bytes = renderReportPdf(report);
    const storage = pickStorage();
    const scope = {
      kind: 'project' as const,
      userId,
      projectId: report.projectId,
      reportId: report.id,
      fileKind: 'pdf' as const,
    };
    const target = buildStorageKey(scope, 'application/pdf');

    // Commit the exact key before R2 sees a side effect. If the process dies
    // after the PUT but before registration commits, lease GC (or account
    // deletion) still has a durable key to remove.
    await db(async (d) => {
      if (!(await lockFileUploadOwner(d, userId))) {
        throw new HTTPException(404, { message: 'User not found.' });
      }
      await createFileUploadLease(d, userId, {
        ...target,
        scope: 'project',
        projectId: report.projectId,
        reportId: report.id,
        contentType: 'application/pdf',
        sizeBytes: bytes.length,
        presignExpiresAt: new Date(
          Date.now() + SERVER_PDF_UPLOAD_LEASE_MS,
        ).toISOString(),
      });
    });

    const put = await db(async (d) => {
      // Keep deletion on the other side of this write, and keep lease GC from
      // claiming the pre-write intent until registration commits or rolls back.
      if (!(await lockFileUploadOwner(d, userId))) {
        throw new HTTPException(404, { message: 'User not found.' });
      }
      if (
        !(await lockFileUploadLease(
          d,
          userId,
          target.fileId,
          target.fileKey,
        ))
      ) {
        throw new HTTPException(409, {
          message: 'PDF upload reservation expired.',
        });
      }

      // Server-built key (mirrors files.ts presign — never trust client input).
      // PDFs render server-side so they always have project + report scope.
      const put = await storage.putObject({
        scope,
        ...target,
        contentType: 'application/pdf',
        bytes,
      });
      const file = await registerFileFromUploadLease(d, userId, {
        id: put.fileId,
        kind: 'pdf',
        fileKey: put.fileKey,
        scope: 'project',
        sizeBytes: put.sizeBytes,
        contentType: 'application/pdf',
        projectId: report.projectId,
        reportId: report.id,
      });
      if (!file) {
        throw new HTTPException(500, { message: 'pdf register failed' });
      }
      await setReportPdfFileId(d, report.id, file.id);
      return put;
    });

    const signed = await storage.signGet(put.fileKey);
    return c.json({ url: signed.url, expiresAt: signed.expiresAt }, 200);
  },
);

// Re-export the internal lookup so notes routes (which still address
// reports by UUID until P3.1) keep working without circular imports.
export { getReport };
