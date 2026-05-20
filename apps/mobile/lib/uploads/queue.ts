/**
 * In-memory upload queue.
 *
 * One queue per `QueueProvider` mount — survives screen navigation
 * (the provider is at the root). Phase F adds optional AsyncStorage
 * persistence via the `storage` adapter so pending / failed jobs
 * also survive app restarts. The runtime runs jobs serially;
 * bursts (e.g. 20-photo gallery import) enqueue in order. Failed jobs
 * auto-retry up to MAX_ATTEMPTS with exponential backoff; after that
 * they sit in `failed` and the UI can call `retry(jobId)` to push
 * them back through the pipeline.
 *
 * Phase F also wires an `AbortController` per in-flight job so
 * `remove(jobId)` actually cancels the in-progress R2 PUT instead of
 * just dropping the queue entry while bytes keep flushing in the
 * background.
 *
 * Subscribers (`useFileUpload`) receive the full job list on every
 * transition via `subscribe(listener)`.
 */
import type { EnqueueInput, UploadJob, UploadResult } from './types';
import { MAX_ATTEMPTS, backoffMs } from './types';
import { runUploadJob, type UploadDeps } from './run-upload';

let _jobCounter = 0;
function nextJobId(): string {
  _jobCounter += 1;
  return `upl_${Date.now().toString(36)}_${_jobCounter}`;
}

/**
 * Pluggable persistence layer. Production wires
 * `@react-native-async-storage/async-storage`; tests pass an in-memory
 * fake. Reads/writes are best-effort — a failed `setItem` is logged
 * but never breaks the queue.
 */
export interface QueueStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export const QUEUE_STORAGE_KEY = 'harpa.uploads.queue.v1';

export interface QueueInternals {
  /** Test seam — sets the delay function used between retries. */
  delayMs?: (attempt: number) => number;
  /** Test seam — overrides the sleep implementation. */
  sleep?: (ms: number) => Promise<void>;
  /** Phase F — optional persistence adapter. Omit to disable. */
  storage?: QueueStorage;
}

export interface UploadQueue {
  enqueue: (input: EnqueueInput) => Promise<UploadResult>;
  retry: (jobId: string) => Promise<UploadResult>;
  getJobs: () => UploadJob[];
  subscribe: (listener: () => void) => () => void;
  /** Cancel pending/failed job. In-flight jobs are aborted via AbortSignal. */
  remove: (jobId: string) => void;
  /**
   * Phase F: rehydrate pending/failed jobs from storage. The returned
   * promise resolves once persistence has been read; rehydrated jobs
   * are appended to the queue with their attempt counter reset to 1.
   * Completed jobs in storage are dropped (the server already has them).
   * Jobs whose `input.clientId` matches a job already in memory are
   * skipped (dedupe).
   */
  rehydrate: () => Promise<void>;
}

interface InternalJob extends UploadJob {
  resolve: (result: UploadResult) => void;
  reject: (err: Error) => void;
  /** Abort controller for the in-flight job. `null` while pending. */
  abort: AbortController | null;
}

interface PersistedJob {
  id: string;
  input: EnqueueInput;
  status: UploadJob['status'];
  attempt: number;
  fileId?: string;
  error?: string;
}

export function createUploadQueue(
  deps: UploadDeps,
  internals: QueueInternals = {},
): UploadQueue {
  const jobs: InternalJob[] = [];
  const listeners = new Set<() => void>();
  let running = false;
  let cachedSnapshot: UploadJob[] = [];
  let snapshotDirty = true;

  const sleep = internals.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const delay = internals.delayMs ?? backoffMs;
  const storage = internals.storage ?? null;

  function notify(): void {
    snapshotDirty = true;
    for (const fn of listeners) fn();
    // Best-effort persistence after every transition. We don't await
    // so the UI never blocks on storage; failures are silenced
    // (the next transition will overwrite).
    if (storage) void persist();
  }

  async function persist(): Promise<void> {
    if (!storage) return;
    try {
      // Only persist jobs still worth resuming. Completed jobs are
      // dropped because the server already has them; the snapshot is
      // therefore bounded by in-flight + pending + failed counts.
      const payload: PersistedJob[] = jobs
        .filter((j) => j.status !== 'completed')
        .map((j) => ({
          id: j.id,
          input: j.input,
          // In-flight statuses revert to `pending` on persist so a
          // crash mid-PUT resumes cleanly on the next boot.
          status: j.status === 'completed' ? 'completed' : 'pending',
          attempt: 1,
          fileId: j.fileId,
          error: j.error,
        }));
      await storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Persistence is best-effort.
    }
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
    job.abort = new AbortController();
    try {
      const result = await runUploadJob(job.input, deps, {
        onStatus: (status) => {
          job.status = status;
          notify();
        },
        onProgress: (fraction) => {
          job.progress = fraction;
          notify();
        },
        signal: job.abort.signal,
      });
      job.fileId = result.file.id;
      job.status = 'completed';
      job.progress = 1;
      job.abort = null;
      notify();
      job.resolve(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      job.abort = null;
      // Abort-driven failures (remove(jobId) while in flight) should
      // never schedule a retry — the user asked us to cancel.
      const aborted = /abort/i.test(message);
      if (!aborted && job.attempt < MAX_ATTEMPTS) {
        // Schedule retry — keep job in `pending` so the driver picks
        // it up again after the backoff window.
        const waitMs = delay(job.attempt);
        job.attempt += 1;
        job.status = 'pending';
        job.error = message;
        job.progress = 0;
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
      // Phase F: dedupe by clientId so accidental double-tap on Save
      // doesn't enqueue the same recording twice. Matching against
      // any non-completed job — completed jobs already created their
      // file row server-side so a re-enqueue would create a duplicate
      // file but with a fresh clientId match window we ignore those.
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
          // Hijack the dup's resolvers so this caller's promise
          // follows the existing job's outcome.
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
        resolve,
        reject,
        abort: null,
      };
      jobs.push(job);
      notify();
      void drive();
    });
  }

  function retry(jobId: string): Promise<UploadResult> {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) {
      return Promise.reject(new Error(`upload job ${jobId} not found`));
    }
    if (job.status !== 'failed') {
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
      notify();
      void drive();
    });
  }

  function remove(jobId: string): void {
    const idx = jobs.findIndex((j) => j.id === jobId);
    if (idx < 0) return;
    const [job] = jobs.splice(idx, 1);
    if (job && job.abort) {
      // Phase F: actually cancel the in-flight R2 PUT. Without this
      // the bytes keep flushing in the background after the user
      // dismissed the pending row.
      try {
        job.abort.abort();
      } catch {
        // Already aborted.
      }
    }
    notify();
  }

  async function rehydrate(): Promise<void> {
    if (!storage) return;
    let raw: string | null;
    try {
      raw = await storage.getItem(QUEUE_STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    let parsed: PersistedJob[];
    try {
      parsed = JSON.parse(raw) as PersistedJob[];
    } catch {
      // Corrupt snapshot — drop it so future writes are clean.
      try {
        await storage.removeItem(QUEUE_STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }
    if (!Array.isArray(parsed)) return;
    for (const p of parsed) {
      if (!p?.input?.sourceUri) continue;
      // Dedupe against in-memory queue (e.g. component remount calls
      // rehydrate twice).
      const dupId = jobs.find((j) => j.id === p.id);
      if (dupId) continue;
      const dupClient = p.input.clientId
        ? jobs.find((j) => j.input.clientId === p.input.clientId)
        : undefined;
      if (dupClient) continue;
      const job: InternalJob = {
        id: p.id,
        input: p.input,
        status: 'pending',
        progress: 0,
        attempt: 1,
        fileId: p.fileId,
        error: p.error,
        abort: null,
        // Rehydrated jobs lose their original promise consumers; we
        // give them no-ops so the queue can still drive them.
        // Callers that care about the outcome should re-enqueue with
        // the same `clientId`, which will hijack this job's resolvers.
        resolve: () => undefined,
        reject: () => undefined,
      };
      jobs.push(job);
    }
    notify();
    void drive();
  }

  return {
    enqueue,
    retry,
    getJobs: snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    remove,
    rehydrate,
  };
}

