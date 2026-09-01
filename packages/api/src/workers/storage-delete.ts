import { resetPool } from '../db/client.js';
import {
  drainStorageDeleteJobs,
  getNextStorageDeleteJobWakeAt,
  pruneExpiredFileUploadLeases,
} from '../services/storage-delete-jobs.js';
import { captureApiException } from '../telemetry/sentry.js';
import { backgroundMaintenanceEnabled } from '../lib/background-maintenance.js';
import {
  startStorageWorkerMemorySampling,
  storageWorkerMemorySample,
  type StorageWorkerMemorySampleReason,
} from './storage-worker-memory.js';
import {
  computeStorageWorkerSleepMs,
  LOW_TRAFFIC_STORAGE_WORKER_SCHEDULE,
} from './storage-worker-schedule.js';

const {
  errorPollMs: ERROR_POLL_MS,
  leasePruneIntervalMs: LEASE_PRUNE_INTERVAL_MS,
  maxJobsPerPass: MAX_JOBS_PER_PASS,
  memorySampleIntervalMs: MEMORY_SAMPLE_INTERVAL_MS,
} = LOW_TRAFFIC_STORAGE_WORKER_SCHEDULE;

interface StorageDeleteWorkerOptions {
  backgroundMaintenanceEnabled?: boolean;
  drainStorageDeleteJobs?: typeof drainStorageDeleteJobs;
  getNextStorageDeleteJobWakeAt?: typeof getNextStorageDeleteJobWakeAt;
  pruneExpiredFileUploadLeases?: typeof pruneExpiredFileUploadLeases;
  reportWorkerException?: (error: unknown) => void;
  resetPool?: typeof resetPool;
  log?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string, cause: unknown) => void;
  startStorageWorkerMemorySampling?: typeof startStorageWorkerMemorySampling;
  storageWorkerMemorySample?: typeof storageWorkerMemorySample;
  waitUntilStopped?: () => Promise<void>;
  now?: () => number;
}

let stopping = false;
let lastLeasePruneAt = 0;
let wakeFromSleep: (() => void) | null = null;

process.once('SIGINT', () => {
  requestStop();
});
process.once('SIGTERM', () => {
  requestStop();
});

export async function runStorageDeleteWorker(options: StorageDeleteWorkerOptions = {}): Promise<void> {
  const isEnabled = options.backgroundMaintenanceEnabled ?? backgroundMaintenanceEnabled();
  const drain = options.drainStorageDeleteJobs ?? drainStorageDeleteJobs;
  const getNextWakeAt = options.getNextStorageDeleteJobWakeAt ?? getNextStorageDeleteJobWakeAt;
  const prune = options.pruneExpiredFileUploadLeases ?? pruneExpiredFileUploadLeases;
  const reportException = options.reportWorkerException ?? reportWorkerException;
  const reset = options.resetPool ?? resetPool;
  const log = options.log ?? console.log;
  const warn = options.warn ?? console.warn;
  const logError = options.error ?? console.error;
  const startMemorySampling =
    options.startStorageWorkerMemorySampling ?? startStorageWorkerMemorySampling;
  const sampleMemory = options.storageWorkerMemorySample ?? storageWorkerMemorySample;
  const waitUntilStopped = options.waitUntilStopped ?? defaultWaitUntilStopped;
  const now = options.now ?? Date.now;

  log('[storage-delete-worker] started');

  if (!isEnabled) {
    log('[storage-delete-worker] background maintenance disabled');
    await waitUntilStopped();
    await reset();
    log('[storage-delete-worker] stopped');
    return;
  }

  log(JSON.stringify(sampleMemory('startup')));
  const stopMemorySampling = startMemorySampling(
    () => log(JSON.stringify(sampleMemory('interval'))),
    MEMORY_SAMPLE_INTERVAL_MS,
  );

  try {
    while (!stopping) {
      try {
        const result = await drain({
          maxJobs: MAX_JOBS_PER_PASS,
        });
        if (result.failed > 0) {
          const error = new Error(`${result.failed} storage deletion job(s) failed`);
          warn(
            JSON.stringify({
              level: 'warn',
              event: 'storage_delete_jobs_failed',
              ...result,
            }),
          );
          reportException(error);
        }
        if (now() - lastLeasePruneAt >= LEASE_PRUNE_INTERVAL_MS) {
          const pruned = await prune();
          lastLeasePruneAt = now();
          if (pruned.consumedLeasesPruned > 0 || pruned.unconsumedLeasesPruned > 0) {
            log(
              JSON.stringify({
                level: 'info',
                event: 'expired_file_upload_leases_pruned',
                ...pruned,
              }),
            );
          }
        }
        if (result.claimed === 0) {
          const observedAt = now();
          await wait(
            computeStorageWorkerSleepMs({
              now: observedAt,
              lastLeasePruneAt,
              nextJobWakeAt: await getNextWakeAt(),
            }),
          );
        }
      } catch (error) {
        logError('[storage-delete-worker] drain failed', error);
        reportException(error);
        await wait(ERROR_POLL_MS);
      }
    }
  } finally {
    stopMemorySampling();
    await reset();
    log('[storage-delete-worker] stopped');
  }
}

if (process.env.VITEST !== 'true' && !import.meta.vitest) {
  await runStorageDeleteWorker();
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timeout);
      if (wakeFromSleep === finish) wakeFromSleep = null;
      resolve();
    };
    const timeout = setTimeout(finish, milliseconds);
    wakeFromSleep = finish;
  });
}

function requestStop(): void {
  stopping = true;
  wakeFromSleep?.();
}

function defaultWaitUntilStopped(): Promise<void> {
  if (stopping) return Promise.resolve();
  return new Promise((resolve) => {
    wakeFromSleep = resolve;
  });
}

function reportWorkerException(error: unknown): void {
  captureApiException(error, {
    requestId: 'storage-delete-worker',
    method: 'WORKER',
    route: 'storage-delete-jobs',
    status: 0,
  });
}
