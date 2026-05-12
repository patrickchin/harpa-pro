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

/**
 * Global "unauthorized" notifier. The API client (`client.ts`) invokes
 * this whenever a request returns HTTP 401 — regardless of whether it
 * came from a query or a mutation. The auth session (P2.4) registers a
 * callback that performs `signOut()` + redirect, so a single 401 path
 * tears the session down everywhere.
 *
 * Synchronous fire-and-forget. The client still throws an
 * `ApiError({ code: 'unauthorized' })` so the calling hook can render
 * an error UI if it needs to.
 */
export type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

export function setOnUnauthorizedCallback(fn: UnauthorizedHandler | null): void {
  onUnauthorized = fn;
}

export function notifyUnauthorized(): void {
  try {
    onUnauthorized?.();
  } catch {
    // Never let a buggy handler mask the original 401.
  }
}

/** Test helper. */
export function resetOnUnauthorizedCallback(): void {
  onUnauthorized = null;
}
