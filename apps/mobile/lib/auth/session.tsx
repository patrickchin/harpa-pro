/**
 * Auth session: in-memory cache + bootstrap + sign-in / sign-out, plus
 * the React provider + hook the app shell consumes.
 *
 * Why this shape:
 *  - **Synchronous token getter**. The API client at
 *    `lib/api/client.ts` reads the bearer via a synchronous getter
 *    (`getAuthToken` from `lib/api/auth.ts`). The provider keeps the
 *    token in a module-level ref so the getter resolves without an
 *    async hop on every request.
 *  - **Bootstrap-gated**. Until bootstrap finishes, the getter returns
 *    `null` (the request goes out unauthenticated; if it gets a 401,
 *    the unauthorized handler ALSO does nothing pre-bootstrap). After
 *    bootstrap the getter returns the cached token (or `null` if the
 *    user isn't signed in). This avoids the race documented in the
 *    P2.4 security review §B / §I — a request that fires before
 *    bootstrap can never silently nuke a valid stored session.
 *  - **Single 401 path**. The provider registers
 *    `setOnUnauthorizedCallback` once. ANY 401 (query OR mutation)
 *    fires `signOutLocal()`, which clears state without trying to call
 *    the API back (the token's already invalid). The route guard in
 *    P2.6 redirects on `status === 'unauthenticated'`.
 *  - **No silent refresh**. Tokens are 7 days. If `/me` returns 401 on
 *    bootstrap we drop the session and stay unauthenticated. Re-OTP.
 *  - **Status, not booleans**. `'loading' | 'unauthenticated' |
 *    'authenticated' | 'needs-onboarding'` — callers branch on a
 *    discriminator instead of correlating two booleans (Pitfall 5:
 *    multi-step async flows with implicit ordering).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { request } from '../api/client';
import {
  setAuthTokenGetter,
  setOnUnauthorizedCallback,
} from '../api/auth';
import { ApiError } from '../api/errors';
import {
  readSession,
  writeSession,
  clearSession,
  writeLastPhone,
  type PersistedSession,
  type SessionUser,
} from './storage';

export type AuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'authenticated'
  | 'needs-onboarding';

export interface AuthSessionValue {
  status: AuthStatus;
  user: SessionUser | null;
  /**
   * Persist a fresh `(token, user)` pair after a successful OTP verify.
   * Side-effects: writes SecureStore, updates the in-memory cache so
   * the API client picks up the bearer, transitions status.
   */
  signIn: (input: { token: string; user: SessionUser; phone?: string }) => Promise<void>;
  /**
   * Best-effort POST /auth/logout, then clear local state. Always
   * resolves (does not throw on network failure).
   */
  signOut: () => Promise<void>;
  /** Re-fetch `/me` and merge the result into `user` / `status`. */
  refresh: () => Promise<void>;
}

const AuthSessionContext = createContext<AuthSessionValue | undefined>(undefined);

/** Module-level token cache so the synchronous API client getter can
 * resolve without React state. Mutated only via the provider's effects. */
let cachedToken: string | null = null;
let bootstrapDone = false;

/** Dev-only multi-mount guard. Security review §A: module-level state
 * (cachedToken, bootstrapDone) is shared across all instances. Mounting
 * this provider more than once will cause races. */
let mountCount = 0;

/**
 * Internal — used by the provider to register the synchronous token
 * getter exactly once. Exported only so tests can reset between cases.
 */
export function __resetSessionModule(): void {
  cachedToken = null;
  bootstrapDone = false;
  mountCount = 0;
}

function deriveStatus(user: SessionUser | null): AuthStatus {
  if (!user) return 'unauthenticated';
  if (user.displayName == null || user.companyName == null) {
    return 'needs-onboarding';
  }
  return 'authenticated';
}

/**
 * AuthSessionProvider — mount ONCE at app root.
 *
 * Security constraint (§A from P2.4 security review): module-level
 * state (`cachedToken`, `bootstrapDone`, `mountCount`) is shared across
 * all instances. Mounting this provider more than once will cause races.
 * The app shell design ensures a single mount; if refactoring moves the
 * provider, verify it stays singular.
 *
 * Bootstrap runs ONCE on mount with `[]` deps (§H from P2.4 security
 * review) — the effect closes over the initial `storage` and `api` props
 * from the first render and never re-runs. Callers MUST pass
 * referentially stable refs (e.g. module-level constants, not inline
 * literals) or the provider will ignore prop changes.
 */
interface ProviderProps {
  children: ReactNode;
  /** Test seam — inject a fake storage layer. Defaults to the real one.
   * MUST be referentially stable (module-level constant). */
  storage?: {
    readSession: typeof readSession;
    writeSession: typeof writeSession;
    clearSession: typeof clearSession;
    writeLastPhone: typeof writeLastPhone;
  };
  /** Test seam — inject a custom `/me` fetcher / logout caller.
   * MUST be referentially stable (module-level constant). */
  api?: {
    fetchMe: () => Promise<{ user: SessionUser }>;
    postLogout: () => Promise<void>;
  };
}

const defaultStorage = {
  readSession,
  writeSession,
  clearSession,
  writeLastPhone,
};

const defaultApi = {
  fetchMe: () => request('/me', 'get') as Promise<{ user: SessionUser }>,
  postLogout: async () => {
    await request('/auth/logout', 'post');
  },
};

export function AuthSessionProvider({
  children,
  storage = defaultStorage,
  api = defaultApi,
}: ProviderProps): React.JSX.Element {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);

  // Dev-only multi-mount assertion (§A from P2.4 security review).
  useEffect(() => {
    mountCount += 1;
    if (typeof __DEV__ !== 'undefined' && __DEV__ && mountCount > 1) {
      throw new Error('[auth] AuthSessionProvider mounted more than once. Mount only at the app root.');
    }
    return () => {
      mountCount -= 1;
    };
  }, []);

  // Wire the synchronous token getter + 401 callback exactly once,
  // before any data-fetching child can mount. Effect runs AFTER render
  // so the very first React Query call could in principle race —
  // but `cachedToken` starts as `null` and `bootstrapDone` as `false`,
  // so the API client just sends the request unauthenticated and the
  // 401 (if any) is suppressed by the pre-bootstrap guard. Once
  // bootstrap completes, the getter starts returning the real token.
  useEffect(() => {
    setAuthTokenGetter(() => cachedToken);
    setOnUnauthorizedCallback(() => {
      // Suppress 401s seen during bootstrap — those reflect either an
      // expired stored token (which the bootstrap routine will handle
      // explicitly) or a stale query that fired before we attached the
      // bearer. Once bootstrap is done, any 401 = real session loss.
      if (!bootstrapDone) return;
      // Drop local state immediately. We don't await the network
      // logout from here (it'd just 401 again). The route guard sees
      // status flip and pushes to /(auth)/login.
      cachedToken = null;
      setUser(null);
      setStatus('unauthenticated');
    });
    return () => {
      setOnUnauthorizedCallback(null);
    };
  }, []);

  // Bootstrap once on mount: read the stored session, verify it with
  // /me, settle status. Always sets status — never leaves it in
  // 'loading' (security review §H / §I).
  //
  // Deps: [] (§H from P2.4 security review). Bootstrap runs ONCE; the
  // effect closes over the initial `storage` and `api` props from the
  // render above and never re-runs. Callers must pass stable refs.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await storage.readSession();
        if (!stored) {
          if (!cancelled) {
            cachedToken = null;
            setUser(null);
            setStatus('unauthenticated');
          }
          return;
        }
        // Optimistically install the token so /me carries the bearer.
        cachedToken = stored.token;
        try {
          const fresh = await api.fetchMe();
          if (cancelled) return;
          // Merge: keep the stored token (still valid), adopt the
          // server's view of the user (may have changed since sign-in).
          await storage.writeSession({ token: stored.token, user: fresh.user });
          setUser(fresh.user);
          setStatus(deriveStatus(fresh.user));
        } catch (err) {
          if (cancelled) return;
          // §C from P2.4 security review: treat 404 as invalid session.
          // The API returns 404 when the user row is deleted. Drop
          // local state so the auth gate redirects to sign-in.
          if (err instanceof ApiError && (err.code === 'unauthorized' || err.code === 'not_found')) {
            // Token rejected — clean up and stay unauthenticated.
            await storage.clearSession();
            cachedToken = null;
            setUser(null);
            setStatus('unauthenticated');
            return;
          }
          // Network / server error: trust the stored user blob so the
          // app is usable offline. The next successful /me will reconcile.
          setUser(stored.user);
          setStatus(deriveStatus(stored.user));
        }
      } catch (err) {
        // Storage failure (e.g. SecureStore unavailable). Fail closed.
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[auth] bootstrap failed', err);
        cachedToken = null;
        setUser(null);
        setStatus('unauthenticated');
      } finally {
        // Mark bootstrap done LAST so any in-flight pre-bootstrap 401
        // doesn't tear down the session we just successfully restored.
        if (!cancelled) bootstrapDone = true;
      }
    })();
    return () => {
      cancelled = true;
    };
    // Deps: [] (§H from P2.4 security review). Bootstrap runs ONCE on
    // mount. The effect closes over the `storage` and `api` props from
    // the first render and never re-runs. If the parent passes unstable
    // props (inline object literals), the component re-renders but the
    // bootstrap effect doesn't re-fire.
  }, []);

  const signIn = useCallback<AuthSessionValue['signIn']>(
    async ({ token, user: nextUser, phone }) => {
      cachedToken = token;
      await storage.writeSession({ token, user: nextUser });
      if (phone) {
        try {
          await storage.writeLastPhone(phone);
        } catch {
          // UX hint only — never block sign-in on it.
        }
      }
      setUser(nextUser);
      setStatus(deriveStatus(nextUser));
    },
    [storage],
  );

  const signOut = useCallback<AuthSessionValue['signOut']>(async () => {
    // Best-effort server logout. Ignore errors: even if the request
    // fails we MUST still clear local state, otherwise we leak the
    // session into the next user (security review §D).
    //
    // SECURITY: in-memory clear is the source of truth because the API
    // enforces logout via the `auth.sessions` row — `POST /auth/logout`
    // deletes the row (`packages/api/src/auth/service.ts:logout`) and
    // the auth middleware rejects any token whose `sid` no longer
    // resolves to a row. A stale token surviving in SecureStore after a
    // failed `clearSession()` therefore returns 401 on the next launch
    // and the bootstrap path drops the session. Verified by
    // `packages/api/src/__tests__/auth.integration.test.ts` —
    // "logout deletes the session row".
    try {
      await api.postLogout();
    } catch {
      // swallow — local clear below is what matters
    }
    try {
      await storage.clearSession();
    } catch {
      // swallow — see SECURITY note above; the next bootstrap self-heals.
    }
    cachedToken = null;
    setUser(null);
    setStatus('unauthenticated');
  }, [api, storage]);

  const refresh = useCallback<AuthSessionValue['refresh']>(async () => {
    if (!cachedToken) return;
    try {
      const fresh = await api.fetchMe();
      await storage.writeSession({ token: cachedToken, user: fresh.user });
      setUser(fresh.user);
      setStatus(deriveStatus(fresh.user));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'unauthorized') {
        await storage.clearSession();
        cachedToken = null;
        setUser(null);
        setStatus('unauthenticated');
      }
      // Other errors are transient; keep current state.
    }
  }, [api, storage]);

  const value = useMemo<AuthSessionValue>(
    () => ({ status, user, signIn, signOut, refresh }),
    [status, user, signIn, signOut, refresh],
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
        'Wrap the app shell in app/_layout.tsx (P2.6).',
    );
  }
  return ctx;
}
