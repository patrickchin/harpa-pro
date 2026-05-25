/**
 * `usePhotoUploadEntries` — derives synthetic `NoteEntry` rows from
 * the upload queue's in-flight + failed image jobs for a single
 * report. The `GenerateReportProvider` stitches the result into the
 * timeline so the pending state renders the moment the user
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
 *
 * Anti-flicker: synthetic entries carry the eventual server `noteId`
 * as soon as the queue resolves it (during `creating_note`) and the
 * hook maintains a session-lived `noteIdToSyntheticId` map. The
 * provider uses that map to assign the same React key to the saved
 * server row when it lands, so the pending → saved transition
 * reuses the same `PhotoNoteCard` instance instead of remounting.
 */
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

import type { NoteEntry } from '@/lib/notes/note-entry';
import { useOptionalUploadQueueContext } from './QueueProvider';
import type { UploadJob } from './types';

export interface PhotoUploadEntriesApi {
  /** Synthetic NoteEntry rows (one per in-flight / failed image job). */
  entries: readonly NoteEntry[];
  /**
   * Maps a resolved server `noteId` (`not_…`) to the stable synthetic
   * React key (`__batch-…` / `__upload-…`) we minted when the upload
   * began. The provider applies this to saved server rows so they
   * inherit the synthetic's React key, eliminating the remount
   * flicker that used to happen when the queue dropped the synthetic
   * and the server row arrived with a different id.
   */
  noteIdToSyntheticId: ReadonlyMap<string, string>;
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

function soloSyntheticId(jobId: string): string {
  return `__upload-${jobId}`;
}

function batchSyntheticId(batchKey: string): string {
  return `__batch-${batchKey}`;
}

function jobToSoloEntry(job: UploadJob, authorId: string | undefined): NoteEntry {
  const id = soloSyntheticId(job.id);
  return {
    id,
    reactKey: id,
    authorId,
    text: '',
    addedAt: parseJobCreatedAt(job.id),
    source: 'image',
    isPending: true,
    noteId: job.noteId,
    pendingUpload: {
      jobId: job.id,
      sourceUri: job.input.sourceUri,
      status: job.status,
      progress: job.progress,
      error: job.error,
    },
    pendingFiles: [{
      jobId: job.id,
      sourceUri: job.input.sourceUri,
      status: job.status,
      progress: job.progress,
      error: job.error,
    }],
  };
}

function batchToEntry(batchKey: string, batchJobs: UploadJob[], authorId: string | undefined): NoteEntry {
  const addedAt = Math.min(...batchJobs.map(j => parseJobCreatedAt(j.id)));
  const resolvedNoteId = batchJobs.find((j) => j.noteId)?.noteId;
  const id = batchSyntheticId(batchKey);
  return {
    id,
    reactKey: id,
    authorId,
    text: '',
    addedAt,
    source: 'image',
    isPending: true,
    batchKey,
    noteId: resolvedNoteId,
    pendingFiles: batchJobs.map(j => ({
      jobId: j.id,
      sourceUri: j.input.sourceUri,
      status: j.status,
      progress: j.progress,
      error: j.error,
    })),
    pendingUpload: batchJobs.length === 1 ? {
      jobId: batchJobs[0]!.id,
      sourceUri: batchJobs[0]!.input.sourceUri,
      status: batchJobs[0]!.status,
      progress: batchJobs[0]!.progress,
      error: batchJobs[0]!.error,
    } : null,
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

  // Session-lived noteId → syntheticId map. We keep entries even
  // after the queue drops the completed job so saved server rows
  // (which arrive on a later refetch) continue to inherit the
  // synthetic React key. Persisting in a ref also means a single
  // re-render where the queue snapshot lags the server doesn't lose
  // the mapping.
  const mapRef = useRef<Map<string, string>>(new Map());
  const noteIdToSyntheticId = useMemo<ReadonlyMap<string, string>>(() => {
    const map = mapRef.current;
    if (!reportId) return map;
    for (const job of jobs) {
      if (job.input.kind !== 'image') continue;
      if (job.input.reportId !== reportId) continue;
      if (!job.noteId) continue;
      const syntheticId = job.batchKey
        ? batchSyntheticId(job.batchKey)
        : soloSyntheticId(job.id);
      if (map.get(job.noteId) !== syntheticId) {
        map.set(job.noteId, syntheticId);
      }
    }
    // Return a FRESH wrapper around the same entries so downstream
    // memo consumers (`GenerateReportProvider.timelineItems`) detect
    // change-by-identity. Returning `mapRef.current` directly would
    // give every render the same reference, hiding growth from
    // `Object.is` and breaking the anti-flicker remap.
    return new Map(map);
  }, [jobs, reportId]);

  const entries = useMemo<readonly NoteEntry[]>(() => {
    if (!reportId) return [];
    const visible = jobs.filter((j) => isVisibleImageJob(j, reportId));

    // Group by batchKey
    const batches = new Map<string, UploadJob[]>();
    const solo: UploadJob[] = [];

    for (const job of visible) {
      const key = job.batchKey ?? job.input.batchKey;
      if (key) {
        const group = batches.get(key);
        if (group) group.push(job);
        else batches.set(key, [job]);
      } else {
        solo.push(job);
      }
    }

    const result: NoteEntry[] = [];

    for (const job of solo) {
      result.push(jobToSoloEntry(job, authorId));
    }

    for (const [key, batchJobs] of batches) {
      result.push(batchToEntry(key, batchJobs, authorId));
    }

    result.sort((a, b) => a.addedAt - b.addedAt);

    return result;
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

  return { entries, noteIdToSyntheticId, retry, cancel };
}
