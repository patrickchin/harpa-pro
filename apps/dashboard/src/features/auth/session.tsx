import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import { queryClient } from '@/lib/query-client';
import { deriveAuthStatus, type DashboardAuthStatus } from './auth-state';
import { authClient, type SessionUser } from './client';

interface AuthSessionValue {
  status: DashboardAuthStatus;
  user: SessionUser | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthSessionContext = createContext<AuthSessionValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { data, isPending, refetch } = authClient.useSession();
  const user = (data?.user ?? null) as SessionUser | null;
  const status = deriveAuthStatus(user, isPending);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const signOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } finally {
      queryClient.clear();
      await refetch();
    }
  }, [refetch]);

  const value = useMemo(
    () => ({ status, user, refresh, signOut }),
    [refresh, signOut, status, user],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionValue {
  const session = useContext(AuthSessionContext);
  if (!session) {
    throw new Error('useAuthSession must be used within an AuthSessionProvider.');
  }
  return session;
}
