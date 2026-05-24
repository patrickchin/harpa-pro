import { z } from 'zod';
import { isoDateTime } from './_shared.js';
import { fileId, noteId, reportId, userId } from './ids.js';

export const noteKind = z.enum(['text', 'voice', 'image', 'document']);

export const note = z.object({
  id: noteId,
  reportId: reportId,
  authorId: userId,
  kind: noteKind,
  body: z.string().nullable(),
  fileId: fileId.nullable(),
  /** Thumbnail variant for image notes. Null for non-image kinds and
   *  for legacy image notes uploaded before client-side thumbnailing
   *  shipped — those fall back to `fileId` for grid rendering. */
  thumbnailFileId: fileId.nullable(),
  transcript: z.string().nullable(),
  // Generic note-level fields (migration 0004). Nullable on every
  // kind. Today the voice aggregator (`POST /reports/{report}/notes/voice`)
  // is the only writer — it stores the LLM summary in `summary` and a
  // short headline (≤ 200 chars) in `title`. Text / image / document
  // notes leave them null but may populate them in the future
  // (e.g. user-supplied document title, photo caption).
  //
  // These are `.nullable()` (NOT `.optional()`) because the server
  // always returns the key (drizzle reads the column and serialises
  // `null` for unset values). Marking them `.optional()` here would
  // tell clients to handle `undefined` as well as `null`, which is
  // strictly wrong for the response shape — see Audit C in
  // docs/v4/arch-data-layer.md.
  title: z.string().max(200).nullable(),
  summary: z.string().nullable(),
  // Voice-only diagnostics (migration 0004 / arch-voice-pipeline.md §D3).
  // Populated only on `kind='voice'` rows; null elsewhere — but the
  // key is always present.
  durationSec: z.number().int().min(0).nullable(),
  language: z.string().min(2).max(16).nullable(),
  transcribeProvider: z.string().nullable(),
  transcribedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Note = z.infer<typeof note>;

export const createNoteRequest = z.object({
  kind: noteKind,
  body: z.string().nullable().optional(),
  fileId: fileId.nullable().optional(),
  /** Optional thumbnail file id for image notes. Ignored for other kinds. */
  thumbnailFileId: fileId.nullable().optional(),
  transcript: z.string().nullable().optional(),
  /** Optional short headline. Capped at 200 chars (matches the DB
   *  CHECK constraint on `app.notes.title`). */
  title: z.string().max(200).nullable().optional(),
  /** Optional long-form summary. */
  summary: z.string().nullable().optional(),
});

/**
 * PATCH semantics: `undefined` leaves a field unchanged, `null`
 * clears it, a string overwrites. At least one field must be
 * provided (enforced at the route boundary).
 */
export const updateNoteRequest = z.object({
  body: z.string().nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  summary: z.string().nullable().optional(),
});

/**
 * Voice-note aggregator request body
 * (`POST /reports/{report}/notes/voice`).
 *
 * The aggregator transcribes + summarises `fileId` and inserts one
 * `app.notes` row in one scoped transaction. Idempotent on the
 * caller-supplied `Idempotency-Key` header (mobile sends
 * `voice:<fileId>:<reportId>` so retries dedupe to one note row and
 * one pair of `llm_usage_events` rows). See
 * docs/v4/arch-voice-pipeline.md §D2.
 *
 * `fixtureName` mirrors the existing `/voice/transcribe` body — used
 * only by the test harness when it wants to pin a specific
 * @harpa/ai-fixtures replay payload.
 */
const fixtureName = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._-]+$/, 'fixtureName must match /^[a-zA-Z0-9._-]+$/');

export const createVoiceNoteRequest = z.object({
  fileId,
  language: z.string().min(2).max(16).optional(),
  durationSec: z.number().int().min(1).max(60 * 60).optional(),
  fixtureName: fixtureName.optional(),
});
export type CreateVoiceNoteRequest = z.infer<typeof createVoiceNoteRequest>;
