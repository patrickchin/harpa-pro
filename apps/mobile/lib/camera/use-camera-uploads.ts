/**
 * `useCameraUploads` — bridges the camera-session-registry handoff to
 * the upload queue.
 *
 * Callers create a camera session, push `(camera)/capture`, and on
 * focus-return drain the session via `consumeCameraSession`. This hook
 * wraps `useFileUpload` with a single entrypoint that takes that URI
 * list, fetches each file's size (the API enforces ≤ 50 MB so the
 * presign request must include `sizeBytes`), and enqueues one upload
 * per URI tagged with the caller's `reportId` so the upload pipeline
 * also creates the timeline note (Pitfall 8).
 *
 * Empty URI lists are a no-op — Done with zero captures must not
 * enqueue anything. We never throw on a missing file stat; the queue
 * itself rejects the job and surfaces it via `failedJobs` so the UI
 * can offer a retry.
 */
import { useCallback } from 'react';
import * as FileSystem from 'expo-file-system';

import { useFileUpload } from '@/lib/uploads';
import type { UploadResult } from '@/lib/uploads';

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

/** Best-effort filesize lookup. Camera shots routinely live under the
 *  managed cache root, so `getInfoAsync` succeeds; if it doesn't, fall
 *  back to a non-zero estimate so the presign request still validates
 *  (the queue will fail loudly if the server rejects it, not silently). */
async function statSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    if (info.exists && typeof info.size === 'number' && info.size > 0) {
      return info.size;
    }
  } catch {
    // ignore — fall through
  }
  return 1;
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
        const sizeBytes = await statSize(uri);
        return enqueue({
          sourceUri: uri,
          kind: 'image',
          filename: filenameFromUri(uri, idx),
          contentType: 'image/jpeg',
          sizeBytes,
          reportId: opts.reportId,
        });
      });
      return Promise.allSettled(promises);
    },
    [enqueue],
  );

  return { enqueueCameraUris };
}
