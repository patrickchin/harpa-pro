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
 *
 * Phase F: production wires `@react-native-async-storage/async-storage`
 * as the persistence adapter and calls `rehydrate()` once on mount so
 * pending / failed uploads from the previous app session resume. The
 * default queue snapshot lives at `harpa.uploads.queue.v1`.
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createUploadQueue, type UploadQueue, type QueueStorage } from './queue';
import { defaultUploadDeps } from './run-upload';

const QueueContext = createContext<UploadQueue | null>(null);

const defaultStorage: QueueStorage = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
};

export interface QueueProviderProps {
  children: ReactNode;
  /** Test seam — override the queue (and therefore its deps). */
  queue?: UploadQueue;
  /** Test seam — swap the AsyncStorage adapter. */
  storage?: QueueStorage;
}

export function QueueProvider({ children, queue, storage }: QueueProviderProps) {
  const value = useMemo<UploadQueue>(
    () =>
      queue ??
      createUploadQueue(defaultUploadDeps, {
        storage: storage ?? defaultStorage,
      }),
    [queue, storage],
  );
  // Phase F: rehydrate once on mount. The queue's `rehydrate()` is a
  // no-op when no storage adapter is configured (test path that
  // injects `queue` directly).
  useEffect(() => {
    void value.rehydrate();
  }, [value]);
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
