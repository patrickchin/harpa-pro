/**
 * `useVoiceNotePipeline` — Phase D orchestration hook.
 *
 * Drives a single voice-note capture from finalised local recording all
 * the way to a saved server-side `note.kind='voice'` row.
 *
 * Pipeline (kept intentionally explicit so each step shows up in the
 * state machine the modal/UI renders):
 *
 *   idle
 *     → uploading        (enqueue → /files/presign → R2 PUT → /files)
 *     → transcribing     (POST /reports/{report}/notes/voice
 *                          which internally runs transcribe + summarize)
 *     → saved            (note row returned; invalidate ['reportNotes', …])
 *     → failed(step)     (any throw above; user can `retry()`)
 *
 * The aggregator is idempotent via `Idempotency-Key: voice:<fileId>:<reportId>`
 * (see `docs/v4/arch-voice-pipeline.md §D5` and `packages/api/src/routes/voice.ts`),
 * so a retry after a transport hiccup never double-bills or duplicates rows.
 *
 * Default wiring (Pitfall 13): this hook composes the real
 * `useFileUpload` queue (which uses `defaultUploadDeps`) and the real
 * `useCreateVoiceNoteMutation` over the typed `request()` client. The
 * accompanying test (`useVoiceNotePipeline.test.tsx`) stubs `fetch` —
 * NOT the queue or mutation — so the default path is exercised end-to-end.
 */
import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useFileUpload } from '@/lib/uploads';
import type { ResponseBody } from '@/lib/api/client';
import { request } from '@/lib/api/client';

import type { RecorderResult } from './recorder-types';

export type PipelineStep =
  | 'idle'
  | 'uploading'
  | 'transcribing'
  | 'saved'
  | 'failed';

export type VoiceNoteRow = ResponseBody<
  '/reports/{report}/notes/voice',
  'post'
>;

export interface PipelineState {
  step: PipelineStep;
  /** Step that failed (only meaningful when `step === 'failed'`). */
  failedStep: 'uploading' | 'transcribing' | null;
  error: string | null;
  /** Server-side voice note row, populated when `step === 'saved'`. */
  note: VoiceNoteRow | null;
  /** Local file id from `POST /files`, kept across retry for idempotency. */
  fileId: string | null;
  /** Original finalised recording, kept until success/discard for retry. */
  capture: RecorderResult | null;
}

export interface UseVoiceNotePipelineOptions {
  reportId: string;
  /** Test seam. Defaults to `useFileUpload()`. */
  uploader?: ReturnType<typeof useFileUpload>;
  /**
   * Test seam. Defaults to a real call against
   * `POST /reports/{report}/notes/voice`. Production code never injects this.
   */
  callAggregator?: (args: {
    reportId: string;
    fileId: string;
    durationSec: number;
  }) => Promise<VoiceNoteRow>;
}

export interface UseVoiceNotePipelineApi {
  state: PipelineState;
  /**
   * Run the pipeline for a freshly-finalised recording.
   * Resolves with the saved note row, or throws so the caller (modal,
   * inline retry chip) can render a failure UI. Hook state is also
   * updated, so callers that want a "transcribing…" indicator while
   * the modal is closing can subscribe via `state.step`.
   */
  capture: (result: RecorderResult) => Promise<VoiceNoteRow>;
  /** Retry from the failed step. Throws on failure for symmetry. */
  retry: () => Promise<VoiceNoteRow | null>;
  /** Drop any retained recording + reset state to `idle`. */
  reset: () => void;
}

const INITIAL: PipelineState = {
  step: 'idle',
  failedStep: null,
  error: null,
  note: null,
  fileId: null,
  capture: null,
};

function filenameForVoice(uri: string): string {
  const last = uri.split('/').pop();
  if (last && last.length > 0) return last;
  return `voice-${Date.now()}.m4a`;
}

function resolveSize(recorderSize: number, uri: string): number {
  if (recorderSize > 0) return recorderSize;
  throw new Error(
    `Voice upload: file at ${uri} reported size=0; refusing to presign.`,
  );
}

async function defaultCallAggregator(args: {
  reportId: string;
  fileId: string;
  durationSec: number;
}): Promise<VoiceNoteRow> {
  // Idempotency key per arch-voice-pipeline §D5: derived from immutable
  // (fileId, reportId) so retries after transport hiccups are free.
  const idempotencyKey = `voice:${args.fileId}:${args.reportId}`;
  return request('/reports/{report}/notes/voice', 'post', {
    params: { report: args.reportId },
    body: {
      fileId: args.fileId,
      durationSec: args.durationSec,
    },
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

// ─── Pure orchestrator ─────────────────────────────────────────
// Extracted so the integration test (`useVoiceNotePipeline.test.ts`)
// can drive the real default wiring (real `enqueue`, real
// `defaultCallAggregator`) under node without dragging React in. The
// hook below is a thin stateful wrapper.
export interface RunPipelineDeps {
  enqueue: (input: {
    sourceUri: string;
    kind: 'voice';
    filename: string;
    contentType: string;
    sizeBytes: number;
    /** Phase F dedupe key (forwarded to the queue). */
    clientId?: string;
  }) => Promise<{ file: { id: string } }>;
  callAggregator: (args: {
    reportId: string;
    fileId: string;
    durationSec: number;
  }) => Promise<VoiceNoteRow>;
}

export interface RunPipelineHandlers {
  /** Called with each step transition. */
  onStep?: (step: PipelineStep) => void;
  /** Called once with the fileId after upload completes. */
  onFileId?: (fileId: string) => void;
}

export async function runVoiceNotePipeline(
  args: {
    reportId: string;
    result: RecorderResult;
    /** Reuse a known fileId (skips upload). Empty/undefined = run upload. */
    fileId?: string | null;
  },
  deps: RunPipelineDeps,
  handlers: RunPipelineHandlers = {},
): Promise<{ note: VoiceNoteRow; fileId: string }> {
  handlers.onStep?.('uploading');

  let fileId = args.fileId ?? null;
  if (!fileId) {
    const sizeBytes = resolveSize(args.result.sizeBytes, args.result.uri);
    const upload = await deps.enqueue({
      sourceUri: args.result.uri,
      kind: 'voice',
      filename: filenameForVoice(args.result.uri),
      contentType: args.result.mimeType || 'audio/m4a',
      sizeBytes,
      // Phase F: dedupe key so double-tap Save (or boot-time rehydrate
      // followed by a fresh enqueue with the same recording) never
      // uploads the same file twice. Aggregator idempotency handles
      // the server-side guard; this is the client-side guard.
      clientId: `voice:${args.reportId}:${args.result.uri}:${sizeBytes}`,
    });
    fileId = upload.file.id;
    handlers.onFileId?.(fileId);
  }

  handlers.onStep?.('transcribing');

  const note = await deps.callAggregator({
    reportId: args.reportId,
    fileId,
    durationSec: args.result.durationSec,
  });

  handlers.onStep?.('saved');
  return { note, fileId };
}

export function useVoiceNotePipeline(
  options: UseVoiceNotePipelineOptions,
): UseVoiceNotePipelineApi {
  const fallbackUploader = useFileUpload();
  const qc = useQueryClient();
  const uploader = options.uploader ?? fallbackUploader;
  const callAggregator = options.callAggregator ?? defaultCallAggregator;

  const [state, setState] = useState<PipelineState>(INITIAL);
  // Keep the latest capture in a ref so `retry()` doesn't rely on
  // a stale closure when called twice in a row.
  const captureRef = useRef<RecorderResult | null>(null);
  const fileIdRef = useRef<string | null>(null);

  const run = useCallback(
    async (result: RecorderResult): Promise<VoiceNoteRow> => {
      captureRef.current = result;
      setState({
        step: 'uploading',
        failedStep: null,
        error: null,
        note: null,
        fileId: fileIdRef.current,
        capture: result,
      });

      try {
        const out = await runVoiceNotePipeline(
          {
            reportId: options.reportId,
            result,
            fileId: fileIdRef.current,
          },
          {
            enqueue: (input) => uploader.enqueue(input),
            callAggregator,
          },
          {
            onStep: (step) => {
              if (step === 'transcribing') {
                setState((s) => ({ ...s, step: 'transcribing' }));
              }
            },
            onFileId: (fileId) => {
              fileIdRef.current = fileId;
              setState((s) => ({ ...s, fileId }));
            },
          },
        );
        qc.invalidateQueries({ queryKey: ['reportNotes'] });
        qc.invalidateQueries({ queryKey: ['report'] });
        setState({
          step: 'saved',
          failedStep: null,
          error: null,
          note: out.note,
          fileId: out.fileId,
          capture: result,
        });
        return out.note;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Determine which step failed by looking at whether the upload
        // captured a fileId before the throw.
        const failedStep: 'uploading' | 'transcribing' = fileIdRef.current
          ? 'transcribing'
          : 'uploading';
        setState({
          step: 'failed',
          failedStep,
          error: message,
          note: null,
          fileId: fileIdRef.current,
          capture: result,
        });
        throw err instanceof Error ? err : new Error(message);
      }
    },
    // `callAggregator` and `qc` are stable for the test/QueryClient
    // lifetime; uploader.enqueue is stable per QueueProvider.
    [options.reportId, uploader],
  );

  const capture = useCallback(
    async (result: RecorderResult): Promise<VoiceNoteRow> => {
      fileIdRef.current = null;
      return run(result);
    },
    [run],
  );

  const retry = useCallback(async (): Promise<VoiceNoteRow | null> => {
    const last = captureRef.current;
    if (!last) return null;
    return run(last);
  }, [run]);

  const reset = useCallback(() => {
    captureRef.current = null;
    fileIdRef.current = null;
    setState(INITIAL);
  }, []);

  return { state, capture, retry, reset };
}

// Re-export the default aggregator call so tests that exercise the
// real network path (Pitfall 13) can assert against it without
// reaching into the hook's internals.
export { defaultCallAggregator };
