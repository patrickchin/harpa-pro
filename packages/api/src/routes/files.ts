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
 *  - Server constructs every fileKey; clients never supply one for presign.
 *  - Register requires the registered key to start with the caller's
 *    `users/<userId>/` prefix — stops a caller registering another user's
 *    object key under their own id.
 *  - Ownership on GET is enforced via app.files RLS (`files_owner_all`).
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { files as fileSchemas, errorEnvelope, uuid } from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAuth } from '../middleware/auth.js';
import { getFileById, registerFile } from '../services/files.js';
import { pickStorage, type FileKind } from '../services/storage.js';

const fileIdParam = z.object({ id: uuid.openapi({ param: { name: 'id', in: 'path' } }) });

export const fileRoutes = new OpenAPIHono<AppEnv>();

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
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    if (!userId) throw new HTTPException(401);
    const body = c.req.valid('json');
    const storage = pickStorage();
    const out = await storage.presign({
      userId,
      kind: body.kind as FileKind,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
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
      400: { description: 'Bad request — fileKey must start with users/<callerId>/.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      409: { description: 'Conflict — fileKey already registered.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const body = c.req.valid('json');
    const expectedPrefix = `users/${userId}/`;
    if (!body.fileKey.startsWith(expectedPrefix)) {
      throw new HTTPException(400, {
        message: 'fileKey must start with the caller\'s users/<id>/ prefix.',
      });
    }
    try {
      const row = await db((d) => registerFile(d, userId, {
        kind: body.kind as FileKind,
        fileKey: body.fileKey,
        sizeBytes: body.sizeBytes,
        contentType: body.contentType,
      }));
      if (!row) throw new HTTPException(500, { message: 'register failed' });
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
      404: { description: 'Not found or not owned.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { id } = c.req.valid('param');
    const row = await db((d) => getFileById(d, id));
    if (!row) throw new HTTPException(404, { message: 'File not found.' });
    const out = await pickStorage().signGet(row.fileKey);
    return c.json(out, 200);
  },
);
