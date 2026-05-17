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
