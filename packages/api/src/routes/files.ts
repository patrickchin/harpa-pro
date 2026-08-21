/**
 * Files routes:
 *   POST /files/presign   — mint a server-built object key + signed PUT URL.
 *   POST /files           — register an uploaded object (insert app.files).
 *   GET  /files/:id/url   — return a signed GET URL for an owned file.
 *
 * The storage layer (services/storage.ts) abstracts FixtureStorage (CI +
 * `:mock`) vs R2Storage (prod) so no R2 calls happen in tests.
 *
 * Security:
 *  - Server constructs every fileKey (Pitfall 8) — clients never supply
 *    one for presign. Presign mints a `fil_…` id and returns it; the
 *    embedded key is `projects/<projectId>/reports/<reportId>/<fileId>.<ext>`
 *    for project scope, `users/<userId>/<avatar|scratch>/<fileId>.<ext>`
 *    for personal scopes.
 *  - Register parses the key back via `parseKeyScope`, verifies the
 *    embedded scope + ids, and atomically consumes the exact upload
 *    lease before INSERT.
 *  - `app.files` RLS (migration 0011) provides project-member reads.
 *    Project presign/register routes additionally require an
 *    owner/editor role; avatar and scratch scopes remain personal.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { files as fileSchemas, errorEnvelope, fileId } from '@harpa/api-contract';
import type { AppEnv, ScopedDbAccessor } from '../app.js';
import { openApiHonoOptions } from '../lib/openapi.js';
import { requireProjectWriter } from '../lib/project-authorization.js';
import { withAuth } from '../middleware/auth.js';
import {
  createFileUploadLease,
  fileUploadLeasesEnforced,
  getFileById,
  hasFileUploadLease,
  lockFileUploadOwner,
  registerFile,
  registerFileFromUploadLease,
} from '../services/files.js';
import { getReport } from '../services/reports.js';
import {
  pickStorage,
  parseKeyScope,
  type FileKind,
  type PresignScope,
} from '../services/storage.js';

const fileIdParam = z.object({ id: fileId.openapi({ param: { name: 'id', in: 'path' } }) });
type ScopedDb = Parameters<Parameters<ScopedDbAccessor>[0]>[0];

export const fileRoutes = new OpenAPIHono<AppEnv>(openApiHonoOptions);

/**
 * Assert the caller can upload into `projectId`. Viewers can read
 * project files but cannot mint or register new project objects.
 */
async function assertProjectWriter(
  db: ScopedDb,
  userId: string,
  projectId: string,
): Promise<void> {
  const accessor: ScopedDbAccessor = <T>(
    fn: (scopedDb: ScopedDb) => Promise<T>,
  ) => fn(db);
  await requireProjectWriter(accessor, userId, projectId);
}

/**
 * Assert `reportId` exists and belongs to `projectId`. Same 404 on
 * absent / cross-project as a non-member (Pitfall 6).
 */
async function assertReportInProject(
  db: ScopedDb,
  reportId: string,
  projectId: string,
): Promise<void> {
  const report = await getReport(db, reportId);
  if (!report || report.projectId !== projectId) {
    throw new HTTPException(404, { message: 'Report not found.' });
  }
}

// ---------- POST /files/presign ----------
fileRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/files/presign',
    tags: ['files'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      body: { content: { 'application/json': { schema: fileSchemas.presignRequest } } },
    },
    responses: {
      200: { description: 'Presigned upload URL.', content: { 'application/json': { schema: fileSchemas.presignResponse } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Project / report not found or not a member.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const body = c.req.valid('json');

    const out = await db(async (scopedDb) => {
      if (!(await lockFileUploadOwner(scopedDb, userId))) {
        throw new HTTPException(401, { message: 'User no longer exists.' });
      }

      let scope: PresignScope;
      switch (body.scope) {
        case 'project': {
          await assertProjectWriter(scopedDb, userId, body.projectId);
          await assertReportInProject(scopedDb, body.reportId, body.projectId);
          scope = {
            kind: 'project',
            userId,
            projectId: body.projectId,
            reportId: body.reportId,
            fileKind: body.kind as FileKind,
          };
          break;
        }
        case 'avatar': {
          if (!body.contentType.startsWith('image/')) {
            throw new HTTPException(400, {
              message: 'Avatar content-type must be image/*.',
            });
          }
          scope = { kind: 'avatar', userId };
          break;
        }
        case 'scratch': {
          scope = { kind: 'scratch', userId, fileKind: body.kind as FileKind };
          break;
        }
      }

      const signed = await pickStorage().presign({
        scope,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
      });
      await createFileUploadLease(scopedDb, userId, {
        fileId: signed.fileId,
        fileKey: signed.fileKey,
        scope: body.scope,
        projectId: body.scope === 'project' ? body.projectId : null,
        reportId: body.scope === 'project' ? body.reportId : null,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        presignExpiresAt: signed.expiresAt,
      });
      return signed;
    });

    return c.json(out, 200);
  },
);

// ---------- POST /files (register) ----------
fileRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/files',
    tags: ['files'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      body: { content: { 'application/json': { schema: fileSchemas.registerFileRequest } } },
    },
    responses: {
      201: { description: 'Created.', content: { 'application/json': { schema: fileSchemas.fileRecord } } },
      400: { description: 'Bad request — fileKey shape / scope mismatch.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Project / report not found or not a member.', content: { 'application/json': { schema: errorEnvelope } } },
      409: { description: 'Conflict — upload lease missing, mismatched, or already consumed.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const body = c.req.valid('json');

    const parsed = parseKeyScope(body.fileKey);
    if (!parsed) {
      throw new HTTPException(400, { message: 'Malformed fileKey.' });
    }
    if (parsed.scope !== body.scope) {
      throw new HTTPException(400, { message: 'fileKey scope does not match request.' });
    }

    let kind: FileKind;
    let projectIdValue: string | null = null;
    let reportIdValue: string | null = null;

    switch (body.scope) {
      case 'project': {
        if (parsed.scope !== 'project') {
          throw new HTTPException(400, { message: 'fileKey scope mismatch.' });
        }
        if (parsed.projectId !== body.projectId || parsed.reportId !== body.reportId) {
          throw new HTTPException(400, {
            message: 'fileKey ids do not match request projectId / reportId.',
          });
        }
        kind = body.kind as FileKind;
        projectIdValue = body.projectId;
        reportIdValue = body.reportId;
        break;
      }
      case 'avatar': {
        if (parsed.scope !== 'avatar') {
          throw new HTTPException(400, { message: 'fileKey scope mismatch.' });
        }
        if (parsed.userId !== userId) {
          throw new HTTPException(400, {
            message: 'fileKey must be under the caller\'s users/<id>/ prefix.',
          });
        }
        if (!body.contentType.startsWith('image/')) {
          throw new HTTPException(400, {
            message: 'Avatar content-type must be image/*.',
          });
        }
        kind = 'image';
        break;
      }
      case 'scratch': {
        if (parsed.scope !== 'scratch') {
          throw new HTTPException(400, { message: 'fileKey scope mismatch.' });
        }
        if (parsed.userId !== userId) {
          throw new HTTPException(400, {
            message: 'fileKey must be under the caller\'s users/<id>/ prefix.',
          });
        }
        kind = body.kind as FileKind;
        break;
      }
    }

    try {
      const row = await db(async (scopedDb) => {
        if (!(await lockFileUploadOwner(scopedDb, userId))) {
          throw new HTTPException(401, { message: 'User no longer exists.' });
        }
        if (body.scope === 'project') {
          await assertProjectWriter(scopedDb, userId, body.projectId);
          await assertReportInProject(scopedDb, body.reportId, body.projectId);
        }

        const input = {
          id: parsed.fileId,
          kind,
          fileKey: body.fileKey,
          sizeBytes: body.sizeBytes,
          contentType: body.contentType,
          projectId: projectIdValue,
          reportId: reportIdValue,
        };
        const leased = await registerFileFromUploadLease(
          scopedDb,
          userId,
          {
            ...input,
            scope: body.scope,
          },
        );
        if (leased) return leased;

        const enforced = await fileUploadLeasesEnforced(scopedDb);
        const leasePresent = await hasFileUploadLease(
          scopedDb,
          userId,
          parsed.fileId,
          body.fileKey,
        );
        if (!enforced && !leasePresent) {
          return registerFile(scopedDb, userId, input);
        }
        return null;
      });
      if (!row) {
        throw new HTTPException(409, {
          message: 'Upload lease is missing, mismatched, or already consumed.',
        });
      }
      return c.json(row, 201);
    } catch (err) {
      // app.files.file_key has a UNIQUE constraint — surface re-registration as 409.
      if (err instanceof Error && /unique|duplicate/i.test(err.message)) {
        throw new HTTPException(409, { message: 'fileKey already registered.' });
      }
      throw err;
    }
  },
);

// ---------- GET /files/:id/url ----------
fileRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/files/{id}/url',
    tags: ['files'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: fileIdParam },
    responses: {
      200: { description: 'Signed GET URL.', content: { 'application/json': { schema: fileSchemas.fileUrlResponse } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found or not visible.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { id } = c.req.valid('param');
    const row = await db((d) => getFileById(d, id));
    if (!row) throw new HTTPException(404, { message: 'File not found.' });
    const out = await pickStorage().signGet(row.fileKey);
    return c.json({
      ...out,
      sizeBytes: row.sizeBytes,
      contentType: row.contentType,
      createdAt: row.createdAt,
    }, 200);
  },
);
