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
 * enqueue anything. The size lookup uses the modern `new File(uri).size`
 * API (expo-file-system v55 moved `getInfoAsync` to a `/legacy` import
 * — calling the bare module's `.getInfoAsync` returns `undefined` at
 * runtime and the upload signs against a sizeBytes of `1` while the
 * actual PUT sends real bytes → S3 / MinIO rejects with
 * SignatureDoesNotMatch / EntityTooSmall).
 */
import { useCallback } from 'react';
import { File as FsFile } from 'expo-file-system';

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

/** Best-effort filesize lookup using the v55 `File` API. Returns a
 *  positive number; falls back to a sentinel if the file is
 *  inaccessible so the caller's Promise.allSettled doesn't reject. */
function statSize(uri: string): number {
  try {
    const size = new FsFile(uri).size;
    if (typeof size === 'number' && size > 0) {
      return size;
    }
  } catch {
    // ignore — fall through to a sentinel
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
        const sizeBytes = statSize(uri);
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
