/**
 * Upload queue persistence — kill-and-resume contract test.
 *
 * Per Pitfall 13 we exercise the real persistence + queue wiring:
 * only the upload-deps (`presign`, `putToR2`, `registerFile`,
 * `createNote`) are stubbed. The `QueuePersistence` itself is the real
 * `createInMemoryPersistence()` shape so we can introspect the saved
 * blob, but the contract it implements is the same one MMKV satisfies
 * (synchronous getString/set/delete).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createUploadQueue } from './queue';
import {
  createInMemoryPersistence,
  rehydrateJob,
  type PersistedJob,
} from './persistence';
import type { EnqueueInput } from './types';

const input = (overrides: Partial<EnqueueInput> = {}): EnqueueInput => ({
  sourceUri: 'file:///tmp/photo.jpg',
  kind: 'image',
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 1024,
  reportId: 'rep_123',
  ...overrides,
});

const fakeFile = { id: 'fil_abc', key: 'reports/rep_123/photo.jpg' } as never;
const fakeNote = { id: 'not_xyz' } as never;

function makeDeps() {
  return {
    presign: vi.fn(async () => ({
      uploadUrl: 'https://r2.example/sign',
      fileKey: 'reports/rep_123/photo.jpg',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })),
    putToR2: vi.fn(async () => undefined),
    registerFile: vi.fn(async () => fakeFile),
    createNote: vi.fn(async () => fakeNote),
  };
}

describe('upload queue persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the job blob to persistence on every state transition', async () => {
    const persistence = createInMemoryPersistence();
    const queue = createUploadQueue(makeDeps(), { persistence });
    const promise = queue.enqueue(input());
    await vi.runAllTimersAsync();
    await promise;

    const saved = persistence.snapshot();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      input: { sourceUri: 'file:///tmp/photo.jpg' },
      status: 'completed',
      fileId: 'fil_abc',
    });
  });

  it('drops the blob entry path once all jobs are removed', async () => {
    const persistence = createInMemoryPersistence();
    const queue = createUploadQueue(makeDeps(), { persistence });
    const promise = queue.enqueue(input());
    await vi.runAllTimersAsync();
    await promise;

    const [job] = queue.getJobs();
    if (!job) throw new Error('expected one job');
    queue.remove(job.id);
    expect(persistence.snapshot()).toEqual([]);
  });

  it('rehydrates pending jobs at construction and resumes the pipeline', async () => {
    const persisted: PersistedJob[] = [
      {
        id: 'upl_old_1',
        input: input({ sourceUri: 'file:///tmp/restart.jpg' }),
        // Simulates a crash mid-PUT — should be coerced to 'pending'
        // by `rehydrateJob` so the driver re-runs presign + PUT.
        status: 'uploading',
        progress: 0.4,
        attempt: 1,
      },
    ];
    const persistence = createInMemoryPersistence(persisted);
    const initialJobs = persistence.load().map(rehydrateJob);
    expect(initialJobs[0]?.status).toBe('pending');
    expect(initialJobs[0]?.progress).toBe(0);

    const deps = makeDeps();
    createUploadQueue(deps, { persistence, initialJobs });
    await vi.runAllTimersAsync();

    expect(deps.presign).toHaveBeenCalledOnce();
    expect(deps.putToR2).toHaveBeenCalledOnce();
    expect(deps.registerFile).toHaveBeenCalledOnce();
    expect(deps.createNote).toHaveBeenCalledOnce();

    const finalSaved = persistence.snapshot();
    expect(finalSaved[0]).toMatchObject({
      id: 'upl_old_1',
      status: 'completed',
    });
  });

  it('rehydrateJob leaves terminal statuses alone', () => {
    const completed: PersistedJob = {
      id: 'a',
      input: input(),
      status: 'completed',
      progress: 1,
      attempt: 1,
      fileId: 'fil_x',
    };
    const failed: PersistedJob = {
      id: 'b',
      input: input(),
      status: 'failed',
      progress: 0,
      attempt: 3,
      error: 'boom',
    };
    expect(rehydrateJob(completed)).toEqual(completed);
    expect(rehydrateJob(failed)).toEqual(failed);
  });
});
