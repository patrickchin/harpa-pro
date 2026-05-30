/**
 * Regression test for the hook-order bug in `AppLayout` (Pattern Rn —
 * Rules-of-Hooks violation in expo-router layouts with auth gates).
 *
 * Bug: AppLayout originally placed `<Redirect />` before
 * `useCallback` + `useEffect`. When the auth gate flipped between
 * `loading` (no redirect) and `unauthenticated` (redirect), React saw
 * a different number of hooks across renders and threw
 *
 *   "Rendered fewer hooks than expected. This may be caused by an
 *    accidental early return statement."
 *
 * Fix: declare every hook unconditionally before any conditional
 * return.
 *
 * This test re-renders the layout across both branches of the auth
 * gate; if a future edit re-introduces an early return ahead of a
 * hook, React's invariant will fire and fail the test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

type AuthStatus = 'loading' | 'unauthenticated' | 'needs-onboarding' | 'authenticated';

// Hoisted mock for useAuthSession so we can flip status across
// re-renders. `vi.hoisted` keeps the mutable ref in scope before
// vi.mock's factory runs. We do NOT importActual the session module
// because it pulls in expo-secure-store + expo-modules-core natives.
const authState = vi.hoisted(() => ({
  status: 'loading' as 'loading' | 'unauthenticated' | 'needs-onboarding' | 'authenticated',
}));

vi.mock('@/lib/auth/session', () => ({
  useAuthSession: () => ({
    status: authState.status,
    user: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    completeOnboarding: vi.fn(),
  }),
}));

// Per-test overridable router stub. The default expo-router mock in
// `vitest.setup.ts` returns `canGoBack: () => false`; we re-mock here
// so individual tests can flip it to simulate "we are on a nested
// screen with history" vs "we are at the app root".
const routerState = vi.hoisted(() => ({
  canGoBack: false,
}));

vi.mock('expo-router', async () => {
  const React = await import('react');
  type AnyProps = Record<string, unknown> & { children?: unknown };
  const Redirect = (props: AnyProps) =>
    React.createElement('rn-Redirect', { href: props.href }, null);
  const StackComponent = (props: AnyProps) =>
    React.createElement('rn-Stack', props, props.children as never);
  const Stack = Object.assign(StackComponent, {
    Screen: (props: AnyProps) => React.createElement('rn-Stack.Screen', props, null),
  });
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    navigate: vi.fn(),
    canGoBack: () => routerState.canGoBack,
    setParams: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
    dismissTo: vi.fn(),
  };
  return {
    Redirect,
    Stack,
    useRouter: () => router,
    useNavigation: () => router,
    router,
  };
});

import AppLayout from '../../app/(app)/_layout';
import { BackHandler, Platform, ToastAndroid } from 'react-native';

describe('AppLayout — hook order across auth-gate transitions', () => {
  beforeEach(() => {
    authState.status = 'loading';
    routerState.canGoBack = false;
  });

  it('does not throw "Rendered fewer hooks" when status flips from loading → unauthenticated', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<AppLayout />);
    });

    // Flip auth state — this is the transition that previously
    // changed the rendered hook count and crashed the layout.
    expect(() => {
      act(() => {
        authState.status = 'unauthenticated';
        tree.update(<AppLayout />);
      });
    }).not.toThrow();

    // And flip back, for good measure.
    expect(() => {
      act(() => {
        authState.status = 'authenticated';
        tree.update(<AppLayout />);
      });
    }).not.toThrow();
  });

  it('renders <Redirect> when unauthenticated', () => {
    authState.status = 'unauthenticated';
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<AppLayout />);
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('rn-Redirect');
  });

  it('renders <Redirect> when status is needs-onboarding', () => {
    authState.status = 'needs-onboarding';
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<AppLayout />);
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('rn-Redirect');
  });

  it('renders the stack shell when authenticated', () => {
    authState.status = 'authenticated';
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<AppLayout />);
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('rn-Stack');
  });
});

/**
 * Regression test for the back-gesture double-press bug
 * (`docs/bugs/README.md` entry 2026-05-24).
 *
 * Bug: AppLayout used `useNavigation().canGoBack()` to decide
 * whether back-press should fall through to default navigation.
 * Inside a layout, `useNavigation()` returns the PARENT navigator —
 * which has no history — so `canGoBack()` was always `false` and
 * the "Press back again to exit" toast fired on every nested
 * screen, requiring two back-presses to actually go back.
 *
 * Fix: use `router.canGoBack()` from expo-router, which reflects
 * the global nav state across all nested navigators.
 *
 * These tests capture the handler registered with `BackHandler`
 * and invoke it directly while toggling `router.canGoBack()`.
 */
describe('AppLayout — Android double-back-to-exit', () => {
  beforeEach(() => {
    authState.status = 'authenticated';
    routerState.canGoBack = false;
    Platform.OS = 'android';
  });

  function captureHandler(): () => boolean {
    let handler!: () => boolean;
    const spy = vi
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation(
        (event: string, cb: () => boolean | null | undefined) => {
          if (event === 'hardwareBackPress') handler = cb as () => boolean;
          return { remove: () => undefined };
        },
      );
    act(() => {
      TestRenderer.create(<AppLayout />);
    });
    spy.mockRestore();
    return handler;
  }

  it('returns false (lets the OS handle back) when nested screens can go back', () => {
    routerState.canGoBack = true;
    const toast = vi.spyOn(ToastAndroid, 'show').mockImplementation(() => undefined);

    const handler = captureHandler();
    expect(handler()).toBe(false);
    expect(toast).not.toHaveBeenCalled();
  });

  it('shows the toast and swallows the first press when at the app root', () => {
    routerState.canGoBack = false;
    const toast = vi.spyOn(ToastAndroid, 'show').mockImplementation(() => undefined);

    const handler = captureHandler();
    expect(handler()).toBe(true);
    expect(toast).toHaveBeenCalledWith('Press back again to exit', ToastAndroid.SHORT);
  });

  it('lets the OS close the app on a second press within 2s at the app root', () => {
    routerState.canGoBack = false;
    vi.spyOn(ToastAndroid, 'show').mockImplementation(() => undefined);

    const handler = captureHandler();
    expect(handler()).toBe(true);
    // Second press immediately after — should fall through (return false).
    expect(handler()).toBe(false);
  });

  it('returns false on iOS regardless of canGoBack', () => {
    Platform.OS = 'ios';
    routerState.canGoBack = false;
    const handler = captureHandler();
    expect(handler()).toBe(false);
  });
});
