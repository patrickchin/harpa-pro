/**
 * QueryClient factory + active auth-scope registry.
 *
 * `SessionQueryProvider` creates a fresh client for every authenticated
 * or anonymous scope. The registry lets non-React session teardown
 * paths clear whichever client is currently reachable without sharing
 * one client across user identities.
 *
 * Defaults match canonical TanStack Query v5: `staleTime: 30s`,
 * `gcTime: 5min`, `refetchOnWindowFocus: false`, `refetchOnReconnect:
 * true`, `retry: 1`. These let re-mounting a screen render the cached
 * data instantly while a background refetch revalidates.
 */
import { QueryClient } from '@tanstack/react-query';
import { clearPersistedQueryCaches } from './query-persister';

export function createMobileQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });
}

let activeQueryClient: QueryClient | null = null;

export function registerActiveQueryClient(client: QueryClient): () => void {
  activeQueryClient = client;
  return () => {
    if (activeQueryClient === client) {
      activeQueryClient = null;
    }
  };
}

/**
 * Drop every in-memory query AND every persisted user snapshot. Called from:
 *   - `AuthSessionProvider.signOut` (explicit user logout)
 *   - the `setOnUnauthorizedCallback` handler (401 = session lost)
 *
 * SECURITY: must run on every session-end path. Otherwise the next
 * user would see the previous user's cached data on cold start
 * before any refetch fires.
 */
export async function resetQueryCache(): Promise<void> {
  activeQueryClient?.clear();
  try {
    clearPersistedQueryCaches();
  } catch {
    // Storage errors here mean a user-scoped snapshot may survive, but
    // the in-memory clear above is the user-facing source of truth and
    // the auth-scoped bootstrap will never restore it for another user.
    // Never block logout on storage cleanup.
  }
}
