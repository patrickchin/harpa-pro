/**
 * `useCameraUploads` — bridges the camera-session-registry handoff to
 * the upload queue.
 *
 * Callers create a camera session, push `(camera)/capture`, and on
 * focus-return drain the session via `consumeCameraSession`. This hook
 * wraps `useFileUpload` with a single entrypoint that takes that URI
 * list, runs each through `processImageForUpload` (downscale ≤ 2048 px,
 * JPEG quality ladder targeting ≤ 2 MB, strip EXIF), and enqueues one
 * upload per processed URI tagged with the caller's `reportId` so the
 * upload pipeline also creates the timeline note (Pitfall 8).
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
    opts: { reportId: string },
  ) => Promise<Array<PromiseSettledResult<UploadResult>>>;
}

function filenameFromUri(uri: string, index: number): string {
  const last = uri.split('/').pop();
  if (last && last.length > 0) return last;
  return `capture-${index + 1}.jpg`;
}

export function useCameraUploads(): UseCameraUploadsApi {
  const { enqueue } = useFileUpload();

  const enqueueCameraUris = useCallback(
    async (
      uris: ReadonlyArray<string>,
      opts: { reportId: string },
    ): Promise<Array<PromiseSettledResult<UploadResult>>> => {
      if (uris.length === 0) return [];
      const promises = uris.map(async (uri, idx) => {
        // Downscale + re-encode BEFORE statSize/presign so we never
        // ship a > 50 MB blob (server cap) and we strip EXIF along
        // the way. See `process-image.ts` for the size/quality
        // ladder. The processed URI is what we PUT to R2.
        const processed = await processImageForUpload(uri);
        if (processed.sizeBytes > SERVER_MAX_BYTES) {
          throw new Error(
            `Camera upload: processed image at ${uri} is ` +
              `${processed.sizeBytes} bytes, exceeds 50 MB server limit`,
          );
        }
        return enqueue({
          sourceUri: processed.uri,
          kind: 'image',
          filename: filenameFromUri(uri, idx),
          contentType: 'image/jpeg',
          sizeBytes: processed.sizeBytes,
          reportId: opts.reportId,
        });
      });
      return Promise.allSettled(promises);
    },
    [enqueue],
  );

  return { enqueueCameraUris };
}
