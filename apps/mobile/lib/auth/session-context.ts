import { createContext, useContext } from 'react';

import type { SessionUser } from './client';

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

export const AuthSessionContext = createContext<AuthSessionValue | undefined>(
  undefined,
);

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

export function useOptionalAuthSession(): AuthSessionValue | undefined {
  return useContext(AuthSessionContext);
}
