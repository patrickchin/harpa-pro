/**
 * QueueProvider — provides the singleton upload queue to descendants.
 *
 * The provider instantiates the queue with the **default-wired**
 * collaborators from `run-upload.ts` (real `request()` calls; XHR PUT
 * to R2) and an MMKV-backed `QueuePersistence` so unfinished jobs
 * survive app restarts. At mount we load the persisted blob, drop
 * jobs whose source URI no longer points at a readable file, coerce
 * in-flight statuses to `pending` (so the driver re-runs presign +
 * PUT — both idempotent for our usage), and hand the survivors to
 * `createUploadQueue` as `initialJobs`.
 *
 * Per Pitfall 13 the integration test exercises this default by
 * stubbing the global `fetch` — it does NOT swap deps. Tests that
 * need a negative-path branch (e.g. retry-on-network-error) construct
 * their own queue via `createUploadQueue()` and pass it as the
 * `value` prop on a manual `<QueueContext.Provider>`.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { File as FsFile } from 'expo-file-system';

import { createUploadQueue, type UploadQueue } from './queue';
import { defaultUploadDeps } from './run-upload';
import {
  createMmkvPersistence,
  rehydrateJob,
  type PersistedJob,
  type QueuePersistence,
} from './persistence';

const QueueContext = createContext<UploadQueue | null>(null);

export interface QueueProviderProps {
  children: ReactNode;
  /** Test seam — override the queue (and therefore its deps). */
  queue?: UploadQueue;
}

/**
 * Predicate used at hydration to discard jobs whose source URI has
 * been swept by the OS (temp capture directories are aggressively
 * pruned). Defaults to `expo-file-system`'s `new File(uri).exists`.
 */
export function sourceUriExists(uri: string): boolean {
  try {
    return new FsFile(uri).exists;
  } catch {
    return false;
  }
}

/**
 * Load + filter persisted jobs. Exported for testability so the
 * default wiring can be exercised end-to-end (Pitfall 13).
 */
export function hydratePersistedJobs(
  persistence: QueuePersistence,
  existsFn: (uri: string) => boolean = sourceUriExists,
): PersistedJob[] {
  const persisted = persistence.load();
  const surviving = persisted.filter((j) => existsFn(j.input.sourceUri));
  return surviving.map(rehydrateJob);
}

export function QueueProvider({ children, queue }: QueueProviderProps) {
  const value = useMemo<UploadQueue>(() => {
    if (queue) return queue;
    const persistence = createMmkvPersistence();
    const initialJobs = hydratePersistedJobs(persistence);
    return createUploadQueue(defaultUploadDeps, { persistence, initialJobs });
  }, [queue]);
  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

export function useUploadQueueContext(): UploadQueue {
  const ctx = useContext(QueueContext);
  if (!ctx) {
    throw new Error('useUploadQueueContext must be used inside <QueueProvider>');
  }
  return ctx;
}

/**
 * Like `useUploadQueueContext`, but returns `null` when no
 * `<QueueProvider>` is mounted. Use this in surfaces that may legally
 * render outside the upload provider (e.g. the same shared screen
 * rendered by snapshot tests that omit the provider tree).
 */
export function useOptionalUploadQueueContext(): UploadQueue | null {
  return useContext(QueueContext);
}

// Re-export for tests that want to construct an isolated queue.
export { createUploadQueue } from './queue';
export type { UploadQueue } from './queue';
