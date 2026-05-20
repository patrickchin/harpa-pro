/**
 * Pure orchestrator for a single upload job.
 *
 * Drives the four-step pipeline (presign → R2 PUT → registerFile →
 * createNote) and reports progress via callbacks. Collaborators are
 * injected via `UploadDeps` so the queue can swap real
 * `request()`-backed implementations for tests — but per Pitfall 13,
 * `QueueProvider` instantiates the default (real-wired) deps, and the
 * integration test exercises that default by stubbing `fetch` instead
 * of injecting fakes.
 */
import { request } from '@/lib/api/client';
import type {
  EnqueueInput,
  FileRecord,
  NoteRecord,
  UploadResult,
} from './types';
import { noteKindForUpload } from './types';

export type { FileRecord, NoteRecord } from './types';

export interface PresignedUpload {
  uploadUrl: string;
  fileKey: string;
  expiresAt: string;
}

export interface UploadDeps {
  presign: (input: EnqueueInput) => Promise<PresignedUpload>;
  /**
   * PUT bytes to the signed R2 URL. Implementations should call
   * `onProgress(fraction)` as bytes flush so the UI can render a
   * determinate bar. The default uses XMLHttpRequest when available
   * (RN runtime + JSDOM) and falls back to `fetch` (node test env).
   *
   * Phase F: an optional `signal` lets the caller (the queue's
   * `remove(jobId)`) abort the in-flight transfer; the XHR path calls
   * `xhr.abort()` and the fetch fallback forwards the signal.
   */
  putToR2: (
    args: {
      uploadUrl: string;
      sourceUri: string;
      contentType: string;
      sizeBytes: number;
      signal?: AbortSignal;
    },
    onProgress?: (fraction: number) => void,
  ) => Promise<void>;
  registerFile: (
    presigned: PresignedUpload,
    input: EnqueueInput,
  ) => Promise<FileRecord>;
  createNote: (args: {
    reportId: string;
    input: EnqueueInput;
    file: FileRecord;
  }) => Promise<NoteRecord>;
}

export interface RunHandlers {
  onStatus: (
    status:
      | 'presigning'
      | 'uploading'
      | 'registering'
      | 'creating_note'
      | 'completed',
  ) => void;
  onProgress: (fraction: number) => void;
  /** Phase F: queue-supplied signal so `remove(jobId)` aborts the PUT. */
  signal?: AbortSignal;
}

/**
 * Run one job end-to-end. Throws on failure; the queue decides whether
 * to schedule a retry based on attempt count + `backoffMs`.
 */
export async function runUploadJob(
  input: EnqueueInput,
  deps: UploadDeps,
  handlers: RunHandlers,
): Promise<UploadResult> {
  const throwIfAborted = () => {
    if (handlers.signal?.aborted) {
      const reason = (handlers.signal as AbortSignal & { reason?: unknown })
        .reason;
      throw reason instanceof Error
        ? reason
        : new Error('Upload aborted');
    }
  };

  throwIfAborted();
  handlers.onStatus('presigning');
  const presigned = await deps.presign(input);

  throwIfAborted();
  handlers.onStatus('uploading');
  handlers.onProgress(0);
  await deps.putToR2(
    {
      uploadUrl: presigned.uploadUrl,
      sourceUri: input.sourceUri,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      signal: handlers.signal,
    },
    (fraction) => {
      // Clamp to [0, 1) so the UI can still distinguish "done with
      // bytes" (1) from "almost done streaming" (~0.99).
      handlers.onProgress(Math.max(0, Math.min(0.999, fraction)));
    },
  );
  handlers.onProgress(1);
  throwIfAborted();

  handlers.onStatus('registering');
  const file = await deps.registerFile(presigned, input);

  let noteId: string | undefined;
  if (input.reportId) {
    throwIfAborted();
    handlers.onStatus('creating_note');
    const note = await deps.createNote({
      reportId: input.reportId,
      input,
      file,
    });
    noteId = note.id;
  }

  handlers.onStatus('completed');
  return { file, noteId };
}

// ─── Default-wiring deps ───────────────────────────────────────
// Built on top of the typed `request()` client. The integration test
// (`upload-creates-timeline-note.test.tsx`) exercises THIS factory by
// stubbing the global `fetch` rather than calling `setUploadDeps()` —
// closing the Pitfall 13 trapdoor.

async function defaultPresign(input: EnqueueInput): Promise<PresignedUpload> {
  const out = await request('/files/presign', 'post', {
    body: {
      kind: input.kind === 'pdf' ? 'pdf' : input.kind,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    },
  });
  return out;
}

async function defaultPutToR2(
  args: {
    uploadUrl: string;
    sourceUri: string;
    contentType: string;
    sizeBytes: number;
    signal?: AbortSignal;
  },
  onProgress?: (fraction: number) => void,
): Promise<void> {
  // Prefer XMLHttpRequest because it exposes real upload progress
  // events. React Native ships an XHR polyfill; jsdom does too. The
  // node-only vitest env doesn't, so we fall back to `fetch` (no
  // intermediate progress events; the run-upload wrapper still emits
  // 0 → 1 around the call).
  const Xhr: typeof XMLHttpRequest | undefined =
    typeof XMLHttpRequest === 'undefined' ? undefined : XMLHttpRequest;

  if (Xhr) {
    await new Promise<void>((resolve, reject) => {
      const xhr = new Xhr();
      const onAbort = () => {
        try {
          xhr.abort();
        } catch {
          // Already finished.
        }
      };
      if (args.signal) {
        if (args.signal.aborted) {
          reject(new Error('R2 PUT aborted before start'));
          return;
        }
        args.signal.addEventListener('abort', onAbort);
      }
      xhr.open('PUT', args.uploadUrl, true);
      xhr.setRequestHeader('Content-Type', args.contentType);
      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (ev: ProgressEvent) => {
          if (ev.lengthComputable && ev.total > 0) {
            onProgress(ev.loaded / ev.total);
          }
        };
      }
      const cleanup = () => {
        if (args.signal) args.signal.removeEventListener('abort', onAbort);
      };
      xhr.onload = () => {
        cleanup();
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(
            new Error(`R2 PUT failed: ${xhr.status} ${xhr.statusText ?? ''}`),
          );
        }
      };
      xhr.onerror = () => {
        cleanup();
        reject(new Error('R2 PUT transport error'));
      };
      xhr.onabort = () => {
        cleanup();
        reject(new Error('R2 PUT aborted'));
      };
      // `{ uri }` is the React Native fetch/XHR convention for streaming
      // a local file. On node/jsdom we never construct the body this
      // way because Xhr is undefined.
      xhr.send({ uri: args.sourceUri } as unknown as Document);
    });
    return;
  }

  // Fallback path (node test env, web). Read the URI as a fetch body —
  // tests stub `fetch` so this is only ever exercised in tests.
  const body =
    args.sourceUri.startsWith('http://') ||
    args.sourceUri.startsWith('https://')
      ? await (await fetch(args.sourceUri)).arrayBuffer()
      : args.sourceUri;
  const res = await fetch(args.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': args.contentType },
    body: body as BodyInit,
    signal: args.signal,
  });
  if (!res.ok) {
    throw new Error(`R2 PUT failed: ${res.status} ${res.statusText}`);
  }
}

async function defaultRegisterFile(
  presigned: PresignedUpload,
  input: EnqueueInput,
): Promise<FileRecord> {
  return request('/files', 'post', {
    body: {
      kind: input.kind === 'pdf' ? 'pdf' : input.kind,
      fileKey: presigned.fileKey,
      sizeBytes: input.sizeBytes,
      contentType: input.contentType,
    },
  });
}

async function defaultCreateNote(args: {
  reportId: string;
  input: EnqueueInput;
  file: FileRecord;
}): Promise<NoteRecord> {
  return request('/reports/{report}/notes', 'post', {
    params: { report: args.reportId },
    body: {
      kind: noteKindForUpload(args.input.kind),
      fileId: args.file.id,
      transcript: args.input.transcript ?? null,
    },
  });
}

export const defaultUploadDeps: UploadDeps = {
  presign: defaultPresign,
  putToR2: defaultPutToR2,
  registerFile: defaultRegisterFile,
  createNote: defaultCreateNote,
};
