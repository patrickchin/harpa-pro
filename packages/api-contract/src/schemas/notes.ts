import { z } from 'zod';
import { isoDateTime, uuid } from './_shared.js';

export const noteKind = z.enum(['text', 'voice', 'image', 'document']);

export const note = z.object({
  id: uuid,
  reportId: uuid,
  authorId: uuid,
  kind: noteKind,
  body: z.string().nullable(),
  fileId: uuid.nullable(),
  transcript: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Note = z.infer<typeof note>;

export const createNoteRequest = z.object({
  kind: noteKind,
  body: z.string().nullable().optional(),
  fileId: uuid.nullable().optional(),
  transcript: z.string().nullable().optional(),
});

export const updateNoteRequest = z.object({
  body: z.string().nullable(),
});
