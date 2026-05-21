/**
 * `useCameraUploads` — bridges the camera-session-registry handoff to
 * the upload queue.
 *
 * Callers create a camera session, push `(camera)/capture`, and on
 * focus-return drain the session via `consumeCameraSession`. This hook
 * wraps `useFileUpload` with a single entrypoint that takes that URI
 * list, reads each file's size (the API enforces ≤ 50 MB so the presign
 * request must include the real `sizeBytes`), and enqueues one upload
 * per URI tagged with the caller's `reportId` so the upload pipeline
 * also creates the timeline note (Pitfall 8).
 *
 * Empty URI lists are a no-op. The size lookup uses the modern
 * `new File(uri).size` API (expo-file-system v55 moved `getInfoAsync`
 * to a `/legacy` import — calling the bare module's `.getInfoAsync`
 * returns `undefined` at runtime).
 *
 * If the size can't be read (file inaccessible / zero bytes) we throw
 * rather than fall back to a sentinel. A sentinel would let the
 * presign go through with `sizeBytes = 1`, but the XHR would then PUT
 * real bytes against a SigV4 signature that included Content-Length=1,
 * and S3 / MinIO would reject with SignatureDoesNotMatch — exactly the
 * failure mode this hook was rewritten to avoid. By throwing here the
 * job surfaces via `Promise.allSettled`'s `rejected` entry (and the
 * upload queue's `failedJobs`) instead of being masked as an opaque
 * server-side rejection.
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

/** Throws if the file can't be stat'd or reports a non-positive size.
 *  See the module docstring for why we refuse to fall back to a
 *  sentinel here. */
function statSize(uri: string): number {
  const size = new FsFile(uri).size;
  if (typeof size === 'number' && size > 0) {
    return size;
  }
  throw new Error(
    `Camera upload: file at ${uri} reported size=${String(size)}; ` +
      `refusing to presign with a sentinel size that would break SigV4.`,
  );
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
