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
import { File as FsFile } from 'expo-file-system';

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
  presign: (
    input: EnqueueInput,
    signal?: AbortSignal,
  ) => Promise<PresignedUpload>;
  /**
   * PUT bytes to the signed R2 URL. Implementations should call
   * `onProgress(fraction)` as bytes flush so the UI can render a
   * determinate bar. The default uses XMLHttpRequest when available
   * (RN runtime + JSDOM) and falls back to `fetch` (node test env).
   *
   * When `signal` is aborted the implementation must stop the PUT
   * (XHR: `.abort()`; fetch: `{ signal }`) and reject with a value
   * whose `name === 'AbortError'` so `runUploadJob` can map it to the
   * `cancelled` lane.
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
    signal?: AbortSignal,
  ) => Promise<FileRecord>;
  createNote: (args: {
    reportId: string;
    input: EnqueueInput;
    file: FileRecord;
    thumbnailFile?: FileRecord;
    signal?: AbortSignal;
  }) => Promise<NoteRecord>;
  appendFiles: (args: {
    noteId: string;
    file: FileRecord;
    thumbnailFile?: FileRecord;
    signal?: AbortSignal;
  }) => Promise<void>;
  /**
   * Best-effort source-URI cleanup after a job reaches `completed`.
   * Called for camera/gallery uploads where the input file lives in a
   * temp/cache directory and would otherwise leak disk space until
   * the next OS sweep. Errors are swallowed — the upload succeeded
   * either way and we don't want disk hygiene to surface as a queue
   * failure. Optional so deps factories that don't care can omit it.
   */
  cleanupSource?: (uri: string) => Promise<void> | void;
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
  /** Called once the paired thumbnail register completes so the queue
   *  can persist `thumbnailFileId` mid-job. Optional — fires only when
   *  `input.thumbnail` is set and its pipeline succeeded. */
  onThumbnailFileId?: (fileId: string) => void;
  /** Batch-aware note resolution. When provided, the queue uses this instead of direct createNote. */
  resolveNote?: (file: FileRecord, thumbnailFile?: FileRecord) => Promise<string>;
  /**
   * Signal observed at every pipeline boundary. When aborted,
   * `runUploadJob` throws an `AbortError` rather than advancing.
   */
  signal?: AbortSignal;
}

/** Sentinel used when cancellation is observed between pipeline steps. */
export class AbortError extends Error {
  override name = 'AbortError';
  constructor(message = 'upload aborted') {
    super(message);
  }
}

/** Returns true when `err` represents an in-flight cancellation. */
export function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' || err.message === 'R2 PUT aborted')
  );
}

function checkAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AbortError();
}

/**
 * Run one job end-to-end. Throws on failure; the queue decides whether
 * to schedule a retry based on attempt count + `backoffMs`.
 *
 * When `input.thumbnail` is set (image uploads) we run a second
 * presign → PUT → registerFile pipeline in parallel with the main
 * image. Progress is reported on the main image PUT only — the thumb
 * is ~50 KB and finishes effectively instantly. If the thumbnail
 * pipeline throws we swallow the error and proceed with `createNote`
 * carrying `thumbnailFileId: null` so a transient thumb-upload
 * failure never loses the user's photo (the grid falls back to the
 * full file id for that note).
 */
export async function runUploadJob(
  input: EnqueueInput,
  deps: UploadDeps,
  handlers: RunHandlers,
): Promise<UploadResult> {
  const { signal } = handlers;
  checkAborted(signal);
  handlers.onStatus('presigning');

  // Kick off both pipelines as soon as we enter the upload phase. The
  // main image drives `onProgress`; the thumbnail runs silently.
  const mainPromise = runMainPipeline(input, deps, handlers);
  const thumbPromise = input.thumbnail
    ? runThumbnailPipeline(input, input.thumbnail, deps, signal).catch(
        (err) => {
          // Re-throw cancellation so the main pipeline path also
          // aborts; swallow other errors so a flaky thumbnail does
          // not lose the photo.
          if (isAbortError(err)) throw err;
          return null;
        },
      )
    : Promise.resolve(null);

  const file = await mainPromise;
  const thumbnailFile = await thumbPromise;
  if (thumbnailFile && handlers.onThumbnailFileId) {
    handlers.onThumbnailFileId(thumbnailFile.id);
  }

  let noteId: string | undefined;
  if (input.reportId) {
    checkAborted(signal);
    handlers.onStatus('creating_note');

    if (input.batchKey && handlers.resolveNote) {
      // Batch mode: coordinator decides create vs append
      noteId = await handlers.resolveNote(file, thumbnailFile ?? undefined);
    } else {
      // Solo mode: always create
      const note = await deps.createNote({
        reportId: input.reportId,
        input,
        file,
        thumbnailFile: thumbnailFile ?? undefined,
        signal,
      });
      noteId = note.id;
    }
  }

  handlers.onStatus('completed');
  return {
    file,
    ...(thumbnailFile ? { thumbnailFile } : {}),
    noteId,
  };
}

async function runMainPipeline(
  input: EnqueueInput,
  deps: UploadDeps,
  handlers: RunHandlers,
): Promise<FileRecord> {
  const { signal } = handlers;
  const presigned = await deps.presign(input, signal);

  checkAborted(signal);
  handlers.onStatus('uploading');
  handlers.onProgress(0);
  await deps.putToR2(
    {
      uploadUrl: presigned.uploadUrl,
      sourceUri: input.sourceUri,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      signal,
    },
    (fraction) => {
      // Clamp to [0, 1) so the UI can still distinguish "done with
      // bytes" (1) from "almost done streaming" (~0.99).
      handlers.onProgress(Math.max(0, Math.min(0.999, fraction)));
    },
  );
  checkAborted(signal);
  handlers.onProgress(1);

  handlers.onStatus('registering');
  return deps.registerFile(presigned, input, signal);
}

async function runThumbnailPipeline(
  input: EnqueueInput,
  thumb: NonNullable<EnqueueInput['thumbnail']>,
  deps: UploadDeps,
  signal: AbortSignal | undefined,
): Promise<FileRecord> {
  // Thumbnail rides on the same UploadKind/contract as the main image
  // — it is registered as a `kind: 'image'` file so the API surfaces
  // it via the same presign + signed-URL paths and RLS is identical.
  const thumbInput: EnqueueInput = {
    ...input,
    sourceUri: thumb.sourceUri,
    contentType: thumb.contentType,
    sizeBytes: thumb.sizeBytes,
    // Strip the nested thumbnail so we never recurse.
    thumbnail: undefined,
    // Don't carry reportId — only the main pipeline creates the note.
    reportId: undefined,
  };
  checkAborted(signal);
  const presigned = await deps.presign(thumbInput, signal);
  checkAborted(signal);
  await deps.putToR2({
    uploadUrl: presigned.uploadUrl,
    sourceUri: thumbInput.sourceUri,
    contentType: thumbInput.contentType,
    sizeBytes: thumbInput.sizeBytes,
    signal,
  });
  checkAborted(signal);
  return deps.registerFile(presigned, thumbInput, signal);
}

// ─── Default-wiring deps ───────────────────────────────────────
// Built on top of the typed `request()` client. The integration test
// (`upload-creates-timeline-note.test.tsx`) exercises THIS factory by
// stubbing the global `fetch` rather than calling `setUploadDeps()` —
// closing the Pitfall 13 trapdoor.

async function defaultPresign(
  input: EnqueueInput,
  signal?: AbortSignal,
): Promise<PresignedUpload> {
  const out = await request('/files/presign', 'post', {
    body: {
      kind: input.kind === 'pdf' ? 'pdf' : input.kind,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    },
    signal,
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
      xhr.open('PUT', args.uploadUrl, true);
      xhr.setRequestHeader('Content-Type', args.contentType);
      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (ev: ProgressEvent) => {
          if (ev.lengthComputable && ev.total > 0) {
            onProgress(ev.loaded / ev.total);
          }
        };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(
            new Error(`R2 PUT failed: ${xhr.status} ${xhr.statusText ?? ''}`),
          );
        }
      };
      xhr.onerror = () => reject(new Error('R2 PUT transport error'));
      xhr.onabort = () => {
        const err = new Error('R2 PUT aborted');
        err.name = 'AbortError';
        reject(err);
      };
      if (args.signal) {
        if (args.signal.aborted) {
          xhr.abort();
        } else {
          args.signal.addEventListener('abort', () => xhr.abort(), {
            once: true,
          });
        }
      }
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
      ? await (await fetch(args.sourceUri, { signal: args.signal })).arrayBuffer()
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
  signal?: AbortSignal,
): Promise<FileRecord> {
  return request('/files', 'post', {
    body: {
      kind: input.kind === 'pdf' ? 'pdf' : input.kind,
      fileKey: presigned.fileKey,
      sizeBytes: input.sizeBytes,
      contentType: input.contentType,
    },
    signal,
  });
}

async function defaultCreateNote(args: {
  reportId: string;
  input: EnqueueInput;
  file: FileRecord;
  thumbnailFile?: FileRecord;
  signal?: AbortSignal;
}): Promise<NoteRecord> {
  return request('/reports/{report}/notes', 'post', {
    params: { report: args.reportId },
    body: {
      kind: noteKindForUpload(args.input.kind),
      fileId: args.file.id,
      thumbnailFileId: args.thumbnailFile?.id ?? null,
      transcript: args.input.transcript ?? null,
    },
    signal: args.signal,
  });
}

async function defaultAppendFiles(args: {
  noteId: string;
  file: FileRecord;
  thumbnailFile?: FileRecord;
  signal?: AbortSignal;
}): Promise<void> {
  // Route added by the batch-notes API feature; cast needed until the
  // contract is regenerated with the new endpoint.
  await (request as Function)('/notes/{note}/files', 'post', {
    params: { note: args.noteId },
    body: {
      files: [{
        fileId: args.file.id,
        thumbnailFileId: args.thumbnailFile?.id ?? null,
      }],
    },
    signal: args.signal,
  });
}

async function defaultCleanupSource(uri: string): Promise<void> {
  // Best-effort: temp/cache files we wrote (camera capture, processed
  // gallery copy) live under `${cacheDirectory}` and accumulate until
  // the OS sweeps. Deleting eagerly after a successful upload keeps
  // the cache bounded for users who shoot bursts. Any error
  // (permission, already-gone, content://) is swallowed by the queue.
  if (!uri.startsWith('file://')) return;
  const handle = new FsFile(uri);
  if (handle.exists) handle.delete();
}

export const defaultUploadDeps: UploadDeps = {
  presign: defaultPresign,
  putToR2: defaultPutToR2,
  registerFile: defaultRegisterFile,
  createNote: defaultCreateNote,
  appendFiles: defaultAppendFiles,
  cleanupSource: defaultCleanupSource,
};
