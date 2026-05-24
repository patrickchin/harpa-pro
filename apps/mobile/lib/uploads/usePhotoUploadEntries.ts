/**
 * `usePhotoUploadEntries` — derives synthetic `NoteEntry` rows from
 * the upload queue's in-flight + failed image jobs for a single
 * report. The `GenerateReportProvider` stitches the result into the
 * timeline so a `PendingPhotoCard` renders the moment the user
 * picks/snaps a photo — matching the optimistic UX voice notes
 * already get via `voicePipeline.state`.
 *
 * Gracefully degrades when no `<QueueProvider>` is mounted (snapshot
 * tests, dev mirrors) by returning an empty list and no-op handlers.
 * That keeps the provider's host tests from having to wrap in the
 * full upload provider just to render the Notes tab.
 *
 * `completed` jobs are filtered out: once `createNote` lands, the
 * reportNotes invalidation refetch surfaces the real row. `failed`
 * jobs are kept so the user can retry/dismiss inline. `cancelled`
 * jobs are also dropped (the queue snapshot keeps them only to
 * report the terminal state to subscribers).
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import type { NoteEntry } from '@/lib/note-entry';
import { useOptionalUploadQueueContext } from './QueueProvider';
import type { UploadJob } from './types';

export interface PhotoUploadEntriesApi {
  /** Synthetic NoteEntry rows (one per in-flight / failed image job). */
  entries: readonly NoteEntry[];
  /** Retry a failed upload job. No-op when no queue mounted. */
  retry: (jobId: string) => void;
  /** Remove / cancel an upload job from the snapshot. No-op when no queue. */
  cancel: (jobId: string) => void;
}

const EMPTY_JOBS: ReadonlyArray<UploadJob> = [];

function isVisibleImageJob(job: UploadJob, reportId: string): boolean {
  if (job.input.kind !== 'image') return false;
  if (job.input.reportId !== reportId) return false;
  return job.status !== 'completed' && job.status !== 'cancelled';
}

function parseJobCreatedAt(jobId: string): number {
  // `nextJobId()` mints `upl_<base36 Date.now()>_<counter>`. Extracting
  // the timestamp gives every render the same `addedAt` for a given
  // job — important so re-snapshots from progress updates don't
  // ripple a new value into every memo downstream.
  const parts = jobId.split('_');
  if (parts.length < 2) return Date.now();
  const ts = parseInt(parts[1] ?? '', 36);
  return Number.isFinite(ts) && ts > 0 ? ts : Date.now();
}

function jobToEntry(job: UploadJob, authorId: string | undefined): NoteEntry {
  return {
    id: `__upload-${job.id}`,
    authorId,
    text: '',
    addedAt: parseJobCreatedAt(job.id),
    source: 'image',
    isPending: true,
    pendingUpload: {
      jobId: job.id,
      sourceUri: job.input.sourceUri,
      status: job.status,
      progress: job.progress,
      error: job.error,
    },
  };
}

export function usePhotoUploadEntries(
  reportId: string | null | undefined,
  authorId?: string,
): PhotoUploadEntriesApi {
  const queue = useOptionalUploadQueueContext();

  // Subscribe to the queue snapshot. When no queue is mounted, both
  // callbacks return the same frozen empty array — `useSyncExternalStore`
  // is safe to call here regardless (the hook isn't gated by `queue`).
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!queue) return () => {};
      return queue.subscribe(listener);
    },
    [queue],
  );
  const getSnapshot = useCallback(
    () => (queue ? queue.getJobs() : EMPTY_JOBS),
    [queue],
  );
  const jobs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const entries = useMemo<readonly NoteEntry[]>(() => {
    if (!reportId) return [];
    return jobs
      .filter((j) => isVisibleImageJob(j, reportId))
      .map((j) => jobToEntry(j, authorId));
  }, [jobs, reportId, authorId]);

  const retry = useCallback(
    (jobId: string) => {
      if (!queue) return;
      void queue.retry(jobId);
    },
    [queue],
  );
  const cancel = useCallback(
    (jobId: string) => {
      if (!queue) return;
      queue.remove(jobId);
    },
    [queue],
  );

  return { entries, retry, cancel };
}
