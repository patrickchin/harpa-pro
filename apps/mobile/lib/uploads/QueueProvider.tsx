/**
 * QueueProvider stub — upload queue lands in P3.
 *
 * Security review §2 mandates: all methods (not just enqueue) must
 * throw if the interface expands beyond enqueue in P3.
 */
import { createContext, useContext, type ReactNode } from 'react';

export interface QueueContextValue {
  enqueue: (item: unknown) => void;
}

const QueueContext = createContext<QueueContextValue | null>(null);

export function QueueProvider({ children }: { children: ReactNode }) {
  const enqueue = () => {
    throw new Error('QueueProvider is a stub — upload queue lands in P3');
  };
  return <QueueContext.Provider value={{ enqueue }}>{children}</QueueContext.Provider>;
}

export function useUploadQueue() {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error('useUploadQueue must be inside QueueProvider');
  return ctx;
}
