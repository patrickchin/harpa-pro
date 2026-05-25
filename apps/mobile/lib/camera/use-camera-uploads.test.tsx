/**
 * `useCameraUploads` integration test.
 *
 * Pitfall 13: exercises the real session-registry + real upload queue
 * wiring. We stub `fetch` (the boundary the queue actually hits) and
 * `expo-file-system` `File` class (the only other side effect this
 * hook introduces) — we do NOT swap `useFileUpload`'s deps.
 *
 * Covers:
 *  - Done with an empty session (consumeCameraSession → undefined) is
 *    a no-op (no enqueue, no fetch).
 *  - Done with N URIs enqueues N times, and each round-trips through
 *    the four-step pipeline (presign → PUT → register → createNote).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import {
  act,
  create,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { Text } from 'react-native';

import { QueueProvider } from '@/lib/uploads/QueueProvider';
import {
  __resetCameraSessionsForTests,
  commitCameraSession,
  consumeCameraSession,
  createCameraSession,
} from '@/lib/camera-session-registry';
import { useCameraUploads } from './use-camera-uploads';

vi.mock('expo-file-system', () => ({
  // v55 surface — `new File(uri).size` is what `statSize` actually uses.
  // We key off the URI so tests can simulate a zero-byte / inaccessible
  // file by including `size-0` in the path.
  File: class {
    size: number;
    constructor(uri: string) {
      this.size = uri.includes('size-0') ? 0 : 12_345;
    }
    delete() {}
  },
}));

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
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

function stubFetch() {
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    let body: unknown = undefined;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call: RecordedCall = {
      url,
      method: (init.method ?? 'GET').toUpperCase(),
      body,
    };
    calls.push(call);

    if (call.url.includes('/files/presign')) {
      return jsonResponse(200, {
        uploadUrl: 'https://r2.example.com/upload?sig=abc',
        fileKey: 'k/abc',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    if (call.url.startsWith('https://r2.example.com/upload')) {
      return emptyResponse(200);
    }
    if (call.url.endsWith('/files') && call.method === 'POST') {
      const b = body as { fileKey?: string; filename?: string };
      return jsonResponse(200, {
        id: `fil_${b.fileKey ?? 'x'}`,
        filename: b.filename ?? 'cap.jpg',
      });
    }
    if (call.url.match(/\/reports\/[^/]+\/notes$/) && call.method === 'POST') {
      const b = body as { fileId?: string };
      return jsonResponse(200, {
        id: `not_${b.fileId ?? 'x'}`,
        authorId: 'u1',
        reportId: 'rpt_test',
        kind: 'image',
        body: null,
        fileId: b.fileId,
        transcript: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    throw new Error(`Unexpected fetch in test: ${call.method} ${call.url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

type HookApi = ReturnType<typeof useCameraUploads>;

let tree: ReactTestRenderer | null = null;

function Harness({ onReady }: { onReady: (api: HookApi) => void }) {
  const api = useCameraUploads();
  React.useEffect(() => {
    onReady(api);
  }, [api, onReady]);
  return <Text>harness</Text>;
}

function mount(): Promise<HookApi> {
  return new Promise((resolve) => {
    act(() => {
      tree = create(
        <QueueProvider>
          <Harness onReady={(a) => resolve(a)} />
        </QueueProvider>,
      );
    });
  });
}

describe('useCameraUploads — session-registry → upload queue', () => {
  beforeEach(() => {
    calls = [];
    __resetCameraSessionsForTests();
    stubFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (tree) {
      act(() => {
        tree!.unmount();
      });
      tree = null;
    }
  });

  it('Done with an uncommitted session is a no-op (no enqueue, no fetch)', async () => {
    const api = await mount();
    const sessionId = createCameraSession({ returnTo: '/report' });
    // Simulate the caller draining on focus return — the session was
    // never committed (user cancelled), so consume returns undefined.
    const uris = consumeCameraSession(sessionId);
    expect(uris).toBeUndefined();

    const results = await api.enqueueCameraUris(uris ?? [], {
      reportId: 'rpt_test',
    });
    expect(results).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('Done with N URIs enqueues N uploads end-to-end', async () => {
    const api = await mount();
    const sessionId = createCameraSession({ returnTo: '/report' });
    const captured = [
      'file:///tmp/cap-1.jpg',
      'file:///tmp/cap-2.jpg',
      'file:///tmp/cap-3.jpg',
    ];
    commitCameraSession(sessionId, captured);
    const uris = consumeCameraSession(sessionId);
    expect(uris).toEqual(captured);

    const results = await api.enqueueCameraUris(uris!, {
      reportId: 'rpt_test',
    });

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }
    // Each URI hits: presign + PUT + register for main and thumbnail
    // (×2 = 6), plus one note-related call (create for the first,
    // append for the rest). Total: 7 per URI.
    expect(calls).toHaveLength(captured.length * 7);
    const presigns = calls.filter((c) => c.url.includes('/files/presign'));
    expect(presigns).toHaveLength(captured.length * 2);
    for (const presign of presigns) {
      const body = presign.body as { kind?: string; contentType?: string };
      expect(body.kind).toBe('image');
      expect(body.contentType).toBe('image/jpeg');
    }
    // Batch creates a single note; subsequent jobs append files
    const noteCreates = calls.filter((c) =>
      c.url.endsWith('/reports/rpt_test/notes'),
    );
    expect(noteCreates).toHaveLength(1);
    expect((noteCreates[0]!.body as { kind?: string }).kind).toBe('image');
  });

  it('rejects (and skips fetch) when File.size reports 0 — guards against SigV4 sentinel bug', async () => {
    const api = await mount();
    const sessionId = createCameraSession({ returnTo: '/report' });
    // `size-0` triggers the mock to report size=0; the other URI is fine.
    const captured = ['file:///tmp/size-0-cap.jpg', 'file:///tmp/cap-ok.jpg'];
    commitCameraSession(sessionId, captured);
    const uris = consumeCameraSession(sessionId);

    const results = await api.enqueueCameraUris(uris!, {
      reportId: 'rpt_test',
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe('rejected');
    expect(results[1]?.status).toBe('fulfilled');

    // The rejected URI must NOT have hit presign — otherwise we'd be
    // signing Content-Length=1 against real bytes and S3/MinIO would
    // bounce the PUT with SignatureDoesNotMatch.
    // The OK URI presigns twice (main + thumbnail).
    const presigns = calls.filter((c) => c.url.includes('/files/presign'));
    expect(presigns).toHaveLength(2);
  });
});
