import { z } from 'zod';
import { isoDateTime } from './_shared.js';
import { fileId, projectId, reportId, userId } from './ids.js';

export const fileKind = z.enum(['voice', 'image', 'document', 'pdf']);

/**
 * Upload scope discriminator (migration 0011 / arch-storage.md §Paths).
 *
 *   - `project`: file belongs to a project + report. RLS grants every
 *     project member read + write. Server routes it under
 *     `projects/<projectId>/reports/<reportId>/<fileId>.<ext>`.
 *   - `avatar` : personal profile picture (always `image`). Stored
 *     under `users/<userId>/avatar/<fileId>.<ext>`.
 *   - `scratch`: personal holding pen (debug /voice/transcribe source
 *     files, future quick captures). Owner-only. Stored under
 *     `users/<userId>/scratch/<fileId>.<ext>`.
 */
const contentType = z.string().min(1).max(200);
const sizeBytes = z.number().int().positive().max(50 * 1024 * 1024);

export const presignRequest = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('project'),
    projectId,
    reportId,
    kind: fileKind,
    contentType,
    sizeBytes,
  }),
  z.object({
    scope: z.literal('avatar'),
    // `kind` is forced server-side to `'image'` — caller never sends it.
    contentType,
    sizeBytes,
  }),
  z.object({
    scope: z.literal('scratch'),
    kind: fileKind,
    contentType,
    sizeBytes,
  }),
]);

export const presignResponse = z.object({
  uploadUrl: z.string().url(),
  fileKey: z.string(),
  /** Pre-minted `fil_…` id the server will persist in `registerFile`. */
  fileId,
  expiresAt: isoDateTime,
});

export const registerFileRequest = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('project'),
    projectId,
    reportId,
    kind: fileKind,
    fileKey: z.string().min(1),
    sizeBytes: z.number().int().positive(),
    contentType: z.string().min(1),
  }),
  z.object({
    scope: z.literal('avatar'),
    fileKey: z.string().min(1),
    sizeBytes: z.number().int().positive(),
    contentType: z.string().min(1),
  }),
  z.object({
    scope: z.literal('scratch'),
    kind: fileKind,
    fileKey: z.string().min(1),
    sizeBytes: z.number().int().positive(),
    contentType: z.string().min(1),
  }),
]);

export const fileRecord = z.object({
  id: fileId,
  ownerId: userId,
  kind: fileKind,
  fileKey: z.string(),
  sizeBytes: z.number().int(),
  contentType: z.string(),
  projectId: projectId.nullable(),
  reportId: reportId.nullable(),
  createdAt: isoDateTime,
});
export type FileRecord = z.infer<typeof fileRecord>;

export const fileUrlResponse = z.object({
  url: z.string().url(),
  expiresAt: isoDateTime,
});
