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
 *
 * Attachment-level anti-flicker: `fileIdToAttachmentKey` maps a
 * server `fileId` to the stable synthetic attachment key (`job.id`)
 * so the photo grid can remap saved tile keys to their pending
 * counterparts, extending anti-flicker from the entry level to the
 * individual photo tile level.
 */
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

import type { NoteEntry } from '@/lib/notes/note-entry';
import type { Attachment } from '@/lib/notes/attachments';
import { useOptionalUploadQueueContext } from './QueueProvider';
import type { UploadJob } from './types';

export interface PhotoUploadEntriesApi {
  /** Synthetic NoteEntry rows, each carrying an `attachments[]` array. */
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
  /**
   * Maps a resolved server `fileId` to the synthetic attachment key
   * (`job.id`) used while the upload was pending. Lets the photo grid
   * remap saved tile keys to their pending counterparts so in-flight
   * tile state (progress, error) persists across the pending → saved
   * transition without a remount.
   */
  fileIdToAttachmentKey: ReadonlyMap<string, string>;
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

function jobToAttachment(job: UploadJob, position: number): Attachment {
  return {
    key: job.id,
    fileId: job.fileId ?? null,
    thumbnailFileId: job.thumbnailFileId ?? null,
    sourceUri: job.input.sourceUri,
    isPending: true,
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    error: job.error,
    position,
  };
}

function buildEntry(
  syntheticId: string,
  jobs: UploadJob[],
  authorId: string | undefined,
): NoteEntry {
  const addedAt = Math.min(...jobs.map((j) => parseJobCreatedAt(j.id)));
  const resolvedNoteId = jobs.find((j) => j.noteId)?.noteId;
  return {
    id: syntheticId,
    reactKey: syntheticId,
    authorId,
    text: '',
    addedAt,
    source: 'image',
    isPending: true,
    noteId: resolvedNoteId,
    attachments: jobs.map((j, idx) => jobToAttachment(j, idx)),
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

  // Session-lived maps. Both are kept in refs so entries survive queue
  // snapshot gaps (e.g. the completed job is gone but the saved server
  // row hasn't arrived yet). Both return a FRESH Map wrapper per
  // render that updates them so downstream memo consumers detect
  // change-by-identity (same contract as noteIdToSyntheticId).
  const noteIdMapRef = useRef<Map<string, string>>(new Map());
  const fileIdMapRef = useRef<Map<string, string>>(new Map());

  const { noteIdToSyntheticId, fileIdToAttachmentKey } = useMemo(() => {
    const noteMap = noteIdMapRef.current;
    const fileMap = fileIdMapRef.current;
    if (reportId) {
      for (const job of jobs) {
        if (job.input.kind !== 'image' || job.input.reportId !== reportId) continue;
        const syntheticId = job.batchKey
          ? batchSyntheticId(job.batchKey)
          : soloSyntheticId(job.id);
        if (job.noteId && noteMap.get(job.noteId) !== syntheticId) {
          noteMap.set(job.noteId, syntheticId);
        }
        if (job.fileId && fileMap.get(job.fileId) !== job.id) {
          fileMap.set(job.fileId, job.id);
        }
        if (job.thumbnailFileId && !fileMap.has(job.thumbnailFileId)) {
          fileMap.set(job.thumbnailFileId, job.id);
        }
      }
    }
    // Return FRESH wrappers so downstream memo consumers
    // (`GenerateReportProvider.timelineItems`) detect change-by-identity.
    return {
      noteIdToSyntheticId: new Map(noteMap),
      fileIdToAttachmentKey: new Map(fileMap),
    };
  }, [jobs, reportId]);

  const entries = useMemo<readonly NoteEntry[]>(() => {
    if (!reportId) return [];
    const visible = jobs.filter((j) => isVisibleImageJob(j, reportId));

    // Group by batchKey — a solo job becomes a one-element group.
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
      result.push(buildEntry(soloSyntheticId(job.id), [job], authorId));
    }

    for (const [batchKey, batchJobs] of batches) {
      result.push(buildEntry(batchSyntheticId(batchKey), batchJobs, authorId));
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

  return { entries, noteIdToSyntheticId, fileIdToAttachmentKey, retry, cancel };
}
