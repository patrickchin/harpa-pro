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
  transcript: z.string().nullable(),
  // Voice-note pipeline fields (migration 0004 / arch-voice-pipeline.md §D3).
  // Nullable for all kinds; populated only on `kind='voice'` rows
  // produced by `POST /reports/{report}/notes/voice`. Legacy text /
  // image / document notes leave them null.
  summary: z.string().nullable().optional(),
  durationSec: z.number().int().min(0).nullable().optional(),
  language: z.string().min(2).max(16).nullable().optional(),
  transcribeProvider: z.string().nullable().optional(),
  transcribedAt: isoDateTime.nullable().optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Note = z.infer<typeof note>;

export const createNoteRequest = z.object({
  kind: noteKind,
  body: z.string().nullable().optional(),
  fileId: fileId.nullable().optional(),
  transcript: z.string().nullable().optional(),
});

export const updateNoteRequest = z.object({
  body: z.string().nullable(),
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
