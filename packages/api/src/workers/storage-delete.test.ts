import { describe, expect, it, vi } from 'vitest';
import { runStorageDeleteWorker } from './storage-delete.js';

describe('storage delete worker', () => {
  it('stays idle when background maintenance is disabled', async () => {
    const drainStorageDeleteJobs = vi.fn().mockResolvedValue({ claimed: 0, failed: 0 });
    const getNextStorageDeleteJobWakeAt = vi.fn().mockResolvedValue(null);
    const pruneExpiredFileUploadLeases = vi.fn().mockResolvedValue({
      consumedLeasesPruned: 0,
      unconsumedLeasesPruned: 0,
    });
    const reportWorkerException = vi.fn();
    const resetPool = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();
    const warn = vi.fn();
    const error = vi.fn();
    let releaseStop!: () => void;
    const stopSignal = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });

    const run = runStorageDeleteWorker({
      backgroundMaintenanceEnabled: false,
      drainStorageDeleteJobs,
      getNextStorageDeleteJobWakeAt,
      pruneExpiredFileUploadLeases,
      reportWorkerException,
      resetPool,
      log,
      warn,
      error,
      waitUntilStopped: () => stopSignal,
    });

    await vi.waitFor(() => {
      expect(log).toHaveBeenCalledWith('[storage-delete-worker] started');
      expect(log).toHaveBeenCalledWith('[storage-delete-worker] background maintenance disabled');
    });

    expect(drainStorageDeleteJobs).not.toHaveBeenCalled();
    expect(getNextStorageDeleteJobWakeAt).not.toHaveBeenCalled();
    expect(pruneExpiredFileUploadLeases).not.toHaveBeenCalled();
    expect(reportWorkerException).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(resetPool).not.toHaveBeenCalled();

    releaseStop();
    await run;

    expect(resetPool).toHaveBeenCalledOnce();
    expect(log).toHaveBeenLastCalledWith('[storage-delete-worker] stopped');
  });
});
