/**
 * Notes routes — list/create nested under report; patch/delete by id.
 * RLS in app.notes is the access control: member-of-project SELECT,
 * member + author INSERT, author-only UPDATE/DELETE.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import {
  notes as noteSchemas,
  paginated,
  errorEnvelope,
  cursor,
  limit,
  reportId,
  noteId,
} from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAuth } from '../middleware/auth.js';
import { createNote, deleteNote, listNotes, updateNote } from '../services/notes.js';
import { getReport } from '../services/reports.js';

const reportParam = z.object({ report: reportId.openapi({ param: { name: 'report', in: 'path' } }) });
const noteParam = z.object({ note: noteId.openapi({ param: { name: 'note', in: 'path' } }) });

export const noteRoutes = new OpenAPIHono<AppEnv>();

// --------- list under report ----------
noteRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/reports/{report}/notes',
    tags: ['notes'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: reportParam,
      query: z.object({ cursor: cursor.optional(), limit: limit.optional() }),
    },
    responses: {
      200: { description: 'Notes timeline.', content: { 'application/json': { schema: paginated(noteSchemas.note) } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Report not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { report: reportId } = c.req.valid('param');
    const q = c.req.valid('query');
    const report = await db((d) => getReport(d, reportId));
    if (!report) throw new HTTPException(404, { message: 'Report not found.' });
    const out = await db((d) => listNotes(d, reportId, { cursor: q.cursor, limit: q.limit ?? 50 }));
    return c.json(out, 200);
  },
);

// --------- create under report ----------
noteRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/reports/{report}/notes',
    tags: ['notes'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: reportParam,
      body: { content: { 'application/json': { schema: noteSchemas.createNoteRequest } } },
    },
    responses: {
      201: { description: 'Created.', content: { 'application/json': { schema: noteSchemas.note } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Report not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { report: reportId } = c.req.valid('param');
    const body = c.req.valid('json');
    const report = await db((d) => getReport(d, reportId));
    if (!report) throw new HTTPException(404, { message: 'Report not found.' });
    const note = await db((d) => createNote(d, reportId, userId, body));
    if (!note) throw new HTTPException(500, { message: 'create failed' });
    return c.json(note, 201);
  },
);

// --------- patch ----------
noteRoutes.openapi(
  createRoute({
    method: 'patch',
    path: '/notes/{note}',
    tags: ['notes'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: noteParam,
      body: { content: { 'application/json': { schema: noteSchemas.updateNoteRequest } } },
    },
    responses: {
      200: { description: 'Updated.', content: { 'application/json': { schema: noteSchemas.note } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found or not author.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { note: noteId } = c.req.valid('param');
    const patch = c.req.valid('json');
    if (
      patch.body === undefined &&
      patch.title === undefined &&
      patch.summary === undefined
    ) {
      throw new HTTPException(400, { message: 'Empty patch.' });
    }
    const note = await db((d) => updateNote(d, noteId, patch));
    if (!note) throw new HTTPException(404, { message: 'Note not found or not author.' });
    return c.json(note, 200);
  },
);

// --------- delete ----------
noteRoutes.openapi(
  createRoute({
    method: 'delete',
    path: '/notes/{note}',
    tags: ['notes'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: noteParam },
    responses: {
      204: { description: 'Deleted.' },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found or not author.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const { note: noteId } = c.req.valid('param');
    const ok = await db((d) => deleteNote(d, noteId));
    if (!ok) throw new HTTPException(404, { message: 'Note not found or not author.' });
    return c.body(null, 204);
  },
);
