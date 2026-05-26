/**
 * `usePhotoUploadEntries` — anti-flicker hook contract.
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
 * This test pins the contract.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { QueueProvider, useFileUpload } from './index';
import { usePhotoUploadEntries } from './usePhotoUploadEntries';
import type { EnqueueInput, UploadResult } from './types';

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
