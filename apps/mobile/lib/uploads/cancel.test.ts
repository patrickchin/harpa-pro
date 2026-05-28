/**
 * AbortController cancellation contract.
 *
 * Per `docs/v4/plan-camera-upload-pipeline.md`:
 *   - `queue.remove(jobId)` for an in-flight job must abort the PUT
 *     and short-circuit the rest of the pipeline (no `POST /files`,
 *     no note creation).
 *   - The aborted promise rejects with an `AbortError`.
 *   - The cancellation budget does NOT consume retries.
 */
import { describe, expect, it, vi } from 'vitest';

import { createUploadQueue } from './queue';
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

const fakeFile = { id: 'fil_abc', key: 'k' } as never;
const fakeNote = { id: 'not_xyz' } as never;

describe('upload queue — AbortController cancellation', () => {
  it('aborts the PUT and skips registerFile + createNote when remove() is called mid-flight', async () => {
    let abortDuringPut = false;
    const presign = vi.fn(async () => ({
      uploadUrl: 'https://r2/sign',
      fileKey: 'k',
      fileId: 'fil-test1234',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }));
    const putToR2 = vi.fn(
      (args: { signal?: AbortSignal }) =>
        new Promise<void>((resolve, reject) => {
          const signal = args.signal;
          if (!signal) return resolve();
          signal.addEventListener(
            'abort',
            () => {
              abortDuringPut = true;
              const err = new Error('R2 PUT aborted');
              err.name = 'AbortError';
              reject(err);
            },
            { once: true },
          );
          // Never resolves on its own — only the abort path completes
          // the promise. Mirrors a long-running mobile upload.
        }),
    );
    const registerFile = vi.fn();
    const createNote = vi.fn();

    const queue = createUploadQueue({ presign, putToR2, registerFile, createNote, appendFiles: vi.fn() });
    const promise = queue.enqueue(input());

    // Wait for the job to actually reach `uploading` before cancelling.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const [job] = queue.getJobs();
    if (!job) throw new Error('expected enqueued job');
    expect(job.status).toBe('uploading');

    queue.remove(job.id);

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(abortDuringPut).toBe(true);
    expect(presign).toHaveBeenCalledOnce();
    expect(putToR2).toHaveBeenCalledOnce();
    expect(registerFile).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
    // remove() splices the job, so the post-cancel snapshot is empty.
    expect(queue.getJobs()).toEqual([]);
  });

  it('cancellation does not consume the retry budget', async () => {
    const presign = vi.fn(async () => ({
      uploadUrl: 'u',
      fileKey: 'k',
      fileId: 'fil-test1234',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }));
    const putToR2 = vi.fn(async (args: { signal?: AbortSignal }) => {
      if (args.signal?.aborted) {
        const err = new Error('R2 PUT aborted');
        err.name = 'AbortError';
        throw err;
      }
    });
    const registerFile = vi.fn(async () => fakeFile);
    const createNote = vi.fn(async () => fakeNote);

    const queue = createUploadQueue({ presign, putToR2, registerFile, createNote, appendFiles: vi.fn() });
    const promise = queue.enqueue(input());
    await promise;
    expect(queue.getJobs()[0]?.attempt).toBe(1);
  });
});
