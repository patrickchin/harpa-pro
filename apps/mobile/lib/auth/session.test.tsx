import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useSessionMock = vi.fn();
const signOutMock = vi.fn();
const getCookieMock = vi.fn();

vi.mock('./client', () => ({
  authClient: {
    useSession: (...args: unknown[]) => useSessionMock(...args),
    signOut: (...args: unknown[]) => signOutMock(...args),
    getCookie: (...args: unknown[]) => getCookieMock(...args),
  },
}));

const setAuthTokenGetterMock = vi.fn();
const setOnUnauthorizedCallbackMock = vi.fn();
vi.mock('../api/auth', () => ({
  setAuthTokenGetter: (fn: unknown) => setAuthTokenGetterMock(fn),
  setOnUnauthorizedCallback: (fn: unknown) => setOnUnauthorizedCallbackMock(fn),
}));

const resetQueryCacheMock = vi.fn(() => Promise.resolve());
vi.mock('../api/query-client', () => ({
  resetQueryCache: () => resetQueryCacheMock(),
}));

import {
  AuthSessionProvider,
  useAuthSession,
} from './session';
import type { AuthSessionValue } from './session';
import { QueueProvider, type UploadQueue } from '../uploads/QueueProvider';

function Probe({ onValue }: { onValue: (v: AuthSessionValue) => void }) {
  const v = useAuthSession();
  onValue(v);
  return null;
}

function renderWithSession(state: {
  data: { user: Partial<Record<string, unknown>> | null } | null;
  isPending: boolean;
}, queue?: UploadQueue) {
  const refetch = vi.fn(() => Promise.resolve());
  useSessionMock.mockReturnValue({ ...state, refetch });
  let captured: AuthSessionValue | null = null;
  let tree: ReturnType<typeof create> | null = null;
  const element = () => (
    <AuthSessionProvider>
      {queue ? (
        <QueueProvider queue={queue}>
          <Probe onValue={(v) => (captured = v)} />
        </QueueProvider>
      ) : (
        <Probe onValue={(v) => (captured = v)} />
      )}
    </AuthSessionProvider>
  );
  act(() => {
    tree = create(element());
  });
  return {
    tree: tree!,
    value: () => captured!,
    refetch,
    rerender(nextState: typeof state) {
      useSessionMock.mockReturnValue({ ...nextState, refetch });
      act(() => {
        tree!.update(element());
      });
    },
  };
}

function makeUploadQueue() {
  const clear = vi.fn();
  const queue = {
    enqueue: vi.fn(),
    enqueueBatch: vi.fn(),
    retry: vi.fn(),
    getJobs: vi.fn(() => []),
    subscribe: vi.fn(() => () => undefined),
    remove: vi.fn(),
    clear,
  } as unknown as UploadQueue;
  return { queue, clear };
}

beforeEach(() => {
  vi.clearAllMocks();
  signOutMock.mockResolvedValue(undefined);
  getCookieMock.mockReturnValue(null);
});

describe('useAuthSession', () => {
  it('reports loading when pending', () => {
    const { value } = renderWithSession({ data: null, isPending: true });
    expect(value().status).toBe('loading');
    expect(value().user).toBeNull();
  });

  it('reports unauthenticated when no user', () => {
    const { value } = renderWithSession({ data: null, isPending: false });
    expect(value().status).toBe('unauthenticated');
  });

  it('reports needs-onboarding when displayName is null', () => {
    const { value } = renderWithSession({
      data: { user: { id: 'u1', email: 'a@b.c', displayName: null, companyName: 'Co' } },
      isPending: false,
    });
    expect(value().status).toBe('needs-onboarding');
  });

  it('reports authenticated when displayName exists and companyName is null', () => {
    const { value } = renderWithSession({
      data: { user: { id: 'u1', email: 'a@b.c', displayName: 'Alice', companyName: null } },
      isPending: false,
    });
    expect(value().status).toBe('authenticated');
  });

  it('reports authenticated when displayName and companyName are complete', () => {
    const { value } = renderWithSession({
      data: { user: { id: 'u1', email: 'a@b.c', displayName: 'Alice', companyName: 'Co' } },
      isPending: false,
    });
    expect(value().status).toBe('authenticated');
  });

  it('wires the bearer token getter from authClient.getCookie()', () => {
    getCookieMock.mockReturnValue(
      'other=foo; better-auth.session_token=token-abc; trailing=bar',
    );
    renderWithSession({ data: null, isPending: false });
    const getter = setAuthTokenGetterMock.mock.calls.at(-1)![0] as () => string | null;
    expect(getter()).toBe('token-abc');
  });

  it('returns null from the bearer getter when no cookie is stored', () => {
    getCookieMock.mockReturnValue(null);
    renderWithSession({ data: null, isPending: false });
    const getter = setAuthTokenGetterMock.mock.calls.at(-1)![0] as () => string | null;
    expect(getter()).toBeNull();
  });

  it('returns null from the bearer getter when getCookie throws', () => {
    getCookieMock.mockImplementation(() => {
      throw new Error('boom');
    });
    renderWithSession({ data: null, isPending: false });
    const getter = setAuthTokenGetterMock.mock.calls.at(-1)![0] as () => string | null;
    expect(getter()).toBeNull();
  });

  it('signOut calls authClient.signOut + resets cache + refetches', async () => {
    const uploadQueue = makeUploadQueue();
    const { value, refetch } = renderWithSession({
      data: { user: { id: 'u1', email: 'a@b.c', displayName: 'A', companyName: 'C' } },
      isPending: false,
    }, uploadQueue.queue);
    await act(async () => {
      await value().signOut();
    });
    expect(uploadQueue.clear).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(resetQueryCacheMock).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalled();
  });

  it('signOut swallows errors from authClient.signOut', async () => {
    signOutMock.mockRejectedValueOnce(new Error('network'));
    const { value } = renderWithSession({
      data: { user: { id: 'u1', email: 'a@b.c', displayName: 'A', companyName: 'C' } },
      isPending: false,
    });
    await expect(
      act(async () => {
        await value().signOut();
      }),
    ).resolves.not.toThrow();
  });

  it('refresh proxies to refetch', async () => {
    const { value, refetch } = renderWithSession({ data: null, isPending: false });
    await act(async () => {
      await value().refresh();
    });
    expect(refetch).toHaveBeenCalled();
  });

  it('signIn shim refetches the session', async () => {
    const { value, refetch } = renderWithSession({ data: null, isPending: false });
    await act(async () => {
      await value().signIn({ email: 'a@b.c' });
    });
    expect(refetch).toHaveBeenCalled();
  });

  it('registers a 401 callback that signs out and resets the cache', async () => {
    const uploadQueue = makeUploadQueue();
    renderWithSession({
      data: { user: { id: 'u1', email: 'a@b.c', displayName: 'A', companyName: 'C' } },
      isPending: false,
    }, uploadQueue.queue);
    const cb = setOnUnauthorizedCallbackMock.mock.calls.at(-1)![0] as () => void;
    await act(async () => {
      cb();
      // Allow the async IIFE inside the callback to settle.
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(uploadQueue.clear).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalled();
    expect(resetQueryCacheMock).toHaveBeenCalled();
  });

  it('clears the root upload queue when the authenticated user changes', () => {
    const uploadQueue = makeUploadQueue();
    const rendered = renderWithSession({
      data: { user: { id: 'u1', email: 'a@b.c', displayName: 'A', companyName: 'C' } },
      isPending: false,
    }, uploadQueue.queue);

    expect(uploadQueue.clear).not.toHaveBeenCalled();
    rendered.rerender({
      data: { user: { id: 'u2', email: 'b@b.c', displayName: 'B', companyName: 'C' } },
      isPending: false,
    });

    expect(uploadQueue.clear).toHaveBeenCalledTimes(1);
  });

  it('throws when used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      act(() => {
        create(<Probe onValue={() => {}} />);
      }),
    ).toThrow(/AuthSessionProvider/);
    spy.mockRestore();
  });
});
