/**
 * QueueProvider — provides the singleton upload queue to descendants.
 *
 * The provider instantiates the queue with the **default-wired**
 * collaborators from `run-upload.ts` (real `request()` calls; XHR PUT
 * to R2). Per Pitfall 13 the integration test exercises this default
 * by stubbing the global `fetch` — it does NOT swap deps. Tests that
 * need a negative-path branch (e.g. retry-on-network-error) construct
 * their own queue via `createUploadQueue()` and pass it as the
 * `value` prop on a manual `<QueueContext.Provider>`.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { createUploadQueue, type UploadQueue } from './queue';
import { defaultUploadDeps } from './run-upload';

const QueueContext = createContext<UploadQueue | null>(null);

export interface QueueProviderProps {
  children: ReactNode;
  /** Test seam — override the queue (and therefore its deps). */
  queue?: UploadQueue;
}

export function QueueProvider({ children, queue }: QueueProviderProps) {
  const value = useMemo<UploadQueue>(
    () => queue ?? createUploadQueue(defaultUploadDeps),
    [queue],
  );
  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

export function useUploadQueueContext(): UploadQueue {
  const ctx = useContext(QueueContext);
  if (!ctx) {
    throw new Error('useUploadQueueContext must be used inside <QueueProvider>');
  }
  return ctx;
}

// Re-export for tests that want to construct an isolated queue.
export { createUploadQueue } from './queue';
export type { UploadQueue } from './queue';
