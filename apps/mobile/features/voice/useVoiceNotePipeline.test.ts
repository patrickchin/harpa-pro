/**
 * Phase D integration test — voice pipeline default wiring.
 *
 * Asserts (Pitfall 13 / Pitfall 8):
 *   1. The pipeline drives presign → R2 PUT → registerFile → aggregator
 *      using the REAL `defaultUploadDeps` and the REAL `defaultCallAggregator`
 *      (no `useFileUpload` injection of fakes). The only stub is `fetch`.
 *   2. The aggregator request carries an `Idempotency-Key` header derived
 *      from `voice:<fileId>:<reportId>` (matches arch-voice-pipeline §D5).
 *   3. The aggregator URL targets `/reports/{report}/notes/voice`
 *      (the new route landed in Phase B), and the body shape matches
 *      the contract (`fileId`, `durationSec`).
 *   4. Step transitions go `uploading → transcribing → saved`.
 *
 * The test runs in pure node — no React, no react-test-renderer —
 * so it's immune to the React 19 / RTR 18 baseline breakage. The
 * real upload deps are exercised via `runUploadJob(input, deps, …)`
 * inside the pipeline's `enqueue` adapter.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  runVoiceNotePipeline,
  defaultCallAggregator,
  type PipelineStep,
} from './useVoiceNotePipeline';
import { runUploadJob, defaultUploadDeps } from '@/lib/uploads';
import type { EnqueueInput } from '@/lib/uploads';
import type { RecorderResult } from './recorder-types';

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

function stubFetch(
  handler: (call: RecordedCall) => Response | Promise<Response>,
  sink: RecordedCall[],
) {
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
    }
    const call: RecordedCall = {
      url,
      method: String(init.method ?? 'GET').toUpperCase(),
      body,
      headers,
    };
    sink.push(call);
    return handler(call);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function defaultServerHandler() {
  return (call: RecordedCall): Response => {
    if (call.url.endsWith('/files/presign') && call.method === 'POST') {
      const body = call.body as { kind: string };
      return jsonResponse(200, {
        uploadUrl: `https://r2.test.invalid/upload/${body.kind}/k123?sig=test`,
        fileKey: `users/usr_test12345/${body.kind}/k123`,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
    }
    if (call.url.startsWith('https://r2.test.invalid/upload/')) {
      return emptyResponse(200);
    }
    if (call.url.endsWith('/files') && call.method === 'POST') {
      const body = call.body as {
        fileKey: string;
        kind: string;
        sizeBytes: number;
        contentType: string;
      };
      return jsonResponse(201, {
        id: 'fil_voice7777',
        ownerId: 'usr_test12345',
        kind: body.kind,
        fileKey: body.fileKey,
        sizeBytes: body.sizeBytes,
        contentType: body.contentType,
        createdAt: new Date().toISOString(),
      });
    }
    if (/\/reports\/[^/]+\/notes\/voice$/.test(call.url) && call.method === 'POST') {
      const body = call.body as { fileId: string; durationSec?: number };
      return jsonResponse(201, {
        id: 'not_voice0001',
        reportId: call.url.split('/reports/')[1]!.split('/')[0]!,
        authorId: 'usr_test12345',
        kind: 'voice',
        body: 'Summary text.',
        fileId: body.fileId,
        transcript: 'Hello, this is a voice note.',
        summary: 'Summary text.',
        durationSec: body.durationSec ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    throw new Error(`Unexpected fetch in test: ${call.method} ${call.url}`);
  };
}

const FIXTURE_RESULT: RecorderResult = {
  uri: 'file:///fixture/voice-sample.m4a',
  mimeType: 'audio/m4a',
  sizeBytes: 1024,
  durationSec: 12.5,
};

// Bridge the upload pipeline's `enqueue` to a single `runUploadJob`
// call using the REAL `defaultUploadDeps` (Pitfall 13: we exercise the
// shipped default, not an injected fake). This mirrors what
// `QueueProvider` + `useFileUpload` do for a single job.
async function enqueueViaDefaults(input: {
  sourceUri: string;
  kind: 'voice';
  filename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{ file: { id: string } }> {
  const fullInput: EnqueueInput = { ...input };
  const result = await runUploadJob(fullInput, defaultUploadDeps, {
    onStatus: () => undefined,
    onProgress: () => undefined,
  });
  return { file: result.file };
}

describe('useVoiceNotePipeline — default wiring (Pitfall 13)', () => {
  let calls: RecordedCall[];

  beforeEach(() => {
    calls = [];
    stubFetch(defaultServerHandler(), calls);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drives presign → PUT → register → aggregator and returns the note', async () => {
    const steps: PipelineStep[] = [];

    const out = await runVoiceNotePipeline(
      { reportId: 'rep_test1234567', result: FIXTURE_RESULT },
      { enqueue: enqueueViaDefaults, callAggregator: defaultCallAggregator },
      { onStep: (s) => steps.push(s) },
    );

    // ── note payload ──
    expect(out.note.id).toBe('not_voice0001');
    expect(out.note.kind).toBe('voice');
    expect(out.fileId).toBe('fil_voice7777');

    // ── step machine ──
    expect(steps).toEqual(['uploading', 'transcribing', 'saved']);

    // ── full pipeline of HTTP calls in order ──
    const urls = calls.map((c) => `${c.method} ${new URL(c.url).pathname}`);
    expect(urls).toEqual([
      'POST /files/presign',
      'PUT /upload/voice/k123',
      'POST /files',
      'POST /reports/rep_test1234567/notes/voice',
    ]);

    // ── voice presign body uses the right kind/contentType ──
    const presign = calls[0]!.body as { kind: string; contentType: string };
    expect(presign.kind).toBe('voice');
    expect(presign.contentType).toBe('audio/m4a');

    // ── aggregator request shape + idempotency-key (arch §D5) ──
    const agg = calls[3]!;
    expect(agg.body).toEqual({
      fileId: 'fil_voice7777',
      durationSec: 12.5,
    });
    expect(agg.headers['idempotency-key']).toBe(
      'voice:fil_voice7777:rep_test1234567',
    );
  });

  it('skips upload when a known fileId is reused (retry path)', async () => {
    const steps: PipelineStep[] = [];

    const out = await runVoiceNotePipeline(
      {
        reportId: 'rep_test1234567',
        result: FIXTURE_RESULT,
        fileId: 'fil_alreadyup',
      },
      { enqueue: enqueueViaDefaults, callAggregator: defaultCallAggregator },
      { onStep: (s) => steps.push(s) },
    );

    expect(out.fileId).toBe('fil_alreadyup');
    expect(steps).toEqual(['uploading', 'transcribing', 'saved']);

    // Only the aggregator call should hit the network on retry.
    const urls = calls.map((c) => `${c.method} ${new URL(c.url).pathname}`);
    expect(urls).toEqual(['POST /reports/rep_test1234567/notes/voice']);

    const agg = calls[0]!;
    expect(agg.headers['idempotency-key']).toBe(
      'voice:fil_alreadyup:rep_test1234567',
    );
  });

  it('surfaces aggregator failure as a thrown error after fileId is captured', async () => {
    const sink: RecordedCall[] = [];
    vi.unstubAllGlobals();
    stubFetch((call: RecordedCall): Response => {
      // Happy path until the aggregator, which returns 502.
      if (call.url.endsWith('/files/presign')) {
        return jsonResponse(200, {
          uploadUrl: 'https://r2.test.invalid/upload/voice/k1?sig=test',
          fileKey: 'users/u/voice/k1',
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        });
      }
      if (call.url.startsWith('https://r2.test.invalid/upload/')) {
        return emptyResponse(200);
      }
      if (call.url.endsWith('/files') && call.method === 'POST') {
        return jsonResponse(201, {
          id: 'fil_failagg99',
          ownerId: 'u',
          kind: 'voice',
          fileKey: 'users/u/voice/k1',
          sizeBytes: 1024,
          contentType: 'audio/m4a',
          createdAt: new Date().toISOString(),
        });
      }
      if (/\/reports\/[^/]+\/notes\/voice$/.test(call.url)) {
        return jsonResponse(502, { message: 'upstream timed out' });
      }
      throw new Error(`Unexpected ${call.method} ${call.url}`);
    }, sink);

    let captured: string | null = null;
    await expect(
      runVoiceNotePipeline(
        { reportId: 'rep_test1234567', result: FIXTURE_RESULT },
        { enqueue: enqueueViaDefaults, callAggregator: defaultCallAggregator },
        { onFileId: (id) => { captured = id; } },
      ),
    ).rejects.toThrow();

    // FileId was captured before the failure → caller can retry without
    // re-uploading.
    expect(captured).toBe('fil_failagg99');
  });
});
