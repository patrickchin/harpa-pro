import type { UploadJob } from '@/lib/uploads/types';

export interface UploadSyncState {
  activeCount: number;
  error: string | null;
}

export type UploadSyncAction =
  | { type: 'start' }
  | { type: 'finish'; error?: string; clearError?: boolean }
  | { type: 'error'; error: string }
  | { type: 'clear-error' };

export const initialUploadSyncState: UploadSyncState = {
  activeCount: 0,
  error: null,
};

/**
 * Synchronization state for route-owned gallery and camera operations.
 *
 * Counts active operations so overlapping uploads cannot clear each other's
 * readiness guard. Failures stay latched until an operation proves successful
 * persistence and refetch by finishing with `clearError`; merely opening and
 * cancelling another picker cannot manufacture recovery.
 */
export function uploadSyncReducer(
  state: UploadSyncState,
  action: UploadSyncAction,
): UploadSyncState {
  switch (action.type) {
    case 'start':
      return {
        activeCount: state.activeCount + 1,
        error: state.error,
      };
    case 'finish':
      return {
        activeCount: Math.max(0, state.activeCount - 1),
        error: action.error !== undefined ? action.error : action.clearError ? null : state.error,
      };
    case 'error':
      return {
        ...state,
        error: action.error,
      };
    case 'clear-error':
      return {
        ...state,
        error: null,
      };
  }
}

export function isUploadSyncPending(state: UploadSyncState): boolean {
  return state.activeCount > 0;
}

export interface ReportPhotoUploadQueueState {
  activeCount: number;
  failedCount: number;
}

export function isUnreflectedCompletedReportPhotoJob(
  job: UploadJob,
  reportId: string | null | undefined,
  refetchedCompletedJobIds: ReadonlySet<string>,
): boolean {
  return (
    Boolean(reportId) &&
    job.input.kind === 'image' &&
    job.input.reportId === reportId &&
    job.status === 'completed' &&
    (!job.noteId || !refetchedCompletedJobIds.has(job.id))
  );
}

/**
 * Derive report readiness from the queue snapshot instead of a single error
 * latch. A successful retry must not hide another failed or concurrent job,
 * while removed/cancelled jobs no longer block intentional generation.
 */
export function getReportPhotoUploadQueueState(
  jobs: ReadonlyArray<UploadJob>,
  reportId: string | null | undefined,
  refetchedCompletedJobIds: ReadonlySet<string>,
): ReportPhotoUploadQueueState {
  if (!reportId) return { activeCount: 0, failedCount: 0 };

  let activeCount = 0;
  let failedCount = 0;
  for (const job of jobs) {
    if (job.input.kind !== 'image' || job.input.reportId !== reportId) continue;
    if (job.status === 'failed') {
      failedCount += 1;
      continue;
    }
    if (isUnreflectedCompletedReportPhotoJob(job, reportId, refetchedCompletedJobIds)) {
      activeCount += 1;
      continue;
    }
    if (
      job.status === 'pending' ||
      job.status === 'presigning' ||
      job.status === 'uploading' ||
      job.status === 'registering' ||
      job.status === 'creating_note'
    ) {
      activeCount += 1;
    }
  }

  return { activeCount, failedCount };
}

export function isUploadCancellation(reason: unknown): boolean {
  return (
    typeof reason === 'object' &&
    reason !== null &&
    'name' in reason &&
    reason.name === 'AbortError'
  );
}

/** Cancelled queue work is intentional abandonment, not a retryable failure. */
export function countNonCancelledUploadFailures(
  results: ReadonlyArray<PromiseSettledResult<unknown>>,
): number {
  return results.filter(
    (result) => result.status === 'rejected' && !isUploadCancellation(result.reason),
  ).length;
}
