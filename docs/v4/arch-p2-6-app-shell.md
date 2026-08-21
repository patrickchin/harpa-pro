# App shell and provider tree

> **Status: implemented.** This document describes the current shell.
> It supersedes the original P2.6 design, which used a hidden Projects
> tab and placeholder upload and audio providers.

## Responsibilities

The shell owns five boundaries:

1. It mounts process-wide providers once.
2. It waits for Better Auth before it restores user data.
3. It redirects users between authentication and protected routes.
4. It uses a Stack for protected navigation.
5. It clears user-scoped caches and uploads when a session ends.

## Root provider order

`apps/mobile/app/_layout.tsx` mounts this order:

```text
AppErrorBoundary
  GestureHandlerRootView
    SafeAreaProvider
      AuthSessionProvider
        StatusBar
        SessionQueryProvider
          DialogSheetProvider
            QueueProvider
              AudioPlaybackProvider
                SentryProvider
                  Slot
```

The order is significant:

- `AuthSessionProvider` resolves the user before any persisted query
  cache becomes reachable.
- `SessionQueryProvider` creates one `QueryClient` per user identity.
- `QueueProvider` can scope persisted upload jobs to that user.
- Dialog, upload, and audio consumers can use TanStack Query.
- `AppErrorBoundary` catches errors from every lower layer.

`initSentry()` runs when the root layout module loads. The provider
adds the React integration after the rest of the application boundary
is available.

## Authentication state

`AuthSessionProvider` maps Better Auth into one discriminator:

```text
loading
unauthenticated
needs-onboarding
authenticated
```

The state comes from `authClient.useSession()`. A user with no
`displayName` has `needs-onboarding` status. Better Auth and
`@better-auth/expo` own cookie persistence in SecureStore.

The provider also installs two API client callbacks:

- A token getter extracts the Better Auth session token from the
  stored cookie.
- A 401 callback clears the upload queue, signs out, and resets query
  caches.

Explicit sign-out follows the same local cleanup path. Network failure
does not prevent the local session boundary from closing.

## Route gates

The authentication group uses
`apps/mobile/app/(auth)/_layout.tsx`:

| Status             | Result                                 |
| ------------------ | -------------------------------------- |
| `loading`          | Keep the authentication Stack mounted. |
| `unauthenticated`  | Permit email and code routes.          |
| `needs-onboarding` | Redirect to `/(auth)/onboarding`.      |
| `authenticated`    | Redirect to `/(app)/projects`.         |

The protected group uses `apps/mobile/app/(app)/_layout.tsx`:

| Status             | Result                               |
| ------------------ | ------------------------------------ |
| `loading`          | Show a centered activity indicator.  |
| `unauthenticated`  | Redirect to `/(auth)/sign-in/email`. |
| `needs-onboarding` | Redirect to `/(auth)/onboarding`.    |
| `authenticated`    | Render the protected Stack.          |

All hooks run before a conditional return. This prevents a hook-order
failure when the auth state changes during a render.

## Protected Stack

The protected group renders a headerless `Stack`. Each screen renders
its own `ScreenHeader`. There is no tab navigator.

Top-level routes include Projects, Profile, Account, Usage, and
Developer. Nested project routes provide project settings, members,
reports, report generation, notes, review, and debugging. Short-link
resolver routes live under `/p/{project}` and `/r/{report}`.

`AppHeaderActions` provides Projects and Profile shortcuts in screen
headers. It does not create a navigation tab bar.

## Camera route

`apps/mobile/app/(camera)/_layout.tsx` owns a separate full-screen
modal Stack. It uses portrait orientation and a slide-up animation.
The capture route returns through the camera session registry. It
uses a saved return URL if the original Stack no longer exists.

## Back behavior

Protected Android routes install a double-back-to-exit handler. The
handler calls `router.canGoBack()`. Nested screens keep normal back
behavior; the root Projects screen requires two back presses within
two seconds.

Use these helpers for explicit controls:

- `safeBack(router, fallback)` returns through history or replaces
  with a known route after a cold deep link.
- `dismissOrReplaceTo(router, href)` dismisses to an existing parent
  after destructive mutations. It replaces only when that parent is
  not in the Stack.

See [`arch-mobile-navigation.md`](arch-mobile-navigation.md) for the
full policy.

## Session-scoped query cache

`SessionQueryProvider` withholds descendants until auth has a stable
user ID or a stable anonymous state. It then mounts a fresh
`QueryClient`.

Authenticated clients restore an MMKV snapshot from a user-specific
key. An identity change replaces the client before descendants can
render. A delayed restore from the old identity can only update an
unreachable client.

Sign-out, a 401 response, or an anonymous resolution clears persisted
query snapshots. The upload provider also replaces and clears its
queue on an identity change.

## Developer surface policy

The shell exposes mobile developer surfaces only when the shared
`SHOW_DEVELOPER_TOOLS` policy is true: either `__DEV__` or
`EXPO_PUBLIC_USE_FIXTURES`. Profile therefore omits its Developer row in an
ordinary production bundle. Saved-report Report Debug and the Generate Debug
tab use the same policy, and the direct developer routes redirect without
starting their read queries when hidden.

Route components call all hooks before evaluating the redirect so a policy
transition cannot change hook order. The gate is defense in depth for mobile
navigation, not a new API authorization boundary; the authenticated AI
settings and member-readable report diagnostics contracts are unchanged. See
[`design-mobile-developer-tools-gate.md`](design-mobile-developer-tools-gate.md).

## Verification

Focused tests cover the shell boundary:

- `apps/mobile/app/_layout.test.tsx`
- `apps/mobile/lib/auth/auth-gate.test.ts`
- `apps/mobile/lib/auth/session.test.tsx`
- `apps/mobile/lib/api/session-query-provider.test.tsx`
- `apps/mobile/lib/api/session-query-provider-race.test.tsx`
- `apps/mobile/lib/uploads/session-boundary.ts`

Run the mobile unit tests, type check, lint, and bundle smoke before a
shell change merges.
