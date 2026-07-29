import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState, type ReactNode } from 'react';

import { useAuthSession } from '../auth/session-context';
import { queryClient } from './query-client';
import {
  clearPersistedQueryCaches,
  createQueryPersister,
  shouldDehydrateQuery,
  type QueryPersister,
} from './query-persister';

interface ActiveScope {
  userId: string | null;
  persister: QueryPersister | null;
}

interface SessionQueryProviderProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Mount React Query only after auth has resolved. Persisted server
 * state is namespaced by user id; transitions withhold descendants
 * while the shared in-memory client is cleared.
 */
export function SessionQueryProvider({
  children,
  fallback = null,
}: SessionQueryProviderProps) {
  const session = useAuthSession();
  const targetUserId =
    session.status === 'loading' ? undefined : (session.user?.id ?? null);
  const [activeScope, setActiveScope] = useState<ActiveScope | null>(null);
  const scopeMatches =
    activeScope !== null && activeScope.userId === targetUserId;

  useEffect(() => {
    if (targetUserId === undefined || scopeMatches) return;

    queryClient.clear();
    if (targetUserId === null) {
      try {
        clearPersistedQueryCaches();
      } catch {
        // The unauthenticated UI can still render safely because the
        // in-memory cache is empty and no persisted cache is mounted.
      }
    }

    setActiveScope({
      userId: targetUserId,
      persister:
        targetUserId === null ? null : createQueryPersister(targetUserId),
    });
  }, [scopeMatches, targetUserId]);

  if (targetUserId === undefined || !scopeMatches || activeScope === null) {
    return fallback;
  }

  if (activeScope.persister === null) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      key={activeScope.userId}
      client={queryClient}
      persistOptions={{
        persister: activeScope.persister.persister,
        maxAge: activeScope.persister.maxAge,
        buster: activeScope.persister.buster,
        dehydrateOptions: { shouldDehydrateQuery },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
