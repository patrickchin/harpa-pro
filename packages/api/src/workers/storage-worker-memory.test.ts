import { describe, expect, it } from 'vitest';
import { storageWorkerMemorySample } from './storage-worker-memory.js';

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
});
