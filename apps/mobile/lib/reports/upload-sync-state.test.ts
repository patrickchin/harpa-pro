import { describe, expect, it } from 'vitest';

import {
  countNonCancelledUploadFailures,
  getReportPhotoUploadQueueState,
  initialUploadSyncState,
  isUploadCancellation,
  isUploadSyncPending,
  uploadSyncReducer,
} from './upload-sync-state';
import type { JobStatus, UploadJob } from '@/lib/uploads/types';

function photoJob(id: string, status: JobStatus, reportId = 'rep_1'): UploadJob {
  return {
    id,
    status,
    progress: 0,
    attempt: 1,
    input: {
      kind: 'image',
      sourceUri: `file:///${id}.jpg`,
      filename: `${id}.jpg`,
      contentType: 'image/jpeg',
      sizeBytes: 1,
      reportId,
    },
  };
}

describe('uploadSyncReducer', () => {
  it('tracks overlapping upload operations independently', () => {
    const first = uploadSyncReducer(initialUploadSyncState, { type: 'start' });
    const second = uploadSyncReducer(first, { type: 'start' });
    const oneFinished = uploadSyncReducer(second, { type: 'finish' });

    expect(second.activeCount).toBe(2);
    expect(oneFinished.activeCount).toBe(1);
    expect(isUploadSyncPending(oneFinished)).toBe(true);
  });

  it('latches a finishing operation error and never underflows', () => {
    const active = uploadSyncReducer(initialUploadSyncState, { type: 'start' });
    const failed = uploadSyncReducer(active, {
      type: 'finish',
      error: 'report refetch failed',
    });
    const extraFinish = uploadSyncReducer(failed, { type: 'finish' });

    expect(failed).toEqual({
      activeCount: 0,
      error: 'report refetch failed',
    });
    expect(extraFinish.activeCount).toBe(0);
    expect(isUploadSyncPending(extraFinish)).toBe(false);
  });

  it('clears a prior error only after a persisted retry succeeds', () => {
    const failed = {
      activeCount: 0,
      error: 'upload failed',
    } as const;
    const retrying = uploadSyncReducer(failed, { type: 'start' });
    const cancelled = uploadSyncReducer(retrying, { type: 'finish' });
    const retryingAgain = uploadSyncReducer(cancelled, { type: 'start' });
    const recovered = uploadSyncReducer(retryingAgain, {
      type: 'finish',
      clearError: true,
    });

    expect(retrying).toEqual({ activeCount: 1, error: 'upload failed' });
    expect(cancelled).toEqual(failed);
    expect(recovered).toEqual(initialUploadSyncState);
  });

  it('can surface a preflight error without inventing an active operation', () => {
    expect(
      uploadSyncReducer(initialUploadSyncState, {
        type: 'error',
        error: 'report unavailable',
      }),
    ).toEqual({ activeCount: 0, error: 'report unavailable' });
  });

  it('clears a dismissed upload error without finishing another active operation', () => {
    const state = { activeCount: 2, error: 'upload failed' } as const;

    expect(uploadSyncReducer(state, { type: 'clear-error' })).toEqual({
      activeCount: 2,
      error: null,
    });
  });
});

describe('report photo queue synchronization', () => {
  it('keeps every failed job visible while another retry is pending or succeeds', () => {
    const retrying = getReportPhotoUploadQueueState(
      [photoJob('failed-a', 'failed'), photoJob('retry-b', 'pending')],
      'rep_1',
      new Set(),
    );
    const completedRetry = {
      ...photoJob('retry-b', 'completed'),
      noteId: 'not_retry_b',
    };
    const lateSuccess = getReportPhotoUploadQueueState(
      [photoJob('failed-a', 'failed'), completedRetry],
      'rep_1',
      new Set(['retry-b']),
    );

    expect(retrying).toEqual({ activeCount: 1, failedCount: 1 });
    expect(lateSuccess).toEqual({ activeCount: 0, failedCount: 1 });
  });

  it('counts multiple failures and ignores other reports and non-image jobs', () => {
    const voiceFailure = {
      ...photoJob('voice', 'failed'),
      input: { ...photoJob('voice', 'failed').input, kind: 'voice' as const },
    };

    expect(
      getReportPhotoUploadQueueState(
        [
          photoJob('failed-a', 'failed'),
          photoJob('failed-b', 'failed'),
          photoJob('other-report', 'failed', 'rep_2'),
          voiceFailure,
        ],
        'rep_1',
        new Set(),
      ),
    ).toEqual({ activeCount: 0, failedCount: 2 });
  });

  it('treats cancellation or dismissal as resolved once the job leaves the queue', () => {
    expect(
      getReportPhotoUploadQueueState([photoJob('dismissed', 'cancelled')], 'rep_1', new Set()),
    ).toEqual({
      activeCount: 0,
      failedCount: 0,
    });
    expect(getReportPhotoUploadQueueState([], 'rep_1', new Set())).toEqual({
      activeCount: 0,
      failedCount: 0,
    });
  });

  it('releases a committed completed job after canonical refetch when its note is outside the visible page', () => {
    const completed = {
      ...photoJob('resumed', 'completed'),
      noteId: 'not_resumed',
    };

    expect(getReportPhotoUploadQueueState([completed], 'rep_1', new Set())).toEqual({
      activeCount: 1,
      failedCount: 0,
    });
    expect(getReportPhotoUploadQueueState([completed], 'rep_1', new Set(['resumed']))).toEqual({
      activeCount: 0,
      failedCount: 0,
    });
    expect(
      getReportPhotoUploadQueueState(
        [photoJob('missing-note-id', 'completed')],
        'rep_1',
        new Set(['missing-note-id']),
      ),
    ).toEqual({ activeCount: 1, failedCount: 0 });
  });

  it('does not turn an aborted upload into a retryable failure', () => {
    const abort = new Error('upload cancelled');
    abort.name = 'AbortError';

    expect(
      countNonCancelledUploadFailures([
        { status: 'rejected', reason: abort },
        { status: 'rejected', reason: new Error('network failed') },
        { status: 'fulfilled', value: null },
      ]),
    ).toBe(1);
    expect(isUploadCancellation(abort)).toBe(true);
    expect(isUploadCancellation(new Error('network failed'))).toBe(false);
  });
});
