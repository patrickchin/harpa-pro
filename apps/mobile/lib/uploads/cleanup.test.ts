/**
 * Source-URI cleanup contract: once an upload reaches `completed`, the
 * queue calls `deps.cleanupSource(sourceUri)`. Errors are swallowed.
 */
import { describe, expect, it, vi } from 'vitest';

import { createUploadQueue } from './queue';
import type { EnqueueInput } from './types';

const input = (overrides: Partial<EnqueueInput> = {}): EnqueueInput => ({
  sourceUri: 'file:///tmp/processed-cap-1.jpg',
  kind: 'image',
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 1024,
  reportId: 'rep_123',
  ...overrides,
});

const fakeFile = { id: 'fil_abc', key: 'k' } as never;
const fakeNote = { id: 'not_xyz' } as never;

function makeDeps() {
  return {
    presign: vi.fn(async () => ({
      uploadUrl: 'u',
      fileKey: 'k',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })),
    putToR2: vi.fn(async () => undefined),
    registerFile: vi.fn(async () => fakeFile),
    createNote: vi.fn(async () => fakeNote),
    appendFiles: vi.fn(async () => undefined),
    cleanupSource: vi.fn(),
  };
}

describe('upload queue — source-URI cleanup', () => {
  it('calls cleanupSource(sourceUri) once after a job reaches completed', async () => {
    const deps = makeDeps();
    const queue = createUploadQueue(deps);
    await queue.enqueue(input());
    expect(deps.cleanupSource).toHaveBeenCalledTimes(1);
    expect(deps.cleanupSource).toHaveBeenCalledWith('file:///tmp/processed-cap-1.jpg');
  });

  it('swallows cleanup errors so the upload still resolves successfully', async () => {
    const deps = makeDeps();
    deps.cleanupSource.mockRejectedValueOnce(new Error('disk full'));
    const queue = createUploadQueue(deps);
    await expect(queue.enqueue(input())).resolves.toMatchObject({
      file: { id: 'fil_abc' },
    });
  });

  it('does NOT call cleanupSource when the job fails terminally', async () => {
    const deps = makeDeps();
    deps.putToR2.mockRejectedValue(new Error('R2 PUT failed: 500'));
    const queue = createUploadQueue(deps, { sleep: async () => undefined });
    await expect(queue.enqueue(input())).rejects.toThrow(/R2 PUT failed/);
    expect(deps.cleanupSource).not.toHaveBeenCalled();
  });
});
