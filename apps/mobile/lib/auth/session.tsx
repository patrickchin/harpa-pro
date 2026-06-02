/**
 * Auth session: thin React wrapper over better-auth's useSession hook.
 *
 * Why this shape:
 *  - **Status, not booleans** (Pitfall 5). `'loading' | 'unauthenticated' |
 *    'authenticated' | 'needs-onboarding'` — callers branch on a single
 *    discriminator.
 *  - **Synchronous token getter**. The API client at lib/api/client.ts
 *    reads the bearer via a synchronous getter. A module-level ref is
 *    updated whenever the session changes so the getter never needs an
 *    async hop on every request.
 *  - **Single 401 path**. The provider registers setOnUnauthorizedCallback
 *    once. ANY 401 fires signOut() + cache clear. The route guard in
 *    the (app) layout redirects on status === 'unauthenticated'.
 *  - **No custom storage**. better-auth + expoClient manage session
 *    persistence in MMKV (lib/auth/client.ts). This provider only
 *    derives React state from the authClient atoms.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { authClient } from './client';
import {
  setAuthTokenGetter,
  setOnUnauthorizedCallback,
} from '../api/auth';
import { resetQueryCache } from '../api/query-client';

export type AuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'authenticated'
  | 'needs-onboarding';

/**
 * User shape exposed to the rest of the app. Sourced from better-auth's
 * session user, augmented with custom fields the API adds (displayName,
 * companyName). Email replaces phone as the primary contact identifier.
 */
export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  companyName: string | null;
  createdAt: string;
}

export interface AuthSessionValue {
  status: AuthStatus;
  user: SessionUser | null;
  /**
   * Best-effort sign-out: calls authClient.signOut(), then clears the
   * query cache. Always resolves (does not throw on network failure).
   */
  signOut: () => Promise<void>;
  /** Re-fetch the session from the server and update local state. */
  refresh: () => Promise<void>;
}

const AuthSessionContext = createContext<AuthSessionValue | undefined>(undefined);

/** Module-level token cache so the synchronous API getter can resolve
 * without a React state hop. Updated in a useEffect keyed on session. */
let cachedToken: string | null = null;

/** Test helper — reset module-level state between test cases. */
export function __resetSessionModule(): void {
  cachedToken = null;
}

function deriveStatus(user: SessionUser | null): AuthStatus {
  if (!user) return 'unauthenticated';
  if (user.displayName == null || user.companyName == null) {
    return 'needs-onboarding';
  }
  return 'authenticated';
}

/** Map the raw better-auth user object (which may carry unknown extra
 * fields from the API's additionalFields config) to our typed SessionUser. */
function mapUser(raw: Record<string, unknown>): SessionUser {
  return {
    id: String(raw.id ?? ''),
    email: String(raw.email ?? ''),
    displayName:
      raw.displayName == null ? null : String(raw.displayName),
    companyName:
      raw.companyName == null ? null : String(raw.companyName),
    createdAt:
      raw.createdAt instanceof Date
        ? raw.createdAt.toISOString()
        : String(raw.createdAt ?? ''),
  };
}

/**
 * AuthSessionProvider — mount ONCE at app root (app/_layout.tsx).
 *
 * Wraps better-auth's useSession() to expose the same status/user/
 * signOut/refresh API the rest of the app depends on, without coupling
 * callers to better-auth internals.
 */
export function AuthSessionProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const { data: session, isPending, refetch } = authClient.useSession();

  const rawUser = session?.user as Record<string, unknown> | undefined;
  const user = rawUser ? mapUser(rawUser) : null;
  const sessionToken = (session?.session as { token?: string } | undefined)?.token ?? null;
  const status = isPending ? 'loading' : deriveStatus(user);

  // Keep the synchronous token cache in sync with the session atom.
  useEffect(() => {
    cachedToken = sessionToken;
  }, [sessionToken]);

  // Wire the synchronous token getter exactly once.
  useEffect(() => {
    setAuthTokenGetter(() => cachedToken);
    return () => {
      setAuthTokenGetter(() => null);
    };
  }, []);

  // Wire the global 401 handler exactly once.
  useEffect(() => {
    setOnUnauthorizedCallback(() => {
      void authClient.signOut().finally(() => resetQueryCache());
    });
    return () => {
      setOnUnauthorizedCallback(null);
    };
  }, []);

  const signOut = useCallback<AuthSessionValue['signOut']>(async () => {
    try {
      await authClient.signOut();
    } catch {
      // swallow — local state clears via the session atom update
    }
    await resetQueryCache();
  }, []);

  const refresh = useCallback<AuthSessionValue['refresh']>(async () => {
    await refetch();
  }, [refetch]);

  const value = useMemo<AuthSessionValue>(
    () => ({ status, user, signOut, refresh }),
    [status, user, signOut, refresh],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSessionValue {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error(
      'useAuthSession must be used within an <AuthSessionProvider>. ' +
        'Wrap the app shell in app/_layout.tsx.',
    );
  }
  return ctx;
}
