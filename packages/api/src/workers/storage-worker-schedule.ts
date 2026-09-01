const DAY_MS = 24 * 60 * 60_000;

export const LOW_TRAFFIC_STORAGE_WORKER_SCHEDULE = {
  maxIdlePollMs: DAY_MS,
  minIdlePollMs: 1_000,
  errorPollMs: 60_000,
  leasePruneIntervalMs: DAY_MS,
  maxJobsPerPass: 10,
} as const;

export function computeStorageWorkerSleepMs(input: {
  now: number;
  lastLeasePruneAt: number;
  nextJobWakeAt: Date | null;
}): number {
  const nextJobWaitMs = input.nextJobWakeAt
    ? Math.max(
        LOW_TRAFFIC_STORAGE_WORKER_SCHEDULE.minIdlePollMs,
        input.nextJobWakeAt.getTime() - input.now,
      )
    : LOW_TRAFFIC_STORAGE_WORKER_SCHEDULE.maxIdlePollMs;
  const nextLeasePruneWaitMs = Math.max(
    LOW_TRAFFIC_STORAGE_WORKER_SCHEDULE.minIdlePollMs,
    LOW_TRAFFIC_STORAGE_WORKER_SCHEDULE.leasePruneIntervalMs - (input.now - input.lastLeasePruneAt),
  );

  return Math.min(
    LOW_TRAFFIC_STORAGE_WORKER_SCHEDULE.maxIdlePollMs,
    nextJobWaitMs,
    nextLeasePruneWaitMs,
  );
}
