/**
 * `usePhotoUploadEntries` — anti-flicker + attachments[] contract.
 *
 * The hook exposes a session-lived `noteId → syntheticId` map that
 * `GenerateReportProvider.timelineItems` consumes via a `useMemo`
 * dep. For that consumer to re-run when the upload queue resolves
 * a `noteId`, the Map identity returned from this hook MUST change
 * across renders that grow the map. Returning `mapRef.current`
 * directly would give every render the same reference, hiding
 * growth from `Object.is` and breaking the anti-flicker remap (the
 * saved server row arrives with no `reactKey` → React mounts a
 * fresh PhotoNoteCard → flicker).
 *
 * A second session-lived map (`fileIdToAttachmentKey`) extends the
 * same anti-flicker contract to the attachment level: the photo grid
 * can remap saved tile keys to their pending counterparts so
 * in-flight tile state persists across the pending → saved
 * transition without a remount.
 *
 * Both maps MUST return a fresh Map wrapper per render that grew
 * them — this file pins that contract.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { QueueProvider, useFileUpload } from './index';
import { usePhotoUploadEntries } from './usePhotoUploadEntries';
import type { EnqueueInput, UploadResult } from './types';
import type { NoteEntry } from '@/lib/notes/note-entry';

interface RecordedCall {
  url: string;
  method: string;
}

let calls: RecordedCall[] = [];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push({ url, method });
      if (url.endsWith('/files/presign') && method === 'POST') {
        return jsonResponse(200, {
          uploadUrl: 'https://r2.test.invalid/upload/image/k1?sig=test',
          fileKey: 'users/usr_1/image/k1',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (url.startsWith('https://r2.test.invalid/upload/')) {
        return emptyResponse(200);
      }
      if (url.endsWith('/files') && method === 'POST') {
        return jsonResponse(201, {
          id: 'fil_1',
          ownerId: 'usr_1',
          kind: 'image',
          fileKey: 'users/usr_1/image/k1',
          sizeBytes: 1,
          contentType: 'image/jpeg',
          createdAt: new Date().toISOString(),
        });
      }
      if (/\/reports\/[^/]+\/notes$/.test(url) && method === 'POST') {
        return jsonResponse(201, {
          id: 'not_X',
          reportId: 'rep_1',
          authorId: 'usr_1',
          kind: 'image',
          body: null,
          fileId: 'fil_1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    }),
  );
}

const observed: Array<ReadonlyMap<string, string>> = [];

function Probe({ reportId }: { reportId: string }) {
  const api = usePhotoUploadEntries(reportId, 'usr_1');
  observed.push(api.noteIdToSyntheticId);
  return null;
}

let enqueueRef: ((input: EnqueueInput) => Promise<UploadResult>) | null = null;

function EnqueueGate() {
  const queue = useFileUpload();
  enqueueRef = queue.enqueue;
  return null;
}

function Harness({ reportId }: { reportId: string }) {
  return (
    <QueueProvider>
      <EnqueueGate />
      <Probe reportId={reportId} />
    </QueueProvider>
  );
}

describe('usePhotoUploadEntries — noteIdToSyntheticId identity contract', () => {
  let tree: ReactTestRenderer | null = null;

  beforeEach(() => {
    calls = [];
    observed.length = 0;
    enqueueRef = null;
    stubFetch();
  });
  afterEach(() => {
    act(() => {
      tree?.unmount();
    });
    tree = null;
    vi.unstubAllGlobals();
  });

  it('returns a fresh Map reference when the upload resolves a noteId', async () => {
    act(() => {
      tree = create(<Harness reportId="rep_1" />);
    });
    expect(observed.length).toBeGreaterThan(0);
    const before = observed[observed.length - 1]!;
    expect(before.size).toBe(0);

    expect(enqueueRef).toBeTruthy();
    await act(async () => {
      await enqueueRef!({
        kind: 'image',
        sourceUri: 'file:///a.jpg',
        reportId: 'rep_1',
        filename: 'a.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1,
      });
    });

    // After the upload completes, at least one observed snapshot
    // must have the noteId mapped AND a different identity than the
    // empty-map snapshot. Without that, GenerateReportProvider's
    // memo never re-runs and the flicker is back.
    const populated = observed.find(
      (m) => m.has('not_X') && m !== before,
    );
    expect(populated, 'expected a re-rendered map with not_X and a new identity').toBeTruthy();
    expect(populated!.get('not_X')).toMatch(/^__/);
  });
});

// ─── Batch grouping + attachments[] + fileIdToAttachmentKey ──────────────

type BatchObservation = {
  entries: readonly NoteEntry[];
  fileMap: ReadonlyMap<string, string>;
};

const observed2: BatchObservation[] = [];
let enqueueRef2: ((input: EnqueueInput) => Promise<UploadResult>) | null = null;

function Probe2({ reportId }: { reportId: string }) {
  const api = usePhotoUploadEntries(reportId, 'usr_1');
  observed2.push({ entries: api.entries, fileMap: api.fileIdToAttachmentKey });
  return null;
}

function EnqueueGate2() {
  const { enqueue } = useFileUpload();
  enqueueRef2 = enqueue;
  return null;
}

function Harness2({ reportId }: { reportId: string }) {
  return (
    <QueueProvider>
      <EnqueueGate2 />
      <Probe2 reportId={reportId} />
    </QueueProvider>
  );
}

describe('usePhotoUploadEntries — batch grouping with attachments[] and fileIdToAttachmentKey', () => {
  let tree2: ReactTestRenderer | null = null;

  // Controlled fetch: first createNote hangs until resolveFirstNote is called;
  // subsequent createNote calls return immediately. POST /files returns
  // incrementing IDs (fil_1, fil_2, …) so both jobs get distinct fileIds.
  let resolveFirstNote: ((r: Response) => void) | null = null;
  let fileCallCount = 0;
  let noteCallCount = 0;

  function stubFetchControlled(): void {
    fileCallCount = 0;
    noteCallCount = 0;
    resolveFirstNote = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.endsWith('/files/presign') && method === 'POST') {
          return jsonResponse(200, {
            uploadUrl: 'https://r2.test.invalid/upload/image/k1?sig=test',
            fileKey: 'users/usr_1/image/k1',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          });
        }
        if (url.startsWith('https://r2.test.invalid/upload/')) {
          return emptyResponse(200);
        }
        if (url.endsWith('/files') && method === 'POST') {
          fileCallCount += 1;
          return jsonResponse(201, {
            id: `fil_${fileCallCount}`,
            ownerId: 'usr_1',
            kind: 'image',
            fileKey: 'users/usr_1/image/k1',
            sizeBytes: 1,
            contentType: 'image/jpeg',
            createdAt: new Date().toISOString(),
          });
        }
        if (/\/reports\/[^/]+\/notes$/.test(url) && method === 'POST') {
          noteCallCount += 1;
          if (noteCallCount === 1) {
            // First createNote hangs until we explicitly resolve it,
            // giving the test a stable window to inspect intermediate state.
            return new Promise<Response>((res) => {
              resolveFirstNote = res;
            });
          }
          return jsonResponse(201, {
            id: `not_${noteCallCount}`,
            reportId: 'rep_1',
            authorId: 'usr_1',
            kind: 'image',
            body: null,
            fileId: `fil_${noteCallCount}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      }),
    );
  }

  beforeEach(() => {
    observed2.length = 0;
    enqueueRef2 = null;
    resolveFirstNote = null;
    fileCallCount = 0;
    noteCallCount = 0;
  });

  afterEach(() => {
    act(() => {
      tree2?.unmount();
    });
    tree2 = null;
    vi.unstubAllGlobals();
  });

  it('groups two batch jobs into one entry with attachments[] and populates fileIdToAttachmentKey', async () => {
    stubFetchControlled();

    act(() => {
      tree2 = create(<Harness2 reportId="rep_1" />);
    });

    // Enqueue both jobs with the same batchKey (without awaiting so both
    // are visible in the queue at the same time). The queue is serial so
    // job1 runs to createNote (hangs), job2 stays pending.
    let p1!: Promise<UploadResult>, p2!: Promise<UploadResult>;
    await act(async () => {
      p1 = enqueueRef2!({
        kind: 'image',
        sourceUri: 'file:///a.jpg',
        reportId: 'rep_1',
        filename: 'a.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1,
        batchKey: 'bk_1',
      });
      p2 = enqueueRef2!({
        kind: 'image',
        sourceUri: 'file:///b.jpg',
        reportId: 'rep_1',
        filename: 'b.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1,
        batchKey: 'bk_1',
      });
      // Yield to the event loop so presign + PUT + registerFile for job1
      // all complete (all resolve synchronously via the mock). After this
      // macrotask tick, job1 is blocked at createNote and job2 is pending.
      await new Promise<void>((r) => setTimeout(r, 0));
    });

    // Both jobs are visible and grouped under batchKey 'bk_1'.
    const snap = observed2[observed2.length - 1]!;
    expect(snap.entries).toHaveLength(1);
    expect(snap.entries[0]!.attachments).toHaveLength(2);
    expect(snap.entries[0]!.attachments![0]!.isPending).toBe(true);
    expect(snap.entries[0]!.attachments![1]!.isPending).toBe(true);

    // Resolve the hanging createNote to unblock the pipeline.
    resolveFirstNote!(
      jsonResponse(201, {
        id: 'not_1',
        reportId: 'rep_1',
        authorId: 'usr_1',
        kind: 'image',
        body: null,
        fileId: 'fil_1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );

    // Wait for both jobs to settle (second createNote returns immediately).
    await act(async () => {
      await Promise.allSettled([p1, p2]);
    });

    // fileIdToAttachmentKey is session-lived — it retains mappings even
    // after jobs transition to completed and leave the entries list.
    const final = observed2[observed2.length - 1]!;
    expect(final.fileMap.get('fil_1')).toBeDefined();
    expect(final.fileMap.get('fil_2')).toBeDefined();
  });
});
