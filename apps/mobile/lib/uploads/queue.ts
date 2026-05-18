/**
 * In-memory upload queue.
 *
 * One queue per `QueueProvider` mount — survives screen navigation
 * (the provider is at the root) but NOT app restarts (no
 * AsyncStorage persistence — that lands in a follow-up). The runtime
 * runs jobs serially; bursts (e.g. 20-photo gallery import) enqueue
 * in order. Failed jobs auto-retry up to MAX_ATTEMPTS with
 * exponential backoff; after that they sit in `failed` and the UI can
 * call `retry(jobId)` to push them back through the pipeline.
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

export interface QueueInternals {
  /** Test seam — sets the delay function used between retries. */
  delayMs?: (attempt: number) => number;
  /** Test seam — overrides the sleep implementation. */
  sleep?: (ms: number) => Promise<void>;
}

export interface UploadQueue {
  enqueue: (input: EnqueueInput) => Promise<UploadResult>;
  retry: (jobId: string) => Promise<UploadResult>;
  getJobs: () => UploadJob[];
  subscribe: (listener: () => void) => () => void;
  /** Cancel pending/failed job. In-flight jobs run to completion. */
  remove: (jobId: string) => void;
}

interface InternalJob extends UploadJob {
  resolve: (result: UploadResult) => void;
  reject: (err: Error) => void;
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

  function notify(): void {
    snapshotDirty = true;
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
      const result = await runUploadJob(job.input, deps, {
        onStatus: (status) => {
          job.status = status;
          notify();
        },
        onProgress: (fraction) => {
          job.progress = fraction;
          notify();
        },
      });
      job.fileId = result.file.id;
      job.status = 'completed';
      job.progress = 1;
      notify();
      job.resolve(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (job.attempt < MAX_ATTEMPTS) {
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
      const job: InternalJob = {
        id: nextJobId(),
        input,
        status: 'pending',
        progress: 0,
        attempt: 1,
        resolve,
        reject,
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
    if (job && job.status !== 'completed' && job.status !== 'failed') {
      // In-flight job: we don't actually abort the network call (the
      // run-upload pipeline doesn't accept an AbortSignal in this
      // commit) but we drop the reference so subscribers stop seeing
      // it. The promise still resolves/rejects to whoever held it.
    }
    notify();
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
  };
}
