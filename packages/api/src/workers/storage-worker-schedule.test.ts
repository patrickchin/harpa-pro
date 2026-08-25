import { describe, expect, it } from 'vitest';
import { computeStorageWorkerSleepMs } from './storage-worker-schedule.js';

const DAY_MS = 24 * 60 * 60_000;

describe('computeStorageWorkerSleepMs', () => {
  it('leaves an empty low-traffic database asleep for one day', () => {
    const now = Date.UTC(2026, 7, 25, 12);

    expect(
      computeStorageWorkerSleepMs({
        now,
        lastLeasePruneAt: now,
        nextJobWakeAt: null,
      }),
    ).toBe(DAY_MS);
  });

  it('wakes for known durable work before the daily reconciliation', () => {
    const now = Date.UTC(2026, 7, 25, 12);

    expect(
      computeStorageWorkerSleepMs({
        now,
        lastLeasePruneAt: now,
        nextJobWakeAt: new Date(now + 2 * 60 * 60_000),
      }),
    ).toBe(2 * 60 * 60_000);
  });

  it('wakes when the daily upload-lease prune becomes due', () => {
    const now = Date.UTC(2026, 7, 25, 12);

    expect(
      computeStorageWorkerSleepMs({
        now,
        lastLeasePruneAt: now - 23 * 60 * 60_000,
        nextJobWakeAt: null,
      }),
    ).toBe(60 * 60_000);
  });

  it('uses the one-second floor for overdue work', () => {
    const now = Date.UTC(2026, 7, 25, 12);

    expect(
      computeStorageWorkerSleepMs({
        now,
        lastLeasePruneAt: now,
        nextJobWakeAt: new Date(now - 1),
      }),
    ).toBe(1_000);
  });
});
