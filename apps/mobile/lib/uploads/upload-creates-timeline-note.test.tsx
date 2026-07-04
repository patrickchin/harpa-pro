/**
 * Pitfall 8 contract test — `upload-creates-timeline-note`.
 *
 * Runs the upload pipeline end-to-end for image / voice / document /
 * pdf, asserting every kind round-trips through:
 *
 *   presign → R2 PUT → registerFile → createNote
 *
 * Pitfall 13 compliance: this test exercises the **default-wired**
 * deps. We mount the real `<QueueProvider>` (which calls
 * `createUploadQueue(defaultUploadDeps)`) and stub the global `fetch`
 * — we do NOT pass a fake `queue` or fake `UploadDeps`. If someone
 * later wires the queue to `setUploadDeps({ … })` and forgets to
 * cover the default factory, this test catches it.
 *
 * Note `pdf` is NOT a separate row: the API contract collapses
 * pdf → document at the note timeline, so we assert the mapping in a
 * dedicated case rather than expecting a `pdf` note kind.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import { QueueProvider, useFileUpload } from './index';
import type { EnqueueInput, UploadResult } from './types';

const limitsState = vi.hoisted(() => ({ fileSizeLimitBytes: 5 * 1024 * 1024 as number | null }));

vi.mock('@/lib/api/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/hooks')>();
  return {
    ...actual,
    useMeLimitsQuery: () => ({
      data: { plan: 'free', fileSizeLimitBytes: limitsState.fileSizeLimitBytes },
    }),
  };
});

vi.mock('@/lib/billing/context', () => ({
  useOptionalBilling: () => ({
    enabled: true,
    status: 'free',
    presentPaywall: vi.fn(),
  }),
}));

// ─── Fetch stub ────────────────────────────────────────────────
// A single `fetch` mock covers all four hops because both the API
// client and the R2 PUT use the same global. The stub also doubles
// as an assertion sink: every call is recorded in `calls`.

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
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

function stubFetch(handler: (call: RecordedCall) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    if (init.headers) {
      const h = init.headers as Record<string, string>;
      for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v;
    }
    let body: unknown = undefined;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    } else if (init.body) {
      body = init.body;
    }
    const call: RecordedCall = {
      url,
      method: String(init.method ?? 'GET').toUpperCase(),
      body,
      headers,
    };
    calls.push(call);
    return handler(call);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

// ─── Default API handler ───────────────────────────────────────
// Mirrors the shipped routes in `packages/api/src/routes/files.ts`
// and `notes.ts`, returning minimal-but-valid envelopes.

interface Recorded {
  presign?: RecordedCall;
  put?: RecordedCall;
  register?: RecordedCall;
  createNote?: RecordedCall;
}

function defaultHandler(rec: Recorded) {
  return (call: RecordedCall): Response => {
    if (call.url.endsWith('/files/presign') && call.method === 'POST') {
      rec.presign = call;
      const body = call.body as { kind: string };
      return jsonResponse(200, {
        uploadUrl: `https://r2.test.invalid/upload/${body.kind}/k123?sig=test`,
        fileKey: `users/usr_test12345/${body.kind}/k123`,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
    }
    if (call.url.startsWith('https://r2.test.invalid/upload/')) {
      rec.put = call;
      return emptyResponse(200);
    }
    if (call.url.endsWith('/files') && call.method === 'POST') {
      rec.register = call;
      const body = call.body as { fileKey: string; kind: string; sizeBytes: number; contentType: string };
      return jsonResponse(201, {
        id: 'fil_abc1234567',
        ownerId: 'usr_test12345',
        kind: body.kind,
        fileKey: body.fileKey,
        sizeBytes: body.sizeBytes,
        contentType: body.contentType,
        createdAt: new Date().toISOString(),
      });
    }
    if (/\/reports\/[^/]+\/notes$/.test(call.url) && call.method === 'POST') {
      rec.createNote = call;
      const body = call.body as { kind: string; fileId: string; transcript?: string | null };
      return jsonResponse(201, {
        id: 'not_xyz9876543',
        reportId: call.url.split('/reports/')[1]!.split('/')[0]!,
        authorId: 'usr_test12345',
        kind: body.kind,
        body: null,
        fileId: body.fileId,
        transcript: body.transcript ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    throw new Error(`Unexpected fetch in test: ${call.method} ${call.url}`);
  };
}

// ─── Test harness ──────────────────────────────────────────────
// Drives the real queue via the real `useFileUpload` hook so the
// integration test covers the React glue too.

let tree: ReactTestRenderer | null = null;

function HookHarness({
  onReady,
}: {
  onReady: (api: ReturnType<typeof useFileUpload>) => void;
}) {
  const api = useFileUpload();
  React.useEffect(() => {
    onReady(api);
  }, [api, onReady]);
  return <Text>harness</Text>;
}

async function runEnqueue(input: EnqueueInput): Promise<UploadResult> {
  let api: ReturnType<typeof useFileUpload> | null = null;
  act(() => {
    tree = create(
      <QueueProvider>
        <HookHarness onReady={(a) => { api = a; }} />
      </QueueProvider>,
    );
  });
  expect(api).not.toBeNull();
  return api!.enqueue(input);
}

// ─── Cases ─────────────────────────────────────────────────────
describe('lib/uploads — upload-creates-timeline-note (Pitfall 8)', () => {
  beforeEach(() => {
    calls = [];
    limitsState.fileSizeLimitBytes = 5 * 1024 * 1024;
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

  it('image upload: presign → PUT → register → createNote(kind=image)', async () => {
    const rec: Recorded = {};
    stubFetch(defaultHandler(rec));

    const result = await runEnqueue({
      sourceUri: 'file:///tmp/photo.jpg',
      kind: 'image',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 12_345,
      reportId: 'rpt_test1234',
    });

    // All four hops fired in order.
    expect(rec.presign).toBeDefined();
    expect(rec.put).toBeDefined();
    expect(rec.register).toBeDefined();
    expect(rec.createNote).toBeDefined();

    // Presign carried the right kind + content type.
    expect((rec.presign!.body as { kind: string }).kind).toBe('image');
    expect((rec.presign!.body as { contentType: string }).contentType).toBe('image/jpeg');

    // R2 PUT used the URL the server handed back + matched content type.
    expect(rec.put!.url).toMatch(/^https:\/\/r2\.test\.invalid\/upload\/image\//);
    expect(rec.put!.headers['content-type']).toBe('image/jpeg');

    // Register echoed the server-built fileKey (clients must never invent it).
    expect((rec.register!.body as { fileKey: string }).fileKey).toMatch(
      /^users\/usr_test12345\/image\//,
    );

    // Pitfall 8 — the timeline note WAS created with kind=image.
    expect(rec.createNote!.url).toContain('/reports/rpt_test1234/notes');
    expect((rec.createNote!.body as { kind: string }).kind).toBe('image');
    expect((rec.createNote!.body as { fileId: string }).fileId).toBe('fil_abc1234567');

    // Hook returned the server file + note ids.
    expect(result.file.id).toBe('fil_abc1234567');
    expect(result.noteId).toBe('not_xyz9876543');
  });

  it('voice upload: presign → PUT → register → createNote(kind=voice) with transcript', async () => {
    const rec: Recorded = {};
    stubFetch(defaultHandler(rec));

    const result = await runEnqueue({
      sourceUri: 'file:///tmp/clip.m4a',
      kind: 'voice',
      filename: 'clip.m4a',
      contentType: 'audio/mp4',
      sizeBytes: 99_000,
      reportId: 'rpt_test1234',
      transcript: 'check the foundation cracks',
    });

    expect(rec.presign).toBeDefined();
    expect(rec.put).toBeDefined();
    expect(rec.register).toBeDefined();
    expect(rec.createNote).toBeDefined();

    expect((rec.presign!.body as { kind: string }).kind).toBe('voice');
    expect(rec.put!.headers['content-type']).toBe('audio/mp4');
    expect((rec.createNote!.body as { kind: string }).kind).toBe('voice');
    expect((rec.createNote!.body as { transcript: string }).transcript).toBe(
      'check the foundation cracks',
    );
    expect(result.noteId).toBe('not_xyz9876543');
  });

  it('document upload: presign → PUT → register → createNote(kind=document)', async () => {
    const rec: Recorded = {};
    stubFetch(defaultHandler(rec));

    const result = await runEnqueue({
      sourceUri: 'file:///tmp/spec.docx',
      kind: 'document',
      filename: 'spec.docx',
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 250_000,
      reportId: 'rpt_test1234',
    });

    expect(rec.presign).toBeDefined();
    expect(rec.put).toBeDefined();
    expect(rec.register).toBeDefined();
    expect(rec.createNote).toBeDefined();
    expect((rec.createNote!.body as { kind: string }).kind).toBe('document');
    expect(result.file.kind).toBe('document');
  });

  it('pdf upload: collapses to note kind `document` (api-contract noteKind enum has no pdf)', async () => {
    const rec: Recorded = {};
    stubFetch(defaultHandler(rec));

    await runEnqueue({
      sourceUri: 'file:///tmp/report.pdf',
      kind: 'pdf',
      filename: 'report.pdf',
      contentType: 'application/pdf',
      sizeBytes: 600_000,
      reportId: 'rpt_test1234',
    });

    expect((rec.presign!.body as { kind: string }).kind).toBe('pdf');
    expect((rec.register!.body as { kind: string }).kind).toBe('pdf');
    // Timeline note uses `document` (Pitfall 8 — every kind hits the timeline).
    expect((rec.createNote!.body as { kind: string }).kind).toBe('document');
  });

  it('no reportId → registers the file but DOES NOT create a timeline note', async () => {
    // Out-of-report uploads (future avatar path) must not silently
    // create a stray note. The pipeline stops after registerFile.
    const rec: Recorded = {};
    stubFetch(defaultHandler(rec));

    const result = await runEnqueue({
      sourceUri: 'file:///tmp/avatar.jpg',
      kind: 'image',
      filename: 'avatar.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 4_000,
    });

    expect(rec.presign).toBeDefined();
    expect(rec.put).toBeDefined();
    expect(rec.register).toBeDefined();
    expect(rec.createNote).toBeUndefined();
    expect(result.noteId).toBeUndefined();
  });

  it('maps a default-wired server 413 before R2 PUT or registration', async () => {
    limitsState.fileSizeLimitBytes = null;
    stubFetch((call) => {
      if (call.url.endsWith('/files/presign')) {
        return jsonResponse(413, {
          error: {
            code: 'file_size_limit_exceeded',
            message: 'too large',
            details: {
              sizeBytes: 6 * 1024 * 1024,
              limitBytes: 5 * 1024 * 1024,
              plan: 'free',
            },
          },
        });
      }
      throw new Error(`Unexpected fetch after rejection: ${call.method} ${call.url}`);
    });

    await expect(runEnqueue({
      sourceUri: 'file:///tmp/oversized.pdf',
      kind: 'pdf',
      filename: 'oversized.pdf',
      contentType: 'application/pdf',
      sizeBytes: 6 * 1024 * 1024,
      reportId: 'rpt_test1234',
    })).rejects.toMatchObject({ code: 'file_size_limit_exceeded' });
    await act(async () => {
      await Promise.resolve();
    });

    expect(calls.filter((call) => call.url.startsWith('https://r2.'))).toHaveLength(0);
    expect(calls.filter((call) => call.url.endsWith('/files'))).toHaveLength(0);
    expect(tree?.root.findByProps({ testID: 'file-size-limit-dialog' })).toBeTruthy();
  });
});

describe('lib/uploads — retry on transient PUT failure', () => {
  beforeEach(() => {
    calls = [];
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

  it('retries the PUT once, then succeeds', async () => {
    const rec: Recorded = {};
    let putAttempts = 0;
    stubFetch((call) => {
      if (call.url.startsWith('https://r2.test.invalid/upload/')) {
        putAttempts += 1;
        if (putAttempts === 1) {
          // 503 — transient. The default handler runs its bookkeeping
          // first so subsequent presign/register still work.
          return emptyResponse(503);
        }
      }
      return defaultHandler(rec)(call);
    });

    // Use the real queue but shortcut the backoff so the test stays fast.
    // The default queue uses `setTimeout`; the in-memory queue's `sleep`
    // is internal and not exposed to the provider — but the backoff for
    // attempt 1 is BACKOFF_BASE_MS=400ms which is fine for a single
    // retry in a test (Vitest default timeout is 5s).
    const result = await runEnqueue({
      sourceUri: 'file:///tmp/photo.jpg',
      kind: 'image',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1_000,
      reportId: 'rpt_test1234',
    });

    expect(putAttempts).toBe(2);
    expect(result.file.id).toBe('fil_abc1234567');
  });
});
