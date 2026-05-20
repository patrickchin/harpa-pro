/**
 * Phase F unit tests for the upload queue persistence + abort path.
 *
 * Node-only: builds a queue with stub `UploadDeps` (so no React, no
 * fetch, no native modules) and asserts:
 *
 *   1. `enqueue` persists pending jobs to the storage adapter, and a
 *      second queue built against the same adapter `rehydrate()`s
 *      them on boot.
 *   2. `remove(jobId)` while the job is in flight calls
 *      `controller.abort()` and the run-upload pipeline surfaces an
 *      "abort" error that the queue treats as terminal (no retry).
 *   3. `enqueue` with the same `clientId` as an in-flight job
 *      hijacks that job's resolvers — the second promise resolves to
 *      the same FileRecord without firing a second presign.
 *
 * Pitfall 13 note: this is a NEGATIVE-PATH test (abort, dedupe,
 * rehydrate), so injecting stub deps is acceptable. The default
 * wiring is covered separately by
 * `upload-creates-timeline-note.test.tsx` (real `defaultUploadDeps`,
 * `fetch` stubbed only).
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

import {
  createUploadQueue,
  QUEUE_STORAGE_KEY,
  type QueueStorage,
} from './queue';
import type { UploadDeps } from './run-upload';
import type { FileRecord, NoteRecord, EnqueueInput } from './types';

function memoryStorage(): QueueStorage & { dump: () => Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => {
      map.set(k, v);
    },
    removeItem: async (k) => {
      map.delete(k);
    },
    dump: () => Object.fromEntries(map),
  };
}

function fakeFile(id: string): FileRecord {
  return {
    id,
    ownerId: 'usr_test',
    kind: 'voice',
    fileKey: `voice/${id}.m4a`,
    sizeBytes: 1024,
    contentType: 'audio/m4a',
    state: 'ready',
    createdAt: new Date().toISOString(),
  } as unknown as FileRecord;
}

function fakeNote(id: string): NoteRecord {
  return { id } as unknown as NoteRecord;
}

interface Recorder {
  presignCalls: EnqueueInput[];
  putCalls: { uploadUrl: string; signal: AbortSignal | undefined }[];
}

function makeDeps(opts: {
  putToR2?: UploadDeps['putToR2'];
} = {}): { deps: UploadDeps; rec: Recorder } {
  const rec: Recorder = { presignCalls: [], putCalls: [] };
  const deps: UploadDeps = {
    presign: async (input) => {
      rec.presignCalls.push(input);
      return {
        uploadUrl: `https://r2.test/upload/${rec.presignCalls.length}`,
        fileKey: `voice/k${rec.presignCalls.length}`,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
    },
    putToR2:
      opts.putToR2 ??
      (async (a) => {
        rec.putCalls.push({ uploadUrl: a.uploadUrl, signal: a.signal });
      }),
    registerFile: async (presigned) =>
      fakeFile(`fil_${presigned.fileKey.replace(/[^a-z0-9]/gi, '')}`),
    createNote: async () => fakeNote('nt_test'),
  };
  return { deps, rec };
}

describe('UploadQueue — Phase F persistence', () => {
  it('persists pending jobs and rehydrates them in a new queue', async () => {
    const storage = memoryStorage();
    // Block PUT forever in the first queue so the job stays pending /
    // in-flight when we rebuild against the same storage.
    let releaseFirstPut: (() => void) | null = null;
    const block = new Promise<void>((r) => {
      releaseFirstPut = r;
    });
    const { deps: deps1 } = makeDeps({
      putToR2: async (a) => {
        if (a.signal?.aborted) throw new Error('aborted');
        await block;
      },
    });
    const q1 = createUploadQueue(deps1, { storage });
    void q1.enqueue({
      sourceUri: 'file:///tmp/v.m4a',
      kind: 'voice',
      filename: 'v.m4a',
      contentType: 'audio/m4a',
      sizeBytes: 1024,
      reportId: 'rpt_1',
      clientId: 'voice:rpt_1:file:///tmp/v.m4a:1024',
    });

    // Wait a microtask so notify() runs and persistence completes.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const raw = await storage.getItem(QUEUE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Array<{ input: EnqueueInput }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.input.clientId).toBe('voice:rpt_1:file:///tmp/v.m4a:1024');

    // Build a second queue against the same storage; rehydrate should
    // pull the pending job into the new queue and drive it.
    const { deps: deps2, rec: rec2 } = makeDeps();
    const q2 = createUploadQueue(deps2, { storage });
    await q2.rehydrate();
    expect(q2.getJobs()).toHaveLength(1);

    // Allow the rehydrated job to complete.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(rec2.presignCalls).toHaveLength(1);
    expect(rec2.putCalls).toHaveLength(1);

    // Release the original blocked PUT so we don't leak the promise.
    releaseFirstPut!();
  });

  it('does not rehydrate the same job twice when called repeatedly', async () => {
    const storage = memoryStorage();
    await storage.setItem(
      QUEUE_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'upl_persisted_1',
          input: {
            sourceUri: 'file:///tmp/a.m4a',
            kind: 'voice',
            filename: 'a.m4a',
            contentType: 'audio/m4a',
            sizeBytes: 8,
            clientId: 'voice:abc',
          },
          status: 'pending',
          attempt: 1,
        },
      ]),
    );
    const { deps } = makeDeps();
    const q = createUploadQueue(deps, { storage });
    await q.rehydrate();
    await q.rehydrate();
    expect(q.getJobs()).toHaveLength(1);
  });

  it('drops corrupt snapshots so future writes start clean', async () => {
    const storage = memoryStorage();
    await storage.setItem(QUEUE_STORAGE_KEY, '{not json');
    const { deps } = makeDeps();
    const q = createUploadQueue(deps, { storage });
    await q.rehydrate();
    expect(q.getJobs()).toHaveLength(0);
    expect(await storage.getItem(QUEUE_STORAGE_KEY)).toBeNull();
  });
});

describe('UploadQueue — Phase F abort + dedupe', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('remove(jobId) aborts the in-flight PUT and never retries', async () => {
    let observedSignal: AbortSignal | undefined;
    const putToR2: UploadDeps['putToR2'] = async (a) => {
      observedSignal = a.signal;
      await new Promise<void>((_resolve, reject) => {
        if (!a.signal) return;
        a.signal.addEventListener('abort', () => reject(new Error('R2 PUT aborted')));
      });
    };
    const { deps, rec } = makeDeps({ putToR2 });
    const q = createUploadQueue(deps, {});
    const p = q.enqueue({
      sourceUri: 'file:///tmp/v.m4a',
      kind: 'voice',
      filename: 'v.m4a',
      contentType: 'audio/m4a',
      sizeBytes: 8,
    });
    // Wait for the job to enter `uploading`.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const job = q.getJobs()[0]!;
    expect(job.status).toBe('uploading');
    q.remove(job.id);
    await expect(p).rejects.toThrow(/abort/i);
    expect(observedSignal?.aborted).toBe(true);
    // Aborted jobs are removed from the visible queue and never retried.
    expect(q.getJobs()).toHaveLength(0);
    expect(rec.presignCalls).toHaveLength(1);
  });

  it('dedupes by clientId — second enqueue hijacks the first job', async () => {
    let release: ((v: void) => void) | null = null;
    const block = new Promise<void>((r) => {
      release = r;
    });
    const { deps, rec } = makeDeps({
      putToR2: async () => {
        await block;
      },
    });
    const q = createUploadQueue(deps, {});
    const input: EnqueueInput = {
      sourceUri: 'file:///tmp/v.m4a',
      kind: 'voice',
      filename: 'v.m4a',
      contentType: 'audio/m4a',
      sizeBytes: 8,
      clientId: 'voice:dedupe-1',
    };
    const p1 = q.enqueue(input);
    await new Promise((r) => setImmediate(r));
    // Second enqueue with same clientId; should NOT trigger a second
    // presign — only the original job remains.
    const p2 = q.enqueue(input);
    expect(q.getJobs()).toHaveLength(1);

    release!();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.file.id).toBe(r2.file.id);
    expect(rec.presignCalls).toHaveLength(1);
  });
});
