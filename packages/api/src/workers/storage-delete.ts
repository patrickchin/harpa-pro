import { resetPool } from '../db/client.js';
import {
  drainStorageDeleteJobs,
  getNextStorageDeleteJobWakeAt,
  pruneExpiredFileUploadLeases,
} from '../services/storage-delete-jobs.js';
import { captureApiException } from '../telemetry/sentry.js';
import {
  computeStorageWorkerSleepMs,
  LOW_TRAFFIC_STORAGE_WORKER_SCHEDULE,
} from './storage-worker-schedule.js';

const {
  errorPollMs: ERROR_POLL_MS,
  leasePruneIntervalMs: LEASE_PRUNE_INTERVAL_MS,
  maxJobsPerPass: MAX_JOBS_PER_PASS,
} = LOW_TRAFFIC_STORAGE_WORKER_SCHEDULE;

let stopping = false;
let lastLeasePruneAt = 0;
let wakeFromSleep: (() => void) | null = null;

process.once('SIGINT', () => {
  requestStop();
});
process.once('SIGTERM', () => {
  requestStop();
});

console.log('[storage-delete-worker] started');

while (!stopping) {
  try {
    const result = await drainStorageDeleteJobs({
      maxJobs: MAX_JOBS_PER_PASS,
    });
    if (result.failed > 0) {
      const error = new Error(
        `${result.failed} storage deletion job(s) failed`,
      );
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'storage_delete_jobs_failed',
          ...result,
        }),
      );
      reportWorkerException(error);
    }
    if (Date.now() - lastLeasePruneAt >= LEASE_PRUNE_INTERVAL_MS) {
      const pruned = await pruneExpiredFileUploadLeases();
      lastLeasePruneAt = Date.now();
      if (
        pruned.consumedLeasesPruned > 0 ||
        pruned.unconsumedLeasesPruned > 0
      ) {
        console.log(
          JSON.stringify({
            level: 'info',
            event: 'expired_file_upload_leases_pruned',
            ...pruned,
          }),
        );
      }
    }
    if (result.claimed === 0) {
      const now = Date.now();
      await wait(
        computeStorageWorkerSleepMs({
          now,
          lastLeasePruneAt,
          nextJobWakeAt: await getNextStorageDeleteJobWakeAt(),
        }),
      );
    }
  } catch (error) {
    console.error('[storage-delete-worker] drain failed', error);
    reportWorkerException(error);
    await wait(ERROR_POLL_MS);
  }
}

await resetPool();
console.log('[storage-delete-worker] stopped');

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

function reportWorkerException(error: unknown): void {
  captureApiException(error, {
    requestId: 'storage-delete-worker',
    method: 'WORKER',
    route: 'storage-delete-jobs',
    status: 0,
  });
}
