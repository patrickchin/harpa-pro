import { freemem, totalmem } from 'node:os';

export type StorageWorkerMemorySampleReason = 'startup' | 'interval';

export interface StorageWorkerMemorySample {
  level: 'info';
  event: 'storage_delete_worker_memory';
  reason: StorageWorkerMemorySampleReason;
  processUptimeSeconds: number;
  rssBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
  machineTotalBytes: number;
  machineFreeBytes: number;
}

export function startStorageWorkerMemorySampling(
  sample: () => void,
  intervalMs: number,
): () => void {
  // Keep operational telemetry independent from the database wake schedule.
  const timer = setInterval(sample, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

/**
 * Build the worker's structured memory sample without retaining heap objects.
 * Fly's built-in Machine metrics remain authoritative for saturation; this log
 * separates the worker process from launcher and VM overhead during incidents.
 */
export function storageWorkerMemorySample(
  reason: StorageWorkerMemorySampleReason,
  usage: NodeJS.MemoryUsage = process.memoryUsage(),
  machineTotalBytes = totalmem(),
  machineFreeBytes = freemem(),
  processUptimeSeconds = process.uptime(),
): StorageWorkerMemorySample {
  return {
    level: 'info',
    event: 'storage_delete_worker_memory',
    reason,
    processUptimeSeconds,
    rssBytes: usage.rss,
    heapTotalBytes: usage.heapTotal,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
    machineTotalBytes,
    machineFreeBytes,
  };
}
