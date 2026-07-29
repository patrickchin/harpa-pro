import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState, type ReactNode } from 'react';

import { useAuthSession } from '../auth/session-context';
import {
  createMobileQueryClient,
  registerActiveQueryClient,
} from './query-client';
import {
  clearPersistedQueryCaches,
  createQueryPersister,
  shouldDehydrateQuery,
  type QueryPersister,
} from './query-persister';

interface ActiveScope {
  userId: string | null;
  queryClient: QueryClient;
  persister: QueryPersister | null;
}

interface SessionQueryProviderProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Mount React Query only after auth has resolved. Persisted server
 * state is namespaced by user id; transitions withhold descendants
 * while swapping to a fresh in-memory client. A late restore from the
 * previous scope can therefore mutate only an unreachable old client.
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
      queryClient: createMobileQueryClient(),
      persister:
        targetUserId === null ? null : createQueryPersister(targetUserId),
    });
  }, [scopeMatches, targetUserId]);

  useEffect(() => {
    if (!scopeMatches || activeScope === null) return undefined;
    return registerActiveQueryClient(activeScope.queryClient);
  }, [activeScope, scopeMatches]);

  if (targetUserId === undefined || !scopeMatches || activeScope === null) {
    return fallback;
  }

  if (activeScope.persister === null) {
    return (
      <QueryClientProvider client={activeScope.queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      key={activeScope.userId}
      client={activeScope.queryClient}
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
