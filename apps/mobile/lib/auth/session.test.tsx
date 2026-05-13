/**
 * Auth session provider tests. Renders the provider with stubbed
 * storage + API and asserts on:
 *   - bootstrap state machine (no session, valid session, expired session, network failure)
 *   - signIn / signOut / refresh side effects
 *   - synchronous token getter wiring
 *   - 401 callback wiring (post-bootstrap only — pre-bootstrap is suppressed)
 *   - status derivation (needs-onboarding when displayName/companyName missing)
 *
 * Uses synchronous react-test-renderer `act()` per the
 * react19-testing.md memory note. Does NOT enable
 * `IS_REACT_ACT_ENVIRONMENT` (causes vitest teardown failures).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import React from 'react';
import { ApiError } from '../api/errors.js';
import { getAuthToken, notifyUnauthorized, resetAuthTokenGetter, resetOnUnauthorizedCallback } from '../api/auth.js';
import {
  AuthSessionProvider,
  useAuthSession,
  __resetSessionModule,
  type AuthSessionValue,
} from './session.js';
import type { PersistedSession, SessionUser } from './storage.js';

// Avoid pulling the real native modules. The session module imports
// `lib/auth/storage.ts` which itself imports them; stub at the module
// boundary so storage's defaults don't load. We pass our own storage
// seam via the provider prop, so these mocks just need to be importable.
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

const COMPLETE_USER: SessionUser = {
  id: 'u-1',
  phone: '+15551234567',
  displayName: 'Alex',
  companyName: 'Acme',
  createdAt: '2025-01-01T00:00:00.000Z',
};

const PRE_ONBOARD_USER: SessionUser = {
  ...COMPLETE_USER,
  displayName: null,
  companyName: null,
};

interface Capture {
  current: AuthSessionValue | null;
}

function Capture({ capture }: { capture: Capture }) {
  capture.current = useAuthSession();
  return null;
}

function makeStorage(initial: PersistedSession | null = null) {
  let stored: PersistedSession | null = initial;
  return {
    state: () => stored,
    readSession: vi.fn(async () => stored),
    writeSession: vi.fn(async (s: PersistedSession) => {
      stored = s;
    }),
    clearSession: vi.fn(async () => {
      stored = null;
    }),
    writeLastPhone: vi.fn(async () => undefined),
  };
}

function makeApi(overrides: Partial<{ fetchMe: () => Promise<{ user: SessionUser }>; postLogout: () => Promise<void> }> = {}) {
  return {
    fetchMe: overrides.fetchMe ?? vi.fn(async () => ({ user: COMPLETE_USER })),
    postLogout: overrides.postLogout ?? vi.fn(async () => undefined),
  };
}

async function flush() {
  // Two ticks: one for the inner await, one for the surrounding effect
  // microtask. Pattern from `react19-testing.md`.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

let tree: ReactTestRenderer | null = null;

function renderProvider(props: {
  storage: {
    readSession: ReturnType<typeof vi.fn>;
    writeSession: ReturnType<typeof vi.fn>;
    clearSession: ReturnType<typeof vi.fn>;
    writeLastPhone: ReturnType<typeof vi.fn>;
  };
  api: ReturnType<typeof makeApi>;
  capture: Capture;
}) {
  act(() => {
    tree = create(
      <AuthSessionProvider storage={props.storage} api={props.api}>
        <Capture capture={props.capture} />
      </AuthSessionProvider>,
    );
  });
}

describe('lib/auth/session', () => {
  beforeEach(() => {
    __resetSessionModule();
    resetAuthTokenGetter();
    resetOnUnauthorizedCallback();
  });

  afterEach(() => {
    if (tree) {
      act(() => {
        tree!.unmount();
      });
      tree = null;
    }
  });

  describe('bootstrap', () => {
    it('settles to "unauthenticated" when no session is stored', async () => {
      const storage = makeStorage(null);
      const api = makeApi();
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      expect(capture.current?.status).toBe('loading');

      await act(async () => {
        await flush();
      });

      expect(capture.current?.status).toBe('unauthenticated');
      expect(capture.current?.user).toBeNull();
      expect(api.fetchMe).not.toHaveBeenCalled();
      expect(getAuthToken()).toBeNull();
    });

    it('verifies a stored session via /me and settles to "authenticated"', async () => {
      const storage = makeStorage({ token: 'stored-jwt', user: PRE_ONBOARD_USER });
      const api = makeApi({ fetchMe: vi.fn(async () => ({ user: COMPLETE_USER })) });
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      await act(async () => {
        await flush();
      });

      expect(api.fetchMe).toHaveBeenCalledTimes(1);
      expect(capture.current?.status).toBe('authenticated');
      expect(capture.current?.user).toEqual(COMPLETE_USER);
      // Server view of the user is written back to storage.
      expect(storage.writeSession).toHaveBeenLastCalledWith({
        token: 'stored-jwt',
        user: COMPLETE_USER,
      });
      // Synchronous token getter is now wired and returns the bearer.
      expect(getAuthToken()).toBe('stored-jwt');
    });

    it('returns "needs-onboarding" when /me reports a profile gap', async () => {
      const storage = makeStorage({ token: 't', user: COMPLETE_USER });
      const api = makeApi({ fetchMe: vi.fn(async () => ({ user: PRE_ONBOARD_USER })) });
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      await act(async () => {
        await flush();
      });

      expect(capture.current?.status).toBe('needs-onboarding');
      expect(capture.current?.user).toEqual(PRE_ONBOARD_USER);
    });

    it('clears storage + state when /me returns 401 (token rejected)', async () => {
      const storage = makeStorage({ token: 'expired', user: COMPLETE_USER });
      const api = makeApi({
        fetchMe: vi.fn(async () => {
          throw new ApiError({ code: 'unauthorized', message: 'expired', status: 401 });
        }),
      });
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      await act(async () => {
        await flush();
      });

      expect(storage.clearSession).toHaveBeenCalled();
      expect(capture.current?.status).toBe('unauthenticated');
      expect(capture.current?.user).toBeNull();
      expect(getAuthToken()).toBeNull();
    });

    it('falls back to the stored user blob when /me fails with a network error', async () => {
      const storage = makeStorage({ token: 't', user: COMPLETE_USER });
      const api = makeApi({
        fetchMe: vi.fn(async () => {
          throw new ApiError({ code: 'network_error', message: 'offline', status: 0 });
        }),
      });
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      await act(async () => {
        await flush();
      });

      // Still authenticated — app is usable offline.
      expect(capture.current?.status).toBe('authenticated');
      expect(capture.current?.user).toEqual(COMPLETE_USER);
      expect(storage.clearSession).not.toHaveBeenCalled();
    });

    it('always settles status (no hang) when SecureStore itself blows up', async () => {
      const storage = {
        readSession: vi.fn(async () => {
          throw new Error('keychain unavailable');
        }),
        writeSession: vi.fn(async () => undefined),
        clearSession: vi.fn(async () => undefined),
        writeLastPhone: vi.fn(async () => undefined),
      };
      const api = makeApi();
      const capture: Capture = { current: null };
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      renderProvider({ storage, api, capture });
      await act(async () => {
        await flush();
      });

      expect(capture.current?.status).toBe('unauthenticated');
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('signIn', () => {
    it('writes session + last phone, transitions to "authenticated", wires the token', async () => {
      const storage = makeStorage(null);
      const api = makeApi();
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      await act(async () => {
        await flush();
      });
      expect(capture.current?.status).toBe('unauthenticated');

      await act(async () => {
        await capture.current!.signIn({
          token: 'fresh-jwt',
          user: COMPLETE_USER,
          phone: '+15551234567',
        });
      });

      expect(storage.writeSession).toHaveBeenCalledWith({
        token: 'fresh-jwt',
        user: COMPLETE_USER,
      });
      expect(storage.writeLastPhone).toHaveBeenCalledWith('+15551234567');
      expect(capture.current?.status).toBe('authenticated');
      expect(getAuthToken()).toBe('fresh-jwt');
    });

    it('routes to "needs-onboarding" when the verify response lacks profile fields', async () => {
      const storage = makeStorage(null);
      const api = makeApi();
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      await act(async () => {
        await flush();
      });

      await act(async () => {
        await capture.current!.signIn({ token: 't', user: PRE_ONBOARD_USER });
      });

      expect(capture.current?.status).toBe('needs-onboarding');
    });
  });

  describe('signOut', () => {
    it('best-effort logout, clears storage + token, returns to "unauthenticated"', async () => {
      const storage = makeStorage({ token: 'jwt', user: COMPLETE_USER });
      const api = makeApi();
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      await act(async () => {
        await flush();
      });
      expect(capture.current?.status).toBe('authenticated');

      await act(async () => {
        await capture.current!.signOut();
      });

      expect(api.postLogout).toHaveBeenCalledTimes(1);
      expect(storage.clearSession).toHaveBeenCalled();
      expect(capture.current?.status).toBe('unauthenticated');
      expect(getAuthToken()).toBeNull();
    });

    it('clears local state even when the logout API call fails', async () => {
      const storage = makeStorage({ token: 'jwt', user: COMPLETE_USER });
      const api = makeApi({
        postLogout: vi.fn(async () => {
          throw new ApiError({ code: 'network_error', message: 'offline', status: 0 });
        }),
      });
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      await act(async () => {
        await flush();
      });

      await act(async () => {
        await capture.current!.signOut();
      });

      expect(capture.current?.status).toBe('unauthenticated');
      expect(getAuthToken()).toBeNull();
      expect(storage.clearSession).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('re-fetches /me and updates user', async () => {
      const storage = makeStorage({ token: 'jwt', user: PRE_ONBOARD_USER });
      const fetchMe = vi
        .fn()
        .mockResolvedValueOnce({ user: PRE_ONBOARD_USER })
        .mockResolvedValueOnce({ user: COMPLETE_USER });
      const api = makeApi({ fetchMe });
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      await act(async () => {
        await flush();
      });
      expect(capture.current?.status).toBe('needs-onboarding');

      await act(async () => {
        await capture.current!.refresh();
      });

      expect(fetchMe).toHaveBeenCalledTimes(2);
      expect(capture.current?.status).toBe('authenticated');
      expect(capture.current?.user).toEqual(COMPLETE_USER);
    });

    it('signs out when refresh hits a 401', async () => {
      const storage = makeStorage({ token: 'jwt', user: COMPLETE_USER });
      const fetchMe = vi
        .fn()
        .mockResolvedValueOnce({ user: COMPLETE_USER })
        .mockRejectedValueOnce(new ApiError({ code: 'unauthorized', message: 'x', status: 401 }));
      const api = makeApi({ fetchMe });
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      await act(async () => {
        await flush();
      });

      await act(async () => {
        await capture.current!.refresh();
      });

      expect(capture.current?.status).toBe('unauthenticated');
      expect(getAuthToken()).toBeNull();
      expect(storage.clearSession).toHaveBeenCalled();
    });

    it('is a no-op when no token is cached', async () => {
      const storage = makeStorage(null);
      const api = makeApi();
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      await act(async () => {
        await flush();
      });

      await act(async () => {
        await capture.current!.refresh();
      });

      expect(api.fetchMe).not.toHaveBeenCalled();
    });
  });

  describe('401 callback wiring', () => {
    it('post-bootstrap, notifyUnauthorized() tears down the session locally', async () => {
      const storage = makeStorage({ token: 'jwt', user: COMPLETE_USER });
      const api = makeApi();
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      await act(async () => {
        await flush();
      });
      expect(capture.current?.status).toBe('authenticated');

      // Simulate the API client firing a 401 from any request.
      act(() => {
        notifyUnauthorized();
      });

      expect(capture.current?.status).toBe('unauthenticated');
      expect(getAuthToken()).toBeNull();
    });

    it('pre-bootstrap, notifyUnauthorized() does NOT tear down a valid stored session', async () => {
      // Slow /me — bootstrap is in flight when the 401 arrives.
      let resolveMe!: (v: { user: SessionUser }) => void;
      const fetchMe = vi.fn(
        () =>
          new Promise<{ user: SessionUser }>((res) => {
            resolveMe = res;
          }),
      );
      const storage = makeStorage({ token: 'jwt', user: COMPLETE_USER });
      const api = makeApi({ fetchMe });
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      // Let the effect run and read storage, but DON'T resolve fetchMe.
      await act(async () => {
        await flush();
      });
      expect(capture.current?.status).toBe('loading');

      // A stale request fires while bootstrap hasn't completed.
      act(() => {
        notifyUnauthorized();
      });
      // Status must NOT have flipped — that would silently nuke a valid session.
      expect(capture.current?.status).toBe('loading');

      // Now finish bootstrap successfully.
      await act(async () => {
        resolveMe({ user: COMPLETE_USER });
        await flush();
      });
      expect(capture.current?.status).toBe('authenticated');
    });
  });

  describe('useAuthSession hook', () => {
    it('throws a helpful error when used outside the provider', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      function Naked() {
        useAuthSession();
        return null;
      }
      expect(() => {
        act(() => {
          create(<Naked />);
        });
      }).toThrow(/AuthSessionProvider/);
      errorSpy.mockRestore();
    });
  });

  describe('§C: 404 handling (security review)', () => {
    it('bootstrap treats /me 404 as invalid session (clears local state)', async () => {
      const storage = makeStorage({ token: 'jwt', user: COMPLETE_USER });
      const api = makeApi({
        fetchMe: vi.fn(async () => {
          throw new ApiError({ code: 'not_found', message: 'User not found', status: 404 });
        }),
      });
      const capture: Capture = { current: null };

      renderProvider({ storage, api, capture });
      await act(async () => {
        await flush();
      });

      expect(capture.current?.status).toBe('unauthenticated');
      expect(capture.current?.user).toBeNull();
      expect(storage.clearSession).toHaveBeenCalledOnce();
      expect(getAuthToken()).toBeNull();
    });
  });

  describe('§H: prop-stability (security review)', () => {
    it('re-rendering with new props does NOT re-fire bootstrap', async () => {
      const storage1 = makeStorage(null);
      const api1 = makeApi();
      const capture: Capture = { current: null };

      renderProvider({ storage: storage1, api: api1, capture });
      await act(async () => {
        await flush();
      });
      expect(capture.current?.status).toBe('unauthenticated');
      expect(api1.fetchMe).toHaveBeenCalledTimes(0);

      // Re-render with NEW props (inline object literals).
      const storage2 = makeStorage(null);
      const api2 = makeApi();
      act(() => {
        tree!.update(
          <AuthSessionProvider storage={storage2} api={api2}>
            <Capture capture={capture} />
          </AuthSessionProvider>,
        );
      });
      await act(async () => {
        await flush();
      });

      // Bootstrap must NOT have re-run — fetchMe call count stays 0.
      expect(api2.fetchMe).toHaveBeenCalledTimes(0);
    });
  });

  describe('§A: multi-mount guard (security review)', () => {
    it('throws in __DEV__ if provider mounts twice', () => {
      // Set __DEV__ for this test
      (globalThis as any).__DEV__ = true;

      const storage = makeStorage(null);
      const api = makeApi();
      const capture: Capture = { current: null };

      // First mount: OK
      renderProvider({ storage, api, capture });

      // Second mount: throws
      expect(() => {
        let tree2: ReactTestRenderer | null = null;
        act(() => {
          tree2 = create(
            <AuthSessionProvider storage={storage} api={api}>
              <Capture capture={capture} />
            </AuthSessionProvider>,
          );
        });
        act(() => {
          tree2!.unmount();
        });
      }).toThrow('[auth] AuthSessionProvider mounted more than once');

      // Clean up for next test
      act(() => {
        tree!.unmount();
      });
      tree = null;
      __resetSessionModule();
      delete (globalThis as any).__DEV__;
    });
  });
});
