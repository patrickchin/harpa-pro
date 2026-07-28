/**
 * In-memory upload queue.
 *
 * One queue per `QueueProvider` mount — survives screen navigation
 * (the provider is at the root) AND app restarts when an MMKV-backed
 * `QueuePersistence` is wired in (see `persistence.ts` + the
 * `QueueProvider` rehydration step). The runtime runs jobs serially;
 * bursts (e.g. 20-photo gallery import) enqueue in order. Failed jobs
 * auto-retry up to MAX_ATTEMPTS with exponential backoff; after that
 * they sit in `failed` and the UI can call `retry(jobId)` to push
 * them back through the pipeline.
 *
 * Subscribers (`useFileUpload`) receive the full job list on every
 * transition via `subscribe(listener)`.
 */
import type { EnqueueInput, UploadJob, UploadResult } from './types';
import { MAX_ATTEMPTS, backoffMs } from './types';
import { runUploadJob, isAbortError, type UploadDeps } from './run-upload';
import type { FileRecord } from './types';
import type { PersistedJob, QueuePersistence } from './persistence';
import { createBatchCoordinator, nextBatchKey } from './batch-coordinator';

let _jobCounter = 0;
function nextJobId(): string {
  _jobCounter += 1;
  return `upl_${Date.now().toString(36)}_${_jobCounter}`;
}

export interface QueueInternals {
  /** Test seam — sets the delay function used between retries. */
  delayMs?: (attempt: number) => number;
  /** Test seam — overrides the sleep implementation. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Persistence layer. When provided, the queue writes the full job
   * list on every transition and seeds itself from `persistence.load()`
   * at construction time (after `initialJobs` filtering).
   */
  persistence?: QueuePersistence;
  /**
   * Jobs to rehydrate at construction. The caller is responsible for
   * dropping jobs whose `sourceUri` no longer points at a readable
   * file — the queue treats whatever it gets as runnable. Each job
   * with `status === 'pending'` is added to the run queue and the
   * driver is kicked.
   */
  initialJobs?: PersistedJob[];
}

export interface UploadQueue {
  enqueue: (input: EnqueueInput) => Promise<UploadResult>;
  enqueueBatch: (inputs: EnqueueInput[]) => { batchKey: string; promises: Promise<UploadResult>[] };
  retry: (jobId: string) => Promise<UploadResult>;
  getJobs: () => UploadJob[];
  subscribe: (listener: () => void) => () => void;
  /** Cancel and remove one job. In-flight network work is aborted. */
  remove: (jobId: string) => void;
  /** Abort and forget every job, including the persisted snapshot. */
  clear: () => void;
}

interface InternalJob extends UploadJob {
  resolve: (result: UploadResult) => void;
  reject: (err: Error) => void;
  /** Per-job abort controller. Recreated when retrying a failed job. */
  controller: AbortController;
  /** Batch key carried from input for coordinator lookup. */
  batchKey?: string;
}

export function createUploadQueue(
  deps: UploadDeps,
  internals: QueueInternals = {},
): UploadQueue {
  const jobs: InternalJob[] = [];
  const listeners = new Set<() => void>();
  let batchCoord = createBatchCoordinator();
  let running = false;
  let cachedSnapshot: UploadJob[] = [];
  let snapshotDirty = true;

  const sleep = internals.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const delay = internals.delayMs ?? backoffMs;
  const persistence = internals.persistence;

  function notify(): void {
    snapshotDirty = true;
    if (persistence) {
      persistence.save(
        jobs.map((j) => ({
          id: j.id,
          input: j.input,
          status: j.status,
          progress: j.progress,
          attempt: j.attempt,
          fileId: j.fileId,
          thumbnailFileId: j.thumbnailFileId,
          error: j.error,
        })),
      );
    }
    for (const fn of listeners) fn();
  }

  function snapshot(): UploadJob[] {
    if (!snapshotDirty) return cachedSnapshot;
    cachedSnapshot = jobs.map((j) => ({
      id: j.id,
      input: j.input,
      status: j.status,
      progress: j.progress,
      attempt: j.attempt,
      fileId: j.fileId,
      thumbnailFileId: j.thumbnailFileId,
      batchKey: j.batchKey,
      noteId: j.noteId,
      error: j.error,
    }));
    snapshotDirty = false;
    return cachedSnapshot;
  }

  async function drive(): Promise<void> {
    if (running) return;
    running = true;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const next = jobs.find(
          (j) => j.status === 'pending' && j.attempt <= MAX_ATTEMPTS,
        );
        if (!next) break;
        await processJob(next);
      }
    } finally {
      running = false;
    }
  }

  async function processJob(job: InternalJob): Promise<void> {
    try {
      const resolveNote = job.batchKey
        ? async (file: FileRecord, thumbnailFile?: FileRecord) => {
            return batchCoord.resolveNoteForJob(
              job.id,
              async () => {
                const note = await deps.createNote({
                  reportId: job.input.reportId!,
                  input: job.input,
                  file,
                  thumbnailFile,
                  signal: job.controller.signal,
                });
                return note.id;
              },
              async (noteId: string) => {
                await deps.appendFiles({
                  noteId,
                  file,
                  thumbnailFile,
                  signal: job.controller.signal,
                });
              },
            );
          }
        : undefined;

      const result = await runUploadJob(job.input, deps, {
        signal: job.controller.signal,
        onStatus: (status) => {
          job.status = status;
          notify();
        },
        onProgress: (fraction) => {
          job.progress = fraction;
          notify();
        },
        onThumbnailFileId: (fileId) => {
          job.thumbnailFileId = fileId;
          notify();
        },
        onNoteId: (noteId) => {
          job.noteId = noteId;
          notify();
        },
        resolveNote,
      });
      job.fileId = result.file.id;
      if (result.thumbnailFile) {
        job.thumbnailFileId = result.thumbnailFile.id;
      }
      job.status = 'completed';
      job.progress = 1;
      notify();
      // Best-effort source cleanup. Errors are swallowed — the
      // upload succeeded; disk hygiene should never surface as a
      // queue failure (and `defaultCleanupSource` no-ops for
      // non-`file://` URIs).
      if (deps.cleanupSource) {
        try {
          await deps.cleanupSource(job.input.sourceUri);
          if (job.input.thumbnail?.sourceUri) {
            await deps.cleanupSource(job.input.thumbnail.sourceUri);
          }
        } catch {
          // ignore
        }
      }
      job.resolve(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Cancellation short-circuits the retry budget. The job is left
      // in `cancelled` so the UI can render a transient indicator;
      // most callers immediately splice it via `remove(jobId)`.
      if (isAbortError(err) || job.controller.signal.aborted) {
        job.status = 'cancelled';
        job.error = message;
        notify();
        const abortErr = err instanceof Error ? err : new Error(message);
        if (abortErr.name !== 'AbortError') abortErr.name = 'AbortError';
        job.reject(abortErr);
        return;
      }
      if (job.attempt < MAX_ATTEMPTS) {
        // Schedule retry — keep job in `pending` so the driver picks
        // it up again after the backoff window. Mint a fresh controller
        // so a previous abort doesn't poison the new attempt.
        const waitMs = delay(job.attempt);
        job.attempt += 1;
        job.status = 'pending';
        job.error = message;
        job.progress = 0;
        job.controller = new AbortController();
        notify();
        await sleep(waitMs);
      } else {
        job.status = 'failed';
        job.error = message;
        notify();
        job.reject(err instanceof Error ? err : new Error(message));
      }
    }
  }

  function enqueue(input: EnqueueInput): Promise<UploadResult> {
    return new Promise<UploadResult>((resolve, reject) => {
      // Dedupe by clientId so accidental double-tap on Save doesn't
      // enqueue the same upload twice. Match against any non-completed,
      // non-failed job — completed jobs already created their file row
      // server-side; failed jobs are retried explicitly via retry().
      if (input.clientId) {
        const dup = jobs.find(
          (j) =>
            j.input.clientId === input.clientId &&
            j.status !== 'failed',
        );
        if (dup) {
          if (dup.status === 'completed') {
            resolve({
              file: { id: dup.fileId ?? '' } as UploadResult['file'],
            });
            return;
          }
          // Hijack the dup's resolvers so this caller's promise follows
          // the existing job's outcome.
          const prevResolve = dup.resolve;
          const prevReject = dup.reject;
          dup.resolve = (r) => {
            prevResolve(r);
            resolve(r);
          };
          dup.reject = (e) => {
            prevReject(e);
            reject(e);
          };
          return;
        }
      }
      const job: InternalJob = {
        id: nextJobId(),
        input,
        status: 'pending',
        progress: 0,
        attempt: 1,
        batchKey: input.batchKey,
        resolve,
        reject,
        controller: new AbortController(),
      };
      jobs.push(job);
      notify();
      void drive();
    });
  }

  function enqueueBatch(inputs: EnqueueInput[]): { batchKey: string; promises: Promise<UploadResult>[] } {
    if (inputs.length === 0) return { batchKey: '', promises: [] };
    const batchKey = nextBatchKey();
    const jobIds: string[] = [];
    const promises: Promise<UploadResult>[] = [];

    for (const input of inputs) {
      const tagged = { ...input, batchKey };
      const promise = new Promise<UploadResult>((resolve, reject) => {
        const job: InternalJob = {
          id: nextJobId(),
          input: tagged,
          status: 'pending',
          progress: 0,
          attempt: 1,
          batchKey,
          resolve,
          reject,
          controller: new AbortController(),
        };
        jobs.push(job);
        jobIds.push(job.id);
      });
      promises.push(promise);
    }

    batchCoord.registerBatch(jobIds, inputs[0]!.reportId!);
    notify();
    void drive();
    return { batchKey, promises };
  }

  function retry(jobId: string): Promise<UploadResult> {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) {
      return Promise.reject(new Error(`upload job ${jobId} not found`));
    }
    if (job.status !== 'failed' && job.status !== 'cancelled') {
      return Promise.reject(
        new Error(`upload job ${jobId} is not retryable (status=${job.status})`),
      );
    }
    return new Promise<UploadResult>((resolve, reject) => {
      job.status = 'pending';
      job.attempt = 1;
      job.progress = 0;
      job.error = undefined;
      job.resolve = resolve;
      job.reject = reject;
      job.controller = new AbortController();
      notify();
      void drive();
    });
  }

  function remove(jobId: string): void {
    const idx = jobs.findIndex((j) => j.id === jobId);
    if (idx < 0) return;
    const [job] = jobs.splice(idx, 1);
    if (
      job &&
      job.status !== 'completed' &&
      job.status !== 'failed' &&
      job.status !== 'cancelled'
    ) {
      // In-flight job: abort the network call so we don't fire any
      // downstream pipeline step (notably POST /files). `processJob`
      // will catch the `AbortError`, but by then the job is no longer
      // in `jobs` so the catch path's state writes are inert.
      job.controller.abort();
    }
    notify();
  }

  function clear(): void {
    const removed = jobs.splice(0, jobs.length);
    batchCoord = createBatchCoordinator();

    for (const job of removed) {
      if (
        job.status === 'completed' ||
        job.status === 'failed' ||
        job.status === 'cancelled'
      ) {
        continue;
      }
      job.controller.abort();
      const error = new Error('upload queue cleared');
      error.name = 'AbortError';
      job.reject(error);
    }

    persistence?.clear();
    snapshotDirty = true;
    for (const fn of listeners) fn();
  }

  // Seed from persistence (`internals.initialJobs`). The caller has
  // already filtered out jobs whose source URI no longer resolves to a
  // readable file. We re-create promise handles as noops because no
  // caller is awaiting a rehydrated job after a restart — it's
  // fire-and-forget.
  if (internals.initialJobs && internals.initialJobs.length > 0) {
    for (const persisted of internals.initialJobs) {
      const noop = (): void => undefined;
      const job: InternalJob = {
        id: persisted.id,
        input: persisted.input,
        status: persisted.status,
        progress: persisted.progress,
        attempt: persisted.attempt,
        fileId: persisted.fileId,
        thumbnailFileId: persisted.thumbnailFileId,
        error: persisted.error,
        resolve: noop,
        reject: noop,
        controller: new AbortController(),
      };
      jobs.push(job);
    }
    snapshotDirty = true;
    // Persist the normalised snapshot (in-flight states coerced to
    // pending by `rehydrateJob` upstream).
    if (persistence) {
      persistence.save(
        jobs.map((j) => ({
          id: j.id,
          input: j.input,
          status: j.status,
          progress: j.progress,
          attempt: j.attempt,
          fileId: j.fileId,
          thumbnailFileId: j.thumbnailFileId,
          error: j.error,
        })),
      );
    }
    if (jobs.some((j) => j.status === 'pending')) {
      void drive();
    }
  }

  return {
    enqueue,
    enqueueBatch,
    retry,
    getJobs: snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    remove,
    clear,
  };
}
