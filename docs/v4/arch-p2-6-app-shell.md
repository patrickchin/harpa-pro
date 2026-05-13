# P2.6 App Shell + Provider Tree + Auth Gate — Design

> **Status**: Design approved, ready for implementation.
>
> Designs the root provider tree, auth gate redirect logic, and initial
> tab/stack navigation shape for the `(app)` route group. Addresses or
> punts three security review carry-overs from P2.4.

## Design problem

P2.6 ships the foundational app shell that all subsequent screens mount
inside. This includes:

1. **Provider tree order** — wrapping layers (gesture handling, safe
   area, error boundary, React Query, auth session, dialogs, uploads,
   audio playback, telemetry) in an order that respects their
   dependencies and prevents re-mount races.
2. **Auth gate redirect logic** — three route groups (`(dev)`, `(auth)`,
   `(app)`) with distinct rules about who can mount what and where
   unauthenticated or needs-onboarding users get redirected.
3. **Tab + stack navigation** — the shape of the `(app)` group's bottom
   tabs (if any) and stack screens, matching the canonical port source
   at `../haru3-reports/apps/mobile` on branch `dev`.
4. **Security review follow-ups** — dispose of §A (multi-mount race),
   §C (deleted-account fallback), and §H (provider prop-stability) from
   the P2.4 post-impl review.

The canonical source has the full provider tree in
`../haru3-reports/apps/mobile/app/_layout.tsx` and a single Projects
tab in `app/(tabs)/_layout.tsx` with the tab bar hidden. We port that
structure to v4.

## Constraints (from pitfalls + hard rules)

- **No `setTimeout` in auth flows** (Pitfall 5). Redirects use
  `<Redirect>` or `router.replace` in a single async function.
- **No `Alert.alert`** (hard rule #9). Errors surface via
  `AppDialogSheet` or inline UI.
- **No EXPO_PUBLIC_ non-null assertions** (hard rule #6). Read env via
  `lib/env.ts` only.
- **GestureHandlerRootView OUTSIDE everything** (RN-Gesture rules).
- **SafeAreaProvider before any screen renders** (insets needed).
- **AppErrorBoundary inside SafeAreaProvider** (so a render error has
  insets to format the fallback UI).
- **QueryClientProvider before AuthSessionProvider** — the session's
  bootstrap calls `request('/me', 'get')` via the API client, but does
  NOT go through React Query (it's a direct fetch). However, the
  children of AuthSessionProvider (screens) DO use the generated React
  Query hooks, so QueryClientProvider must wrap those children. The
  cleanest order: QueryClient wraps Auth, which wraps the screens.
- **AuthSessionProvider at root with NO injected props** — mounting
  with default `storage` and `api` means the deps array `[storage,
  api]` is referentially stable (both are module-level constants).

## Provider tree order (top → bottom)

```tsx
<AppErrorBoundary>                    {/* class component, wraps all */}
  <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthSessionProvider>
          <StatusBar style="dark" />
          <DialogSheetProvider>
            <QueueProvider>              {/* stub */}
              <AudioPlaybackProvider>    {/* stub */}
                <SentryProvider>         {/* stub */}
                  <AuthNavigation />     {/* decides (auth) vs (app) */}
                </SentryProvider>
              </AudioPlaybackProvider>
            </QueueProvider>
          </DialogSheetProvider>
        </AuthSessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>
</AppErrorBoundary>
```

### Rationale for each layer

1. **AppErrorBoundary** (custom class component) — catches any uncaught
   React error and renders a fallback with a "Try Again" button.
   Positioned at the very top so it catches errors from all layers
   below. Styled with inline styles pulling `colors.background` /
   `colors.foreground` from the Tailwind config so it works even if
   NativeWind fails.

2. **GestureHandlerRootView** — RN-Gesture requirement: must wrap
   everything that uses gesture-handler primitives (swipes, pans).

3. **SafeAreaProvider** — makes `useSafeAreaInsets` available. Screens
   rely on this for padding (status bar, notch, home indicator). Sits
   before QueryClient so a query error's fallback UI can safely read
   insets.

4. **QueryClientProvider** — enables `useQuery` / `useMutation` hooks.
   Configured with sensible defaults:
   - `staleTime: 30_000` (30s) — re-mounting a screen renders cached
     data instantly while a background refetch revalidates.
   - `gcTime: 5 * 60_000` (5 min) — prevents discarding data on tab
     switches.
   - `refetchOnWindowFocus: false` — the mobile app doesn't have a
     "window focus" concept the same way web does; we rely on app-state
     transitions instead (wired in P3's per-screen `useFocusEffect`
     hooks).
   - `refetchOnReconnect: true` — auto-retry when the network comes
     back.
   - `retry: 1` — one automatic retry on query failure (not infinite).

5. **AuthSessionProvider** — mounts once, reads SecureStore, verifies
   the token with `/me`, settles `status` to `'loading'` →
   `'authenticated'` / `'needs-onboarding'` / `'unauthenticated'`.
   Children of this provider (everything below) can call
   `useAuthSession()` to branch on status. Sits below QueryClient
   because the screens (children) use React Query hooks.

6. **StatusBar** — `expo-status-bar` component, styled `"dark"` to
   match the app's light theme.

7. **DialogSheetProvider** — NEW. Hosts the single
   `<DialogSheetHost />` component at root and provides an imperative
   `showDialog()` / `closeDialog()` API via context. Screens call
   `useAppDialogSheet()` (updated from the P0 stub) to open themed
   dialogs. Positioned here so any screen (auth or app) can show a
   dialog.

8. **QueueProvider** — NO-OP STUB for P2.6. The upload queue lands in
   P3 (files + camera screens). This stub mounts a context with a dummy
   `enqueue` function that throws "not implemented" so the provider
   tree is set in stone now and P3 just swaps the stub for the real
   implementation.

9. **AudioPlaybackProvider** — NO-OP STUB for P2.6. Playback is needed
   for the Notes tab (P3.6), which plays voice notes. Stub mounts a
   context with a dummy `play` / `pause` / `stop` API.

10. **SentryProvider** — NO-OP STUB for P2.6. Telemetry hookup is
    post-MVP. For now, `initSentry()` is a no-op function called once,
    and the provider just renders `{children}`. This reserves the slot
    so we can drop in real Sentry setup later without changing the
    provider order.

11. **AuthNavigation** — CUSTOM COMPONENT. Reads `useAuthSession()` and
    decides which route group to render:
    - If `status === 'loading'`, show a full-screen activity spinner
      (no redirect — avoid flashes on cold start).
    - If `status === 'unauthenticated'`, ensure we're inside `(auth)`
      by redirecting to `/(auth)/sign-in/phone` if the current route
      is protected.
    - If `status === 'needs-onboarding'`, redirect to
      `/(auth)/onboarding` unless already there.
    - If `status === 'authenticated'`, ensure we're inside `(app)` by
      redirecting to `/(app)/projects` if the current route is public.

    This component wraps `<Stack />` (the expo-router root stack).

## Auth gate decision table

Three route groups:

### `(dev)` — dev gallery

- **Guard**: `__DEV__ || env.EXPO_PUBLIC_USE_FIXTURES`. If false,
  redirect to `/`.
- **Auth status**: ignored. Dev mirrors are pure UI with mock props; no
  API calls.
- Already implemented in P2.0b.

### `(auth)` — sign-in, sign-up, onboarding

- **If `status === 'authenticated'`**: redirect to `/(app)/projects`.
- **If `status === 'needs-onboarding'` AND route is NOT onboarding**:
  redirect to `/(auth)/onboarding`.
- **If `status === 'unauthenticated'` OR `status === 'needs-onboarding'`
  on the onboarding route**: allow mount (no redirect).
- **Decision function** (pseudo):

  ```ts
  function decideAuthRedirect(status: AuthStatus, pathname: string): string | null {
    if (status === 'authenticated') {
      return '/(app)/projects';
    }
    if (status === 'needs-onboarding' && !pathname.includes('/onboarding')) {
      return '/(auth)/onboarding';
    }
    // else: unauthenticated or on onboarding already — no redirect
    return null;
  }
  ```

  (This function is testable in isolation — ship as
  `lib/auth/auth-gate.ts` with a Vitest test.)

### `(app)` — authenticated screens (projects, generate, profile, etc.)

- **If `status === 'loading'`**: render a splash (activity indicator +
  logo), no redirect (avoid flash).
- **If `status === 'unauthenticated'`**: redirect to
  `/(auth)/sign-in/phone`.
- **If `status === 'needs-onboarding'`**: redirect to
  `/(auth)/onboarding`.
- **If `status === 'authenticated'`**: allow mount.
- **Decision function** (pseudo):

  ```ts
  function decideAppRedirect(status: AuthStatus): string | null {
    if (status === 'loading') {
      return null; // render splash in-place
    }
    if (status === 'unauthenticated') {
      return '/(auth)/sign-in/phone';
    }
    if (status === 'needs-onboarding') {
      return '/(auth)/onboarding';
    }
    // else: authenticated — no redirect
    return null;
  }
  ```

  Ship as `lib/auth/auth-gate.ts` alongside the auth redirect function
  above, tested together.

## Tab + stack shape for `(app)`

The canonical source (`../haru3-reports/apps/mobile/app/(tabs)/_layout.tsx`)
has:

- A single "Projects" tab with `tabBarStyle: { display: "none" }` —
  i.e. the tab bar is hidden.
- A double-back-press-to-exit Android handler.
- The `FolderOpen` Lucide icon.

For v4 P2.6, we replicate this exactly:

```
app/
  (app)/
    _layout.tsx         # auth gate + tab shell
    projects/
      index.tsx         # lands in P2.7
```

`app/(app)/_layout.tsx` structure:

```tsx
export default function AppLayout() {
  const { status } = useAuthSession();
  const router = useRouter();

  useEffect(() => {
    const target = decideAppRedirect(status);
    if (target) {
      router.replace(target);
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Render the tab shell. Tab bar is hidden per canonical.
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.muted.foreground,
        tabBarStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects',
          tabBarButtonTestID: 'tab-projects',
          tabBarIcon: ({ color, size }) => <FolderOpen size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

### Android back button handler

Port the double-back-press-to-exit logic from the canonical:

```tsx
const navigation = useNavigation();
const lastBackPress = useRef(0);

const handleBackPress = useCallback(() => {
  if (Platform.OS !== 'android') return false;
  if (navigation.canGoBack()) return false; // let default nav handle it
  // At root — require double-press to exit
  const now = Date.now();
  if (now - lastBackPress.current < 2000) {
    return false; // let the app close
  }
  lastBackPress.current = now;
  ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
  return true;
}, [navigation]);

useEffect(() => {
  const sub = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
  return () => sub.remove();
}, [handleBackPress]);
```

## DialogSheetProvider design

The existing `useAppDialogSheet` hook (P0 stub at
`lib/dialogs/useAppDialogSheet.ts`) returns a promise-based API:

```ts
export interface AppDialogApi {
  confirm(opts: AppDialogOptions): Promise<boolean>;
  alert(opts: AppDialogOptions): Promise<void>;
}
```

For P2.6, we implement this as:

1. **Provider**: `<DialogSheetProvider />` that mounts a
   `<DialogSheetHost />` (a single `AppDialogSheet` instance at root,
   controlled by module-level state).
2. **Context**: exports `showDialog` / `closeDialog` imperatively.
3. **Hook**: `useAppDialogSheet()` reads the context and returns the
   same API surface. `confirm` resolves `true` on confirm, `false` on
   cancel/dismiss. `alert` resolves on dismiss.

Implementation sketch:

```tsx
// lib/dialogs/DialogSheetProvider.tsx
import { createContext, useContext, useState, type ReactNode } from 'react';
import { AppDialogSheet, type AppDialogSheetProps } from '@/components/primitives/AppDialogSheet';

type DialogState = Omit<AppDialogSheetProps, 'visible' | 'onClose'> & {
  resolve: (value: boolean) => void;
};

const DialogContext = createContext<{
  showDialog: (state: Omit<DialogState, 'resolve'>) => Promise<boolean>;
  closeDialog: () => void;
} | null>(null);

export function DialogSheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);

  const showDialog = (input: Omit<DialogState, 'resolve'>): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ ...input, resolve });
    });
  };

  const closeDialog = () => {
    state?.resolve(false);
    setState(null);
  };

  const handleAction = (idx: number) => {
    const action = state?.actions[idx];
    if (action) {
      action.onPress();
      // If the action is a confirm-style button, resolve true; else false.
      // For simplicity, treat the first action as "confirm" and the rest as cancel.
      state?.resolve(idx === 0);
      setState(null);
    }
  };

  return (
    <DialogContext.Provider value={{ showDialog, closeDialog }}>
      {children}
      {state && (
        <AppDialogSheet
          visible={true}
          onClose={closeDialog}
          title={state.title}
          message={state.message}
          actions={state.actions.map((a, i) => ({
            ...a,
            onPress: () => handleAction(i),
          }))}
        />
      )}
    </DialogContext.Provider>
  );
}

export function useAppDialogSheet() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useAppDialogSheet must be inside DialogSheetProvider');

  return {
    async confirm(opts: AppDialogOptions): Promise<boolean> {
      return ctx.showDialog({
        title: opts.title,
        message: opts.message,
        actions: [
          { label: opts.confirmLabel ?? 'Confirm', onPress: () => {} },
          { label: opts.cancelLabel ?? 'Cancel', onPress: () => {}, variant: 'ghost' },
        ],
      });
    },
    async alert(opts: AppDialogOptions): Promise<void> {
      await ctx.showDialog({
        title: opts.title,
        message: opts.message,
        actions: [{ label: 'OK', onPress: () => {} }],
      });
    },
  };
}
```

(This is a sketch — the real implementation will refine the action
variant mapping and possibly add a `noticeTone` param.)

## Stub provider implementations

### QueueProvider (stub)

```tsx
// lib/uploads/QueueProvider.tsx
import { createContext, useContext, type ReactNode } from 'react';

export interface QueueContextValue {
  enqueue: (item: unknown) => void;
}

const QueueContext = createContext<QueueContextValue | null>(null);

export function QueueProvider({ children }: { children: ReactNode }) {
  const enqueue = () => {
    throw new Error('QueueProvider is a stub — upload queue lands in P3');
  };
  return <QueueContext.Provider value={{ enqueue }}>{children}</QueueContext.Provider>;
}

export function useUploadQueue() {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error('useUploadQueue must be inside QueueProvider');
  return ctx;
}
```

### AudioPlaybackProvider (stub)

```tsx
// lib/audio/AudioPlaybackProvider.tsx
import { createContext, useContext, type ReactNode } from 'react';

export interface AudioPlaybackContextValue {
  play: (storagePath: string) => Promise<void>;
  pause: () => void;
  stop: () => void;
}

const AudioPlaybackContext = createContext<AudioPlaybackContextValue | null>(null);

export function AudioPlaybackProvider({ children }: { children: ReactNode }) {
  const play = async () => {
    throw new Error('AudioPlaybackProvider is a stub — playback lands in P3');
  };
  const pause = () => {};
  const stop = () => {};
  return (
    <AudioPlaybackContext.Provider value={{ play, pause, stop }}>
      {children}
    </AudioPlaybackContext.Provider>
  );
}

export function useAudioPlayback() {
  const ctx = useContext(AudioPlaybackContext);
  if (!ctx) throw new Error('useAudioPlayback must be inside AudioPlaybackProvider');
  return ctx;
}
```

### SentryProvider (stub)

```tsx
// lib/telemetry/SentryStub.tsx
import { type ReactNode } from 'react';

export function initSentry() {
  // No-op for P2.6. Real Sentry setup post-MVP.
}

export function SentryProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
```

## Security review carry-overs: §A, §C, §H

### §A — Multi-mount race

**Concern**: If AuthSessionProvider is mounted twice (e.g. dev tooling
double-mount from StrictMode, or if `(auth)` and `(app)` route groups
each get their own provider), two bootstrap effects race and could
overwrite the module-level `cachedToken` / `bootstrapDone` state.

**Analysis**: The current implementation (P2.4) mounts
AuthSessionProvider ONCE at the root (`app/_layout.tsx`), and all route
groups are descendants. StrictMode is disabled in React Native
production builds. Fast refresh does not trigger a full unmount/remount
of the root provider (Metro preserves module state across refreshes).

**Risk level**: Low in the single-provider-at-root design. The only way
to trigger a race is if the developer manually mounts two
`<AuthSessionProvider>` components in the tree, which would be a code
error not a framework bug.

**Decision for P2.6**: **PUNT to P4 with a carve-out**. The design
already enforces a single mount at root. Document the constraint in a
JSDoc comment on `AuthSessionProvider`:

```tsx
/**
 * AuthSessionProvider — mount ONCE at app root.
 *
 * Security constraint: module-level state (`cachedToken`,
 * `bootstrapDone`) is shared across all instances. Mounting this
 * provider more than once will cause races. The app shell design
 * ensures a single mount; if refactoring moves the provider,
 * verify it stays singular.
 */
```

Add a follow-up TODO in `docs/v4/plan-p4-e2e-polish.md` to either:
  (a) add a dev-only mount-count assertion that throws if
      `AuthSessionProvider` mounts a second time, OR
  (b) refactor to instance-level state (a `useRef` inside the provider
      instead of module-level `let`).

Rationale: the single-mount design is sound; adding a runtime guard or
refactoring state is polish, not P2.6 blocking.

### §C — Deleted-account fallback

**Concern**: If the API returns 200 from `/me` but the user object
indicates the account is soft-deleted (e.g. a `deletedAt` field is
set), the current bootstrap flow treats it as authenticated.

**Analysis**: Check the API contract for `/me`. If the API spec says:
  - **401 for deleted accounts** → we're fine; the bootstrap flow drops
    the session on 401.
  - **200 with a `deletedAt` field** → we need to add a check.

**Decision for P2.6**: **ADDRESS if the contract needs it, PUNT
otherwise**.

ACTION: Read `packages/api-contract` to see if `/me` includes a
`deletedAt` field or if deleted accounts are just 401. If 401,
document the decision in this design doc and close §C. If 200 with
`deletedAt`, add a check:

```ts
const fresh = await api.fetchMe();
if (cancelled) return;
if (fresh.user.deletedAt) {
  // Treat as 401 — drop the session
  await storage.clearSession();
  cachedToken = null;
  setUser(null);
  setStatus('unauthenticated');
  return;
}
```

I'll verify the contract during implementation. For the design, assume
the API 401s deleted accounts (the simpler path).

### §H — Provider prop-stability

**Concern**: The `AuthSessionProvider` accepts optional `storage` and
`api` props for test injection. If a parent re-renders and passes NEW
object literals for those props, the bootstrap useEffect re-fires
(deps: `[storage, api]`).

**Analysis**: The current code uses `[storage, api]` as deps on the
bootstrap effect. Mounting at root with NO injected props means both
default to `defaultStorage` and `defaultApi`, which are module-level
constants — referentially stable.

**Risk**: Only surfaces if a parent wrapper passes inline object
literals:

```tsx
<AuthSessionProvider storage={{ readSession: ... }} />
```

This would re-run bootstrap on every render.

**Decision for P2.6**: **ADDRESS with a tighter dep array**.

The bootstrap effect does NOT actually read `storage` or `api` inside
its closure — it reads them via the props destructure at the top of the
component, which captures them once per render. The effect only needs
to run ONCE on mount. Change the deps to `[]` and document the
stability requirement:

```tsx
/**
 * ProviderProps — test injection seams.
 *
 * STABILITY REQUIREMENT: if you pass `storage` or `api` props, they
 * MUST be referentially stable (e.g. a module-level constant, not an
 * inline object literal) to avoid re-running bootstrap on every
 * render.
 */
interface ProviderProps {
  children: ReactNode;
  storage?: typeof defaultStorage;
  api?: typeof defaultApi;
}

// Inside AuthSessionProvider:
useEffect(() => {
  // Bootstrap runs ONCE on mount. The `storage` and `api` values are
  // captured from the component's props at render time (before this
  // effect runs), so we don't need them in the dep array. If the
  // parent passes unstable props (e.g. inline object literals), the
  // component will re-render but the bootstrap effect won't re-run.
  let cancelled = false;
  (async () => {
    // ... bootstrap logic using `storage` and `api` from the outer scope
  })();
  return () => { cancelled = true; };
}, []); // <-- empty deps, runs once
```

Rationale: the bootstrap effect should never re-run mid-session — it's
a mount-time initialization. Tightening to `[]` removes the risk
entirely.

## Root index redirect

The root `app/index.tsx` currently renders a placeholder. For P2.6,
redirect to `/(app)` so the root URL routes through the auth gate:

```tsx
// app/index.tsx
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/(app)/projects" />;
}
```

The auth gate inside `(app)/_layout.tsx` will bounce unauthenticated
users to `/(auth)/sign-in/phone`.

## Files to ship in P2.6

### New files

1. **`docs/v4/arch-p2-6-app-shell.md`** — this design doc.
2. **`apps/mobile/app/(app)/_layout.tsx`** — auth gate + tab shell.
3. **`apps/mobile/app/(app)/projects/index.tsx`** — placeholder for P2.7
   (a simple "Projects" text + a View, like the current `app/index.tsx`).
4. **`apps/mobile/lib/auth/auth-gate.ts`** — decision functions
   `decideAuthRedirect` + `decideAppRedirect`, pure, testable.
5. **`apps/mobile/lib/auth/auth-gate.test.ts`** — Vitest tests for both
   decision functions.
6. **`apps/mobile/lib/dialogs/DialogSheetProvider.tsx`** — host + context.
7. **`apps/mobile/lib/uploads/QueueProvider.tsx`** — no-op stub.
8. **`apps/mobile/lib/audio/AudioPlaybackProvider.tsx`** — no-op stub.
9. **`apps/mobile/lib/telemetry/SentryStub.tsx`** — no-op `initSentry` +
   stub provider.

### Updated files

1. **`apps/mobile/app/_layout.tsx`** — rewrite with the full provider tree.
2. **`apps/mobile/app/(auth)/_layout.tsx`** — add auth-redirect logic
   (currently just a Stack with no guards).
3. **`apps/mobile/app/index.tsx`** — change from placeholder to
   `<Redirect href="/(app)/projects" />`.
4. **`apps/mobile/lib/auth/session.tsx`** — tighten bootstrap deps to
   `[]`, add JSDoc on ProviderProps, add JSDoc on AuthSessionProvider
   warning about single-mount constraint.
5. **`apps/mobile/lib/dialogs/useAppDialogSheet.ts`** — replace stub
   with real implementation that reads DialogContext.
6. **`docs/v4/arch-mobile.md`** — update "App shell" section with the
   provider tree order.

### Tests

1. **`apps/mobile/lib/auth/auth-gate.test.ts`** — decision function tests:
   - `decideAuthRedirect('authenticated', '/(auth)/sign-in/phone')` →
     `'/(app)/projects'`
   - `decideAuthRedirect('needs-onboarding', '/(auth)/sign-in/phone')` →
     `'/(auth)/onboarding'`
   - `decideAuthRedirect('needs-onboarding', '/(auth)/onboarding')` →
     `null`
   - `decideAuthRedirect('unauthenticated', '/(auth)/sign-in/phone')` →
     `null`
   - `decideAppRedirect('loading')` → `null`
   - `decideAppRedirect('unauthenticated')` → `'/(auth)/sign-in/phone'`
   - `decideAppRedirect('needs-onboarding')` → `'/(auth)/onboarding'`
   - `decideAppRedirect('authenticated')` → `null`

2. **`apps/mobile/lib/dialogs/DialogSheetProvider.test.tsx`** — snapshot
   test for the provider, plus a behaviour test:
   - `confirm` resolves `true` on first action press, `false` on second
     action press.
   - `alert` resolves on dismiss.

3. **`apps/mobile/lib/uploads/QueueProvider.test.tsx`** — snapshot test
   + assert `enqueue()` throws.

4. **`apps/mobile/lib/audio/AudioPlaybackProvider.test.tsx`** — snapshot
   test + assert `play()` rejects.

5. **`apps/mobile/lib/telemetry/SentryStub.test.tsx`** — snapshot test
   + assert `initSentry()` is a no-op.

## Test plan summary

- **Auth gate decision tests**: pure functions, 8 test cases.
- **DialogSheetProvider tests**: snapshot + confirm/alert behaviour.
- **Stub provider tests**: snapshot + throw/reject assertions.
- **Manual verification**: boot the app in `:mock` mode, verify:
  - Unauthenticated start → sign-in screen.
  - After sign-in → onboarding if `displayName == null`, else projects.
  - Android back button at projects root requires double-press to exit.
  - Dev gallery (`/(dev)`) still accessible via direct nav in dev mode.

## Pitfalls addressed

- **Pitfall 5 (auth glue done late)**: Bootstrap is a single async flow
  with no `setTimeout` chains. Redirects use `<Redirect>` / `router.replace`.
- **Pitfall 12 (`Alert.alert`)**: `DialogSheetProvider` replaces the
  stub; screens use `useAppDialogSheet()` exclusively.
- **No EXPO_PUBLIC_ non-null assertions**: All env reads via `lib/env.ts`.

## Risk + carve-out summary

| Item | Decision | Rationale |
|------|----------|-----------|
| §A multi-mount race | PUNT to P4 with JSDoc + TODO | Single-mount design is sound; runtime guard is polish. |
| §C deleted-account fallback | ADDRESS if API contract needs it, else close | Check `/me` spec during implementation; assume 401 for now. |
| §H provider prop-stability | ADDRESS (tighten deps to `[]`) | Bootstrap should never re-run; empty deps removes all risk. |
| Upload queue | Stub now, real in P3 | Provider tree order locked; swapping the stub is a no-op refactor. |
| Audio playback | Stub now, real in P3 | Same as upload queue. |
| Sentry | Stub now, real post-MVP | Reserves the slot; no-op for P2.6. |

## Implementation checklist (one item ≈ one commit)

1. **Design doc** (this file) — lands first, no code.
   - Commit: `docs(mobile): P2.6 app shell design — provider tree + auth gate`.

2. **Auth gate decision functions** — pure, testable.
   - File: `lib/auth/auth-gate.ts` + `.test.ts`.
   - Commit: `feat(mobile): auth gate decision logic with tests`.

3. **DialogSheetProvider** — real implementation.
   - Files: `lib/dialogs/DialogSheetProvider.tsx` + `.test.tsx`,
     update `lib/dialogs/useAppDialogSheet.ts`.
   - Commit: `feat(mobile): DialogSheetProvider with imperative API`.

4. **Stub providers** — queue, audio, sentry.
   - Files: `lib/uploads/QueueProvider.tsx` + `.test.tsx`,
     `lib/audio/AudioPlaybackProvider.tsx` + `.test.tsx`,
     `lib/telemetry/SentryStub.tsx` + `.test.tsx`.
   - Commit: `feat(mobile): stub providers (queue, audio, sentry)`.

5. **Root layout rewrite** — full provider tree.
   - File: `app/_layout.tsx` (rewrite).
   - Commit: `feat(mobile): root provider tree with error boundary + query + auth + dialogs + stubs`.

6. **Auth gate in `(auth)/_layout.tsx`** — redirect logic.
   - File: `app/(auth)/_layout.tsx` (update).
   - Commit: `feat(mobile): auth group redirect (authenticated → app, needs-onboarding → onboarding)`.

7. **App shell + tab layout** — `(app)/_layout.tsx` + placeholder projects index.
   - Files: `app/(app)/_layout.tsx` (new), `app/(app)/projects/index.tsx` (new).
   - Commit: `feat(mobile): (app) shell with tab nav + auth gate + projects placeholder`.

8. **Root index redirect** — route through auth gate.
   - File: `app/index.tsx` (update to `<Redirect>`).
   - Commit: `feat(mobile): redirect root to (app) via auth gate`.

9. **Tighten AuthSessionProvider deps + JSDoc** — address §H, document §A.
   - File: `lib/auth/session.tsx` (update bootstrap deps to `[]`, add JSDoc).
   - Commit: `fix(mobile): tighten auth bootstrap deps + document single-mount constraint`.

10. **Update arch-mobile.md** — document the provider tree.
    - File: `docs/v4/arch-mobile.md` (update "App shell" section).
    - Commit: `docs(mobile): update arch-mobile with P2.6 provider tree`.

11. **Manual verification** — boot in `:mock` mode, test all routes.
    - No commit — verification only.

## Open questions / deferred

- **§C deleted-account check**: deferred to implementation — read API
  contract first.
- **§A mount-count guard**: deferred to P4 as a polish task.
- **Tab bar visibility**: the canonical hides the tab bar; we replicate
  that. If we add more tabs in P3/P4, decide then whether to show it.
- **Deep-link intent stashing**: the auth gate redirects unauthenticated
  users away from protected routes, but does NOT yet stash the
  originally requested URL for post-login replay. That lands in P4
  (deep-linking polish). For P2.6, all unauthenticated users land at
  `/(auth)/sign-in/phone` and all authenticated users land at
  `/(app)/projects`.

---

**Design approved for implementation. Worker subagent: follow the
checklist commit-by-commit.**
