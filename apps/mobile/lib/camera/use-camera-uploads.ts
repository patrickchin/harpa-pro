/**
 * `useCameraUploads` — bridges the camera-session-registry handoff to
 * the upload queue.
 *
 * Callers create a camera session, push `(camera)/capture`, and on
 * focus-return drain the session via `consumeCameraSession`. This hook
 * wraps `useFileUpload` with a single entrypoint that takes that URI
 * list, runs each through `processImageForUpload` (downscale ≤ 2048 px,
 * JPEG quality ladder targeting ≤ 2 MB, strip EXIF), and enqueues one
 * batch upload tagged with the caller's `reportId` so the upload
 * pipeline creates a single timeline note for the whole camera session
 * (Pitfall 8).
 *
 * Empty URI lists are a no-op. The processor returns the real
 * post-encode `sizeBytes`, so the presign request always carries an
 * accurate Content-Length — defending against the SigV4
 * `SignatureDoesNotMatch` failure mode that the previous statSize-only
 * path was rewritten to avoid.
 */
import { useCallback } from 'react';

import { useFileUpload } from '@/lib/uploads';
import type { UploadResult } from '@/lib/uploads';
import {
  processImageForUpload,
  processImageThumbnail,
  SERVER_MAX_BYTES,
} from './process-image';

export interface UseCameraUploadsApi {
  /**
   * Enqueue every camera URI as an `image` upload bound to the
   * provided `reportId`. Returns the per-URI settlement so callers
   * can surface a "3/4 uploaded" toast if any fail.
   */
  enqueueCameraUris: (
    uris: ReadonlyArray<string>,
    opts: { reportId: string; projectId: string },
  ) => Promise<Array<PromiseSettledResult<UploadResult>>>;
}

function filenameFromUri(uri: string, index: number): string {
  const last = uri.split('/').pop();
  if (last && last.length > 0) return last;
  return `capture-${index + 1}.jpg`;
}

export function useCameraUploads(): UseCameraUploadsApi {
  const { enqueueBatch } = useFileUpload();

  const enqueueCameraUris = useCallback(
    async (
      uris: ReadonlyArray<string>,
      opts: { reportId: string; projectId: string },
    ): Promise<Array<PromiseSettledResult<UploadResult>>> => {
      if (uris.length === 0) return [];

      // Process all images first (downscale + thumbnail generation).
      // Use allSettled so one bad image doesn't kill the whole batch.
      const settlements = await Promise.allSettled(
        uris.map(async (uri, idx) => {
          const [main, thumbnail] = await Promise.all([
            processImageForUpload(uri),
            processImageThumbnail(uri).catch(() => null),
          ]);
          if (main.sizeBytes > SERVER_MAX_BYTES) {
            throw new Error(
              `Camera upload: processed image at ${uri} is ` +
                `${main.sizeBytes} bytes, exceeds 50 MB server limit`,
            );
          }
          return {
            sourceUri: main.uri,
            kind: 'image' as const,
            filename: filenameFromUri(uri, idx),
            contentType: 'image/jpeg' as const,
            sizeBytes: main.sizeBytes,
            reportId: opts.reportId,
            projectId: opts.projectId,
            ...(thumbnail
              ? {
                  thumbnail: {
                    sourceUri: thumbnail.uri,
                    contentType: 'image/jpeg',
                    sizeBytes: thumbnail.sizeBytes,
                  },
                }
              : {}),
          };
        }),
      );

      // Collect successfully processed inputs for the batch
      const validInputs: Array<(typeof settlements)[number] & { status: 'fulfilled' }> = [];
      const results: Array<PromiseSettledResult<UploadResult>> = new Array(uris.length);

      for (let i = 0; i < settlements.length; i++) {
        const s = settlements[i]!;
        if (s.status === 'rejected') {
          results[i] = { status: 'rejected', reason: s.reason };
        } else {
          validInputs.push(s);
        }
      }

      if (validInputs.length === 0) return results;

      // Enqueue as a single batch — one timeline note for the whole session
      const { promises } = enqueueBatch(validInputs.map((s) => s.value));
      const batchResults = await Promise.allSettled(promises);

      // Merge batch results back into the original index order
      let batchIdx = 0;
      for (let i = 0; i < settlements.length; i++) {
        if (settlements[i]!.status === 'fulfilled') {
          results[i] = batchResults[batchIdx++]!;
        }
      }

      return results;
    },
    [enqueueBatch],
  );

  return { enqueueCameraUris };
}
