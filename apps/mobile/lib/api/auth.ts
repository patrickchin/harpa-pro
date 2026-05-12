/**
 * Bearer-token getter for the API client. Pluggable so the auth session
 * (P2.4) can wire in `useAuthSession` without the client importing it
 * (avoids a circular dep between `lib/api/*` and `lib/auth/*`).
 *
 * Default: returns `null` (no Authorization header attached). Tests and
 * the auth session call `setAuthTokenGetter` to swap in a real source.
 *
 * Pure function ref — no React coupling.
 */

export type AuthTokenGetter = () =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>;

let getter: AuthTokenGetter = () => null;

export function setAuthTokenGetter(fn: AuthTokenGetter): void {
  getter = fn;
}

export function getAuthToken(): ReturnType<AuthTokenGetter> {
  return getter();
}

/** Test helper — restore the no-op default. */
export function resetAuthTokenGetter(): void {
  getter = () => null;
}
