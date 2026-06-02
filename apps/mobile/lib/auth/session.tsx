/**
 * Auth session — thin wrapper around `authClient.useSession()` from
 * better-auth/react.
 *
 * Why a wrapper rather than direct `authClient.useSession()` calls in
 * components:
 *  - We want a single source of truth for the `status` discriminator
 *    (`'loading' | 'unauthenticated' | 'authenticated' | 'needs-onboarding'`).
 *    Callers branch on the discriminator rather than correlating
 *    multiple booleans (Pitfall 5: implicit ordering).
 *  - The legacy API (`signIn`, `signOut`, `refresh`) is preserved so
 *    callers don't all have to change at once.
 *  - We bridge better-auth's cookie storage (managed by `expoClient`)
 *    into the existing synchronous bearer getter used by
 *    `lib/api/client.ts`. Better-auth's expoClient stores the session
 *    cookie in SecureStore as a JSON blob; we extract just the
 *    `session_token` value and pass it as `Authorization: Bearer …`.
 *    The server side accepts both bearer and cookie auth, but bearer
 *    is what every existing route + test was wired against.
 *
 * Persistence is owned entirely by `expoClient` — no SecureStore
 * reads/writes here.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';

import {
  setAuthTokenGetter,
  setOnUnauthorizedCallback,
} from '../api/auth';
import { resetQueryCache } from '../api/query-client';
import { authClient, type SessionUser } from './client';

export type AuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'authenticated'
  | 'needs-onboarding';

export interface AuthSessionValue {
  status: AuthStatus;
  user: SessionUser | null;
  /**
   * Refresh the session from `/api/auth/get-session`. Used by screens
   * that just patched `/me` and need the new displayName/companyName
   * to land in the cached session. No-op when not signed in.
   */
  refresh: () => Promise<void>;
  /**
   * Re-export of `signOut` so existing callers keep working.
   * `expoClient` clears SecureStore + the in-memory cache; we then
   * wipe the React Query cache.
   */
  signOut: () => Promise<void>;
  /**
   * Compatibility shim: the new email-OTP screens call
   * `authClient.signIn.emailOtp()` directly, but we keep `signIn`
   * here as a no-op `await refresh()` so legacy call sites keep
   * compiling. After a successful OTP, expoClient has already
   * persisted the cookie; refreshing pulls the user object into
   * `useSession()`.
   */
  signIn: (input?: { email?: string }) => Promise<void>;
}

const AuthSessionContext = createContext<AuthSessionValue | undefined>(undefined);

/**
 * Re-export the user type so consumers can `import { SessionUser }
 * from '@/lib/auth'`.
 */
export type { SessionUser } from './client';

/**
 * Best-effort token getter. Reads the cookie from `authClient.getCookie()`
 * (sync — backed by SecureStore.getItem), splits it, and returns the
 * `*.session_token` value.
 *
 * Returns `null` when no cookie is stored. Errors are swallowed —
 * fail-closed so an authenticated request just goes out unauthenticated
 * and gets a 401, which the unauthorized callback handles.
 */
function readBearerToken(): string | null {
  try {
    const cookie = authClient.getCookie();
    if (!cookie) return null;
    // Cookie format: `name1=value1; name2=value2`. The session token
    // cookie name ends in `.session_token` (better-auth's convention).
    for (const part of cookie.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (!name) continue;
      if (name.endsWith('session_token')) {
        return rest.join('=') || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

interface ProviderProps {
  children: ReactNode;
}

export function AuthSessionProvider({ children }: ProviderProps): React.JSX.Element {
  const { data, isPending, refetch } = authClient.useSession();

  const user = (data?.user ?? null) as SessionUser | null;
  const status: AuthStatus = isPending
    ? 'loading'
    : !user
      ? 'unauthenticated'
      : user.displayName == null || user.companyName == null
        ? 'needs-onboarding'
        : 'authenticated';

  // Wire the synchronous bearer getter into `lib/api/client.ts`. This
  // runs on every mount of the provider; setting the getter is
  // idempotent (it overwrites the previous reference).
  useEffect(() => {
    setAuthTokenGetter(readBearerToken);
    return () => {
      setAuthTokenGetter(() => null);
    };
  }, []);

  // Wire the 401 → sign-out callback. Any unauthenticated response
  // from the API drops the local session via `authClient.signOut()`
  // (which clears expoClient's cookie storage) and resets the React
  // Query cache. The route guards then push the user to sign-in.
  useEffect(() => {
    setOnUnauthorizedCallback(() => {
      void (async () => {
        try {
          await authClient.signOut();
        } catch {
          // expoClient still wipes its own cookie state on the next
          // get-session call; swallow.
        }
        try {
          await resetQueryCache();
        } catch {
          // Cache reset failure is best-effort.
        }
      })();
    });
    return () => {
      setOnUnauthorizedCallback(null);
    };
  }, []);

  const refresh = useCallback<AuthSessionValue['refresh']>(async () => {
    await refetch();
  }, [refetch]);

  const signOut = useCallback<AuthSessionValue['signOut']>(async () => {
    try {
      await authClient.signOut();
    } catch {
      // Best-effort: even if the server call fails, expoClient still
      // clears the cookie locally. Swallow so the UI can complete the
      // sign-out flow.
    }
    try {
      await resetQueryCache();
    } catch {
      // Cache reset failure is best-effort.
    }
    await refetch();
  }, [refetch]);

  const signIn = useCallback<AuthSessionValue['signIn']>(async () => {
    // Compatibility shim — the actual sign-in side effect (cookie
    // persistence) is handled by `authClient.signIn.emailOtp()` inside
    // the email-code screen. Here we just refetch the session so the
    // hook picks up the new user immediately.
    await refetch();
  }, [refetch]);

  const value = useMemo<AuthSessionValue>(
    () => ({ status, user, refresh, signOut, signIn }),
    [status, user, refresh, signOut, signIn],
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
