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

import AppLayout from '../../app/(app)/_layout';

describe('AppLayout — hook order across auth-gate transitions', () => {
  beforeEach(() => {
    authState.status = 'loading';
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

  it('renders the tab shell when authenticated', () => {
    authState.status = 'authenticated';
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<AppLayout />);
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('rn-Tabs');
  });
});
