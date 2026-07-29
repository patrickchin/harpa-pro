# P2.6 App Shell + Provider Tree + Auth Gate — Design

> **Status**: Design approved, ready for implementation.
>
> Designs the root provider tree, auth gate redirect logic, and initial
> tab/stack navigation shape for the `(app)` route group. Addresses or
> punts three security review carry-overs from P2.4.

## Scope

P2.6 ships the foundational shell every later screen mounts inside:
the provider tree, the auth gate, and the navigation shape. The
provider tree includes gesture, safe area, error boundary, React
Query, auth, dialogs, uploads, audio, and telemetry. The auth gate
redirects between the `(auth)` and `(app)` route groups. The `(app)`
group has one hidden Projects tab. P2.6 also disposes of §A
(multi-mount race), §C (deleted-account fallback), and §H
(provider prop-stability) from the P2.4 security review.

## Constraints (pitfalls + hard rules)

- **No `setTimeout` in auth flows** ([Pitfall 5](pitfalls.md)). Redirects use `<Redirect>` or `router.replace` in a single async function.
- **No `Alert.alert`** (hard rule #9) — use `AppDialogSheet` or inline UI.
- **No `EXPO_PUBLIC_*!`** (hard rule #6) — env via `lib/env.ts`.
- **GestureHandlerRootView outermost**, **SafeAreaProvider before any screen renders**, **AppErrorBoundary inside SafeAreaProvider** (so a render error has insets).
- **QueryClientProvider before AuthSessionProvider** — the bootstrap calls `request('/me', 'get')` directly (not via React Query), but children below use the generated query hooks.
- **AuthSessionProvider mounted at root with no injected props** — keeps default `storage`/`api` referentially stable.

## Provider tree (top → bottom)

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

| Layer | Role |
|---|---|
| `AppErrorBoundary` | Class component; renders fallback UI with inline styles pulling `colors.background`/`foreground` from Tailwind config so it works even if NativeWind fails. |
| `GestureHandlerRootView` | RN-Gesture requirement, must wrap everything using gesture primitives. |
| `SafeAreaProvider` | Provides `useSafeAreaInsets`. Sits before QueryClient so a query-error fallback can still read insets. |
| `QueryClientProvider` | Defaults: `staleTime: 30_000`, `gcTime: 5 * 60_000`, `refetchOnWindowFocus: false`, `refetchOnReconnect: true`, `retry: 1`. App-state-driven refetch wired in P3 via per-screen `useFocusEffect`. |
| `AuthSessionProvider` | Mounts once, reads SecureStore, calls `/me`, settles `status` to `loading` → `authenticated`/`needs-onboarding`/`unauthenticated`. Children call `useAuthSession()`. |
| `StatusBar` | `expo-status-bar` styled `"dark"` for the light theme. |
| `DialogSheetProvider` | Hosts `<DialogSheetHost />` at root with imperative `showDialog`/`closeDialog` context. |
| `QueueProvider` | **Stub.** Real upload queue lands in P3; stub `enqueue` throws. Locks provider order. |
| `AudioPlaybackProvider` | **Stub.** Real playback in P3 (Notes tab voice playback). |
| `SentryProvider` | **Stub.** `initSentry()` is a no-op; reserves the slot for post-MVP telemetry. |
| `AuthNavigation` | Reads `useAuthSession()` and selects route group: `loading` → spinner; `unauthenticated` → ensure inside `(auth)`; `needs-onboarding` → `/(auth)/onboarding`; `authenticated` → ensure inside `(app)`. Wraps `<Stack />`. |

## Auth gate decision functions

Pure, testable, ship as `lib/auth/auth-gate.ts` + Vitest.

### `(auth)` group

```ts
function decideAuthRedirect(status: AuthStatus, pathname: string): string | null {
  if (status === 'authenticated') {
    return '/(app)/projects';
  }
  if (status === 'needs-onboarding' && !pathname.includes('/onboarding')) {
    return '/(auth)/onboarding';
  }
  // unauthenticated, or on onboarding already
  return null;
}
```

### `(app)` group

```ts
function decideAppRedirect(status: AuthStatus): string | null {
  if (status === 'loading') {
    return null; // render splash in-place
  }
  if (status === 'unauthenticated') {
    return '/(auth)/sign-in/email';
  }
  if (status === 'needs-onboarding') {
    return '/(auth)/onboarding';
  }
  return null;
}
```

## `(app)` tab/stack shape

Canonical: single Projects tab, tab bar hidden, double-back-press-to-exit on Android, `FolderOpen` icon. Replicate exactly:

```
app/
  (app)/
    _layout.tsx         # auth gate + tab shell
    projects/
      index.tsx         # lands in P2.7
```

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

### Android double-back

```tsx
const navigation = useNavigation();
const lastBackPress = useRef(0);

const handleBackPress = useCallback(() => {
  if (Platform.OS !== 'android') return false;
  if (navigation.canGoBack()) return false;
  const now = Date.now();
  if (now - lastBackPress.current < 2000) {
    return false; // let app close
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

## DialogSheetProvider

Implements the existing P0 stub API:

```ts
export interface AppDialogApi {
  confirm(opts: AppDialogOptions): Promise<boolean>;
  alert(opts: AppDialogOptions): Promise<void>;
}
```

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
      // First action = confirm (true), others = cancel (false).
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

## Stub providers

All three follow the same shape — context-only, no behaviour. `enqueue`/`play` throw "stub — lands in P3" so accidental use surfaces loud:

```tsx
// lib/uploads/QueueProvider.tsx
import { createContext, useContext, type ReactNode } from 'react';

export interface QueueContextValue { enqueue: (item: unknown) => void }
const QueueContext = createContext<QueueContextValue | null>(null);

export function QueueProvider({ children }: { children: ReactNode }) {
  const enqueue = () => { throw new Error('QueueProvider stub — upload queue lands in P3'); };
  return <QueueContext.Provider value={{ enqueue }}>{children}</QueueContext.Provider>;
}
export function useUploadQueue() {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error('useUploadQueue must be inside QueueProvider');
  return ctx;
}
```

`AudioPlaybackProvider` is identical with `play()`/`pause()`/`stop()`. `SentryProvider` is a no-op pass-through:

```tsx
// lib/telemetry/SentryStub.tsx
import { type ReactNode } from 'react';

export function initSentry() { /* no-op for P2.6 */ }
export function SentryProvider({ children }: { children: ReactNode }) { return <>{children}</>; }
```

## Security review carry-overs

### §A — Multi-mount race

`AuthSessionProvider` shares module-level `cachedToken`/`bootstrapDone`. Single-mount-at-root design prevents races; StrictMode is off in production builds; Metro fast-refresh preserves module state.

**Decision: PUNT to P4** with a JSDoc constraint:

```tsx
/**
 * AuthSessionProvider — mount ONCE at app root.
 *
 * Module-level state (`cachedToken`, `bootstrapDone`) is shared
 * across all instances. Mounting more than once causes races.
 */
```

P4 follow-up: dev-only mount-count assertion **or** instance-level state via `useRef`.

### §C — Deleted-account fallback

If `/me` returns 200 with a `deletedAt` field, the bootstrap treats a deleted account as authenticated.

**Decision: ADDRESS during impl** — read `packages/api-contract` first. If 401, close out. If 200+`deletedAt`:

```ts
const fresh = await api.fetchMe();
if (cancelled) return;
if (fresh.user.deletedAt) {
  await storage.clearSession();
  cachedToken = null;
  setUser(null);
  setStatus('unauthenticated');
  return;
}
```

Assume 401 for the design; verify during implementation.

### §H — Provider prop-stability

`[storage, api]` deps on the bootstrap effect re-fire if a parent passes inline object literals.

**Decision: tighten to `[]`.** Bootstrap is a mount-time init; props are captured at render via destructure, the effect doesn't need them in deps.

```tsx
/**
 * STABILITY REQUIREMENT: if you pass `storage` or `api` props, they
 * MUST be referentially stable (a module-level constant, not an
 * inline literal) — bootstrap captures them at render and runs once.
 */
interface ProviderProps {
  children: ReactNode;
  storage?: typeof defaultStorage;
  api?: typeof defaultApi;
}

useEffect(() => {
  let cancelled = false;
  (async () => {
    // bootstrap using `storage` and `api` from outer scope
  })();
  return () => { cancelled = true; };
}, []); // empty deps
```

## Root index redirect

```tsx
// app/index.tsx
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/(app)/projects" />;
}
```

The `(app)` auth gate bounces unauthenticated users to `/(auth)/sign-in/email`.

## Files to ship

### New

1. `docs/v4/arch-p2-6-app-shell.md` — this design.
2. `apps/mobile/app/(app)/_layout.tsx` — auth gate + tab shell.
3. `apps/mobile/app/(app)/projects/index.tsx` — placeholder for P2.7.
4. `apps/mobile/lib/auth/auth-gate.ts` — `decideAuthRedirect` + `decideAppRedirect`.
5. `apps/mobile/lib/auth/auth-gate.test.ts` — Vitest cases.
6. `apps/mobile/lib/dialogs/DialogSheetProvider.tsx` — host + context.
7. `apps/mobile/lib/uploads/QueueProvider.tsx` — stub.
8. `apps/mobile/lib/audio/AudioPlaybackProvider.tsx` — stub.
9. `apps/mobile/lib/telemetry/SentryStub.tsx` — stub.

### Updated

1. `apps/mobile/app/_layout.tsx` — full provider tree.
2. `apps/mobile/app/(auth)/_layout.tsx` — redirect logic (currently no guards).
3. `apps/mobile/app/index.tsx` — placeholder → `<Redirect>`.
4. `apps/mobile/lib/auth/session.tsx` — bootstrap deps `[]`, JSDoc on `ProviderProps` and `AuthSessionProvider`.
5. `apps/mobile/lib/dialogs/useAppDialogSheet.ts` — replace stub, read `DialogContext`.
6. `docs/v4/arch-mobile.md` — update App-shell section with the provider tree.

### Tests

- `auth-gate.test.ts` — 8 cases:
  - `decideAuthRedirect('authenticated', '/(auth)/sign-in/email')` → `'/(app)/projects'`
  - `decideAuthRedirect('needs-onboarding', '/(auth)/sign-in/email')` → `'/(auth)/onboarding'`
  - `decideAuthRedirect('needs-onboarding', '/(auth)/onboarding')` → `null`
  - `decideAuthRedirect('unauthenticated', '/(auth)/sign-in/email')` → `null`
  - `decideAppRedirect('loading')` → `null`
  - `decideAppRedirect('unauthenticated')` → `'/(auth)/sign-in/email'`
  - `decideAppRedirect('needs-onboarding')` → `'/(auth)/onboarding'`
  - `decideAppRedirect('authenticated')` → `null`
- `DialogSheetProvider.test.tsx` — snapshot + `confirm` resolves true on first action / false on second; `alert` resolves on dismiss.
- `QueueProvider.test.tsx` — snapshot + `enqueue()` throws.
- `AudioPlaybackProvider.test.tsx` — snapshot + `play()` rejects.
- `SentryStub.test.tsx` — snapshot + `initSentry()` no-op.
- **Manual** in `:mock`: unauthenticated → sign-in; signed-in with `displayName==null` → onboarding else projects; Android back at projects root needs double-press to exit.

## Pitfalls addressed

- **Pitfall 5** (auth glue done late): single async bootstrap, no `setTimeout`, redirects via `<Redirect>` / `router.replace`.
- **Pitfall 12** (`Alert.alert`): `DialogSheetProvider` replaces the stub.
- **No EXPO_PUBLIC_ non-null assertions:** all env via `lib/env.ts`.

## Risk + carve-out summary

| Item | Decision | Rationale |
|---|---|---|
| §A multi-mount race | PUNT to P4 with JSDoc + TODO | Single-mount design is sound; runtime guard is polish. |
| §C deleted-account fallback | ADDRESS if API contract needs it, else close | Check `/me` spec during impl; assume 401 for now. |
| §H provider prop-stability | ADDRESS — deps `[]` | Bootstrap should never re-run mid-session. |
| Upload queue / Audio / Sentry | Stub now, real later | Provider order locked; swap is a no-op refactor. |

## Implementation checklist (one item ≈ one commit)

1. **Design doc** (this file) — `docs(mobile): P2.6 app shell design — provider tree + auth gate`.
2. **Auth gate decision functions** — `lib/auth/auth-gate.ts` + `.test.ts` — `feat(mobile): auth gate decision logic with tests`.
3. **DialogSheetProvider** — `lib/dialogs/DialogSheetProvider.tsx` + `.test.tsx`, update `useAppDialogSheet.ts` — `feat(mobile): DialogSheetProvider with imperative API`.
4. **Stub providers** — queue, audio, sentry + tests — `feat(mobile): stub providers (queue, audio, sentry)`.
5. **Root layout rewrite** — `app/_layout.tsx` — `feat(mobile): root provider tree with error boundary + query + auth + dialogs + stubs`.
6. **Auth group redirect** — `app/(auth)/_layout.tsx` — `feat(mobile): auth group redirect (authenticated → app, needs-onboarding → onboarding)`.
7. **App shell + tab layout** — `app/(app)/_layout.tsx` (new) + `app/(app)/projects/index.tsx` (placeholder) — `feat(mobile): (app) shell with tab nav + auth gate + projects placeholder`.
8. **Root index redirect** — `app/index.tsx` → `<Redirect>` — `feat(mobile): redirect root to (app) via auth gate`.
9. **Tighten AuthSessionProvider deps + JSDoc** — `lib/auth/session.tsx` — `fix(mobile): tighten auth bootstrap deps + document single-mount constraint`.
10. **Update arch-mobile.md** — App-shell section — `docs(mobile): update arch-mobile with P2.6 provider tree`.
11. **Manual verification** in `:mock` — no commit.

## Open / deferred

- **§C deleted-account check**: deferred to implementation — read API contract first.
- **§A mount-count guard**: P4 polish.
- **Tab bar visibility**: hidden per canonical; revisit if more tabs land in P3/P4.
- **Deep-link intent stashing**: not in P2.6 — auth gate redirects but doesn't stash the originally requested URL for post-login replay. Lands in P4 deep-linking polish; for now all unauthed users land at `/(auth)/sign-in/email`, all authed users at `/(app)/projects`.
