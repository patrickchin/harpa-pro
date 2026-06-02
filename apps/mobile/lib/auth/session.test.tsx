/**
 * Auth session provider tests for the better-auth-backed provider.
 *
 * Strategy: mock `./client` so authClient.useSession() returns
 * controlled data. This decouples the provider from native better-auth
 * internals (MMKV, network) while still exercising the full React tree,
 * the synchronous token getter, and the 401 callback wiring.
 *
 * Covers:
 *  - Status derivation (loading / unauthenticated / authenticated / needs-onboarding)
 *  - Synchronous token getter — updated when session atom changes
 *  - signOut — calls authClient.signOut() + resetQueryCache()
 *  - refresh — delegates to refetch()
 *  - 401 handler — fires signOut path when notifyUnauthorized() is called
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import React from 'react';
import {
  getAuthToken,
  notifyUnauthorized,
  resetAuthTokenGetter,
  resetOnUnauthorizedCallback,
} from '../api/auth';
import {
  AuthSessionProvider,
  useAuthSession,
  __resetSessionModule,
  type AuthSessionValue,
  type SessionUser,
} from './session';

// ---------------------------------------------------------------------------
// Mock authClient — use vi.hoisted so fns are available before vi.mock hoisting
// ---------------------------------------------------------------------------
const { mockRefetch, mockSignOut, mockSessionReturn } = vi.hoisted(() => {
  const mockRefetch = vi.fn(async () => undefined);
  const mockSignOut = vi.fn(async () => ({ data: null, error: null }));
  const mockSessionReturn = {
    current: {
      data: null as { user: Record<string, unknown>; session: { token: string } } | null,
      isPending: true,
      refetch: mockRefetch,
    },
  };
  return { mockRefetch, mockSignOut, mockSessionReturn };
});

vi.mock('./client', () => ({
  authClient: {
    useSession: () => mockSessionReturn.current,
    signOut: mockSignOut,
  },
}));

vi.mock('../api/query-client', () => ({
  resetQueryCache: vi.fn(async () => undefined),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const COMPLETE_USER: SessionUser = {
  id: 'u-1',
  email: 'test@example.com',
  displayName: 'Alex',
  companyName: 'Acme',
  createdAt: '2025-01-01T00:00:00.000Z',
};

const PRE_ONBOARD_USER: SessionUser = {
  ...COMPLETE_USER,
  displayName: null,
  companyName: null,
};

function makeSessionData(user: SessionUser, token = 'test-token') {
  return {
    user: user as unknown as Record<string, unknown>,
    session: { token },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface Capture {
  current: AuthSessionValue | null;
}

function CaptureComponent({ capture }: { capture: Capture }) {
  capture.current = useAuthSession();
  return null;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

let tree: ReactTestRenderer | null = null;

function renderProvider(capture: Capture) {
  act(() => {
    tree = create(
      <AuthSessionProvider>
        <CaptureComponent capture={capture} />
      </AuthSessionProvider>,
    );
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('lib/auth/session', () => {
  beforeEach(() => {
    __resetSessionModule();
    resetAuthTokenGetter();
    resetOnUnauthorizedCallback();
    mockRefetch.mockClear();
    mockSignOut.mockClear();
    mockSessionReturn.current = { data: null, isPending: true, refetch: mockRefetch };
  });

  afterEach(() => {
    if (tree) {
      act(() => {
        tree!.unmount();
      });
      tree = null;
    }
  });

  describe('status derivation', () => {
    it('returns "loading" when isPending is true', () => {
      mockSessionReturn.current = { data: null, isPending: true, refetch: mockRefetch };
      const capture: Capture = { current: null };
      renderProvider(capture);
      expect(capture.current?.status).toBe('loading');
    });

    it('returns "unauthenticated" when data is null and not pending', () => {
      mockSessionReturn.current = { data: null, isPending: false, refetch: mockRefetch };
      const capture: Capture = { current: null };
      renderProvider(capture);
      expect(capture.current?.status).toBe('unauthenticated');
      expect(capture.current?.user).toBeNull();
    });

    it('returns "authenticated" for a complete user profile', () => {
      mockSessionReturn.current = {
        data: makeSessionData(COMPLETE_USER),
        isPending: false,
        refetch: mockRefetch,
      };
      const capture: Capture = { current: null };
      renderProvider(capture);
      expect(capture.current?.status).toBe('authenticated');
      expect(capture.current?.user).toMatchObject({
        id: COMPLETE_USER.id,
        email: COMPLETE_USER.email,
        displayName: COMPLETE_USER.displayName,
        companyName: COMPLETE_USER.companyName,
      });
    });

    it('returns "needs-onboarding" when displayName or companyName is null', () => {
      mockSessionReturn.current = {
        data: makeSessionData(PRE_ONBOARD_USER),
        isPending: false,
        refetch: mockRefetch,
      };
      const capture: Capture = { current: null };
      renderProvider(capture);
      expect(capture.current?.status).toBe('needs-onboarding');
    });
  });

  describe('token getter', () => {
    it('wires the synchronous token getter from the session token', () => {
      mockSessionReturn.current = {
        data: makeSessionData(COMPLETE_USER, 'jwt-abc'),
        isPending: false,
        refetch: mockRefetch,
      };
      const capture: Capture = { current: null };
      renderProvider(capture);
      expect(getAuthToken()).toBe('jwt-abc');
    });

    it('returns null when there is no session', () => {
      mockSessionReturn.current = { data: null, isPending: false, refetch: mockRefetch };
      const capture: Capture = { current: null };
      renderProvider(capture);
      expect(getAuthToken()).toBeNull();
    });
  });

  describe('signOut', () => {
    it('calls authClient.signOut() and resets query cache', async () => {
      const { resetQueryCache } = await import('../api/query-client');
      mockSessionReturn.current = {
        data: makeSessionData(COMPLETE_USER),
        isPending: false,
        refetch: mockRefetch,
      };
      const capture: Capture = { current: null };
      renderProvider(capture);

      await act(async () => {
        await capture.current!.signOut();
        await flush();
      });

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(resetQueryCache).toHaveBeenCalled();
    });

    it('still resets query cache even when signOut() throws', async () => {
      const { resetQueryCache } = await import('../api/query-client');
      mockSignOut.mockRejectedValueOnce(new Error('network error'));
      mockSessionReturn.current = {
        data: makeSessionData(COMPLETE_USER),
        isPending: false,
        refetch: mockRefetch,
      };
      const capture: Capture = { current: null };
      renderProvider(capture);

      await act(async () => {
        await capture.current!.signOut();
        await flush();
      });

      expect(resetQueryCache).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('delegates to authClient refetch', async () => {
      mockSessionReturn.current = {
        data: makeSessionData(COMPLETE_USER),
        isPending: false,
        refetch: mockRefetch,
      };
      const capture: Capture = { current: null };
      renderProvider(capture);

      await act(async () => {
        await capture.current!.refresh();
      });

      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('401 handler', () => {
    it('calls authClient.signOut() when notifyUnauthorized() fires', async () => {
      mockSessionReturn.current = {
        data: makeSessionData(COMPLETE_USER),
        isPending: false,
        refetch: mockRefetch,
      };
      const capture: Capture = { current: null };
      renderProvider(capture);

      await act(async () => {
        notifyUnauthorized();
        await flush();
      });

      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});
