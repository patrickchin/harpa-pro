/**
 * Voice routes:
 *   POST /voice/transcribe — transcribe an owned audio file via the AI
 *                            provider (replay fixtures in CI).
 *   POST /voice/summarize  — summarise a transcript via the AI provider.
 *
 * Provider calls go through services/ai.ts which routes to
 * @harpa/ai-fixtures. CI pins AI_FIXTURE_MODE/AI_LIVE so no real provider
 * is hit. Server-side normalisation in services/ai.ts means the caller's
 * supplied audio URL / fileId never reaches a real provider in replay.
 *
 * Security:
 *  - File ownership on /voice/transcribe is enforced via app.files RLS
 *    (`files_owner_all`) — `getFileById` returns null for non-owned ids
 *    so they surface as 404 (mirror of GET /files/:id/url).
 *  - Provider errors are wrapped as AiProviderError → errorMapper turns
 *    them into a generic 502 envelope (no fixture name, no provider
 *    detail, no internal URL leaks).
 *
 * Refs: docs/v4/arch-api-design.md §Voice, plan-p1-api-core.md §P1.6,
 *       docs/v4/arch-ai-fixtures.md.
 */
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { voice as voiceSchemas, errorEnvelope } from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAuth } from '../middleware/auth.js';
import { getFileById } from '../services/files.js';
import { pickStorage } from '../services/storage.js';
import { transcribe as aiTranscribe, chat as aiChat } from '../services/ai.js';

export const voiceRoutes = new OpenAPIHono<AppEnv>();

// ---------- POST /voice/transcribe ----------
voiceRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/voice/transcribe',
    tags: ['voice'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      body: { content: { 'application/json': { schema: voiceSchemas.transcribeRequest } } },
    },
    responses: {
      200: { description: 'Transcript.', content: { 'application/json': { schema: voiceSchemas.transcribeResponse } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'File not found or not owned.', content: { 'application/json': { schema: errorEnvelope } } },
      502: { description: 'Upstream AI provider error.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(401);
    const body = c.req.valid('json');
    const row = await db((d) => getFileById(d, body.fileId));
    if (!row) throw new HTTPException(404, { message: 'File not found.' });
    // Mint a real signed URL even in fixture mode — services/ai.ts
    // normalises it away before hashing in replay. In live mode the
    // provider will fetch this URL.
    const signed = await pickStorage().signGet(row.fileKey);
    const out = await aiTranscribe({ audioUrl: signed.url, fixtureName: body.fixtureName });
    return c.json({ transcript: out.text }, 200);
  },
);

// ---------- POST /voice/summarize ----------
voiceRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/voice/summarize',
    tags: ['voice'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      body: { content: { 'application/json': { schema: voiceSchemas.summarizeRequest } } },
    },
    responses: {
      200: { description: 'Summary.', content: { 'application/json': { schema: voiceSchemas.summarizeResponse } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      502: { description: 'Upstream AI provider error.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    if (!userId) throw new HTTPException(401);
    const body = c.req.valid('json');
    const out = await aiChat({
      systemPrompt: 'Summarise the following transcript into a concise site-note body.',
      userPrompt: body.transcript,
      fixtureName: body.fixtureName,
    });
    return c.json({ summary: out.text }, 200);
  },
);
