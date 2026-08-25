import { describe, expect, it, vi } from 'vitest';
import {
  startStorageWorkerMemorySampling,
  storageWorkerMemorySample,
} from './storage-worker-memory.js';

describe('storageWorkerMemorySample', () => {
  it('emits numeric process and Machine fields', () => {
    expect(
      storageWorkerMemorySample(
        'interval',
        {
          rss: 120,
          heapTotal: 100,
          heapUsed: 80,
          external: 20,
          arrayBuffers: 10,
        },
        512,
        256,
        3_600,
      ),
    ).toEqual({
      level: 'info',
      event: 'storage_delete_worker_memory',
      reason: 'interval',
      processUptimeSeconds: 3_600,
      rssBytes: 120,
      heapTotalBytes: 100,
      heapUsedBytes: 80,
      externalBytes: 20,
      arrayBuffersBytes: 10,
      machineTotalBytes: 512,
      machineFreeBytes: 256,
    });
  });

  it('samples independently until stopped', () => {
    vi.useFakeTimers();
    const sample = vi.fn();

    try {
      const stop = startStorageWorkerMemorySampling(sample, 60 * 60_000);

      vi.advanceTimersByTime(60 * 60_000 - 1);
      expect(sample).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(sample).toHaveBeenCalledTimes(1);

      stop();
      vi.advanceTimersByTime(60 * 60_000);
      expect(sample).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
