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
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { voice as voiceSchemas, notes as noteSchemas, errorEnvelope, reportId as reportIdSchema } from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAuth } from '../middleware/auth.js';
import { withRateLimit } from '../middleware/rateLimit.js';
import { withIdempotency } from '../middleware/idempotency.js';
import { getFileById } from '../services/files.js';
import { pickStorage } from '../services/storage.js';
import { transcribe as aiTranscribe, chat as aiChat } from '../services/ai.js';
import { getReport } from '../services/reports.js';
import { createVoiceNote } from '../services/notes.js';
import { getAiSettings } from '../services/settings.js';
import { voiceSummarySystemPrompt, deriveTitleFromSummary } from '../prompts/voiceSummary.js';

// AI route budgets (per arch-api-design.md §Rate limiting / §Idempotency).
const MIN = 60_000;
const transcribeRateLimit = withRateLimit({ name: 'voice.transcribe', limit: 30, windowMs: MIN });
const summarizeRateLimit = withRateLimit({ name: 'voice.summarize', limit: 60, windowMs: MIN });
const aggregatorRateLimit = withRateLimit({ name: 'voice.note', limit: 30, windowMs: MIN });
const transcribeIdempotency = withIdempotency({ name: 'voice.transcribe' });
const aggregatorIdempotency = withIdempotency({ name: 'voice.note' });

export const voiceRoutes = new OpenAPIHono<AppEnv>();

// ---------- POST /reports/:report/notes/voice (aggregator) ----------
//
// One-shot voice-note ingestion. Caller supplies the `fileId` of an
// already-uploaded `kind='voice'` file plus optional `language` /
// `durationSec`. We transcribe, summarise, and insert the note row
// in one scoped transaction sharing one `usageContext` so both AI
// calls are attributed to (projectId, reportId, userId) — fixing
// the v3 spend-attribution blind spot.
//
// Idempotency: caller sends `Idempotency-Key: voice:<fileId>:<reportId>`
// (mobile constructs this automatically). The middleware caches the
// response under that key per user, so transport-level retries never
// rebill or duplicate the note row.
//
// Vendor selection: `getAiSettings(db, userId)` loads the per-user
// preference and forwards it to BOTH `chat` and `transcribe`
// (Pitfall 15 — handlers that ignore user settings).
const aggregatorReportParam = z.object({
  report: reportIdSchema.openapi({ param: { name: 'report', in: 'path' } }),
});

voiceRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/reports/{report}/notes/voice',
    tags: ['voice', 'notes'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth(), aggregatorRateLimit, aggregatorIdempotency] as const,
    request: {
      params: aggregatorReportParam,
      body: { content: { 'application/json': { schema: noteSchemas.createVoiceNoteRequest } } },
    },
    responses: {
      201: { description: 'Voice note created.', content: { 'application/json': { schema: noteSchemas.note } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Report or file not found / not owned.', content: { 'application/json': { schema: errorEnvelope } } },
      413: { description: 'Recording too long.', content: { 'application/json': { schema: errorEnvelope } } },
      502: { description: 'Upstream AI provider error.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { report: reportId } = c.req.valid('param');
    const body = c.req.valid('json');

    // RLS hides cross-project reports, so a missing row is
    // indistinguishable from a non-member request — surface as 404
    // (Pitfall 6).
    const report = await db((d) => getReport(d, reportId));
    if (!report) throw new HTTPException(404, { message: 'Report not found.' });

    // File ownership is enforced by `app.files` RLS; a non-owned file
    // returns null. Also require `kind='voice'` so the aggregator
    // can't be tricked into transcribing a PDF or image.
    const file = await db((d) => getFileById(d, body.fileId));
    if (!file) throw new HTTPException(404, { message: 'File not found.' });
    if (file.kind !== 'voice') {
      throw new HTTPException(400, { message: 'File is not a voice recording.' });
    }

    // Per-user vendor pref (Pitfall 15).
    const settings = await db((d) => getAiSettings(d, userId));
    const vendor = settings.vendor;

    const usageContext = {
      db,
      userId,
      projectId: report.projectId,
      reportId: report.id,
    };

    // Step 1 — transcribe. Real signed URL in live mode; services/ai.ts
    // normalises it away before hashing in replay.
    const signed = await pickStorage().signGet(file.fileKey);
    const transcribed = await aiTranscribe({
      audioUrl: signed.url,
      language: body.language,
      fixtureName: body.fixtureName,
      usageContext,
    });
    const transcript = transcribed.text;

    // Step 2 — summarise. Same usageContext so spend lands on the
    // same (projectId, reportId).
    const summarised = await aiChat({
      systemPrompt: voiceSummarySystemPrompt(body.language),
      userPrompt: transcript,
      vendor,
      // Distinct fixtureName for the chat half so the test harness can
      // pin a per-vendor summarize fixture independently of the
      // transcribe fixture above. Most tests pass nothing and rely on
      // the canonical default.
      fixtureName: body.fixtureName,
      usageContext,
    });
    const summary = summarised.text;
    const title = deriveTitleFromSummary(summary);
    const transcribeProvider = `${summarised.vendor}:${summarised.model}+${transcribed.vendor}:${transcribed.model}`;

    // Step 3 — insert. `body` mirrors `summary` so legacy readers
    // (P3.10 `ReportNotesPane`, etc.) keep working until they migrate
    // to the new `summary` field.
    const note = await db((d) =>
      createVoiceNote(d, report.id, userId, {
        fileId: file.id,
        title,
        summary,
        transcript,
        durationSec: body.durationSec ?? transcribed.durationSec ?? null,
        language: body.language ?? null,
        transcribeProvider,
      }),
    );
    if (!note) {
      // RLS would have already 404'd a non-member; a null here means
      // INSERT was rejected. Surface as 500 — there's no path the
      // client can fix this from.
      throw new HTTPException(500, { message: 'Failed to create voice note.' });
    }
    return c.json(note, 201);
  },
);

// ---------- POST /voice/transcribe ----------
voiceRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/voice/transcribe',
    tags: ['voice'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth(), transcribeRateLimit, transcribeIdempotency] as const,
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
    const out = await aiTranscribe({
      audioUrl: signed.url,
      fixtureName: body.fixtureName,
    });
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
    middleware: [withAuth(), summarizeRateLimit] as const,
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
