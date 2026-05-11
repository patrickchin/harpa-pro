import { z } from 'zod';
import { isoDateTime, uuid } from './_shared.js';

export const fileKind = z.enum(['voice', 'image', 'document', 'pdf']);

export const presignRequest = z.object({
  kind: fileKind,
  contentType: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
});
export const presignResponse = z.object({
  uploadUrl: z.string().url(),
  fileKey: z.string(),
  expiresAt: isoDateTime,
});

export const registerFileRequest = z.object({
  kind: fileKind,
  fileKey: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  contentType: z.string().min(1),
});

export const fileRecord = z.object({
  id: uuid,
  ownerId: uuid,
  kind: fileKind,
  fileKey: z.string(),
  sizeBytes: z.number().int(),
  contentType: z.string(),
  createdAt: isoDateTime,
});
export type FileRecord = z.infer<typeof fileRecord>;

export const fileUrlResponse = z.object({
  url: z.string().url(),
  expiresAt: isoDateTime,
});
