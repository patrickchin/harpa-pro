/**
 * `useFileUpload` — the React surface of the upload queue.
 *
 * Returns an `enqueue(input)` function that schedules a file through
 * the four-step pipeline (presign → R2 PUT → registerFile →
 * createNote) and a live `jobs` snapshot for rendering progress /
 * retry chips. `subscribe` is wired via `useSyncExternalStore` so
 * re-renders happen exactly when the queue notifies — matching the
 * canonical `apps/mobile/hooks/useUploadQueue.ts` pattern at
 * `../haru3-reports@dev`.
 */
import { useCallback, useSyncExternalStore } from 'react';

import { useUploadQueueContext } from './QueueProvider';
import type { EnqueueInput, UploadJob, UploadResult } from './types';

export interface UseFileUploadApi {
  /** Schedule a single file. Resolves with the server file row on success. */
  enqueue: (input: EnqueueInput) => Promise<UploadResult>;
  /** Push a previously-failed job back through the pipeline. */
  retry: (jobId: string) => Promise<UploadResult>;
  /** Remove a job from the snapshot. In-flight jobs continue but stop being visible. */
  remove: (jobId: string) => void;
  /** Live list of every known job in this queue. */
  jobs: ReadonlyArray<UploadJob>;
  /** Convenience: jobs whose status is `failed` (retryable). */
  failedJobs: ReadonlyArray<UploadJob>;
  /** Convenience: jobs currently in-flight (status not `completed` / `failed`). */
  activeJobs: ReadonlyArray<UploadJob>;
}

export function useFileUpload(): UseFileUploadApi {
  const queue = useUploadQueueContext();

  const jobs = useSyncExternalStore(
    queue.subscribe,
    queue.getJobs,
    queue.getJobs,
  );

  const enqueue = useCallback(
    (input: EnqueueInput) => queue.enqueue(input),
    [queue],
  );
  const retry = useCallback((jobId: string) => queue.retry(jobId), [queue]);
  const remove = useCallback((jobId: string) => queue.remove(jobId), [queue]);

  const failedJobs = jobs.filter((j) => j.status === 'failed');
  const activeJobs = jobs.filter(
    (j) => j.status !== 'completed' && j.status !== 'failed',
  );

  return {
    enqueue,
    retry,
    remove,
    jobs,
    failedJobs,
    activeJobs,
  };
}
