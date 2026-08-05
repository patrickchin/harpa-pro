import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionMocks = vi.hoisted(() => ({
  clear: vi.fn(),
  refetch: vi.fn(),
  signOut: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('@/lib/query-client', () => ({
  queryClient: { clear: sessionMocks.clear },
}));

vi.mock('./client', () => ({
  authClient: {
    signOut: sessionMocks.signOut,
    useSession: sessionMocks.useSession,
  },
}));

import { AuthSessionProvider, useAuthSession } from './session';

function SessionProbe(): React.JSX.Element {
  const session = useAuthSession();

  return (
    <>
      <p>Status: {session.status}</p>
      <p>User: {session.user?.displayName ?? 'none'}</p>
      <button type="button" onClick={() => void session.refresh()}>
        Refresh
      </button>
      <button type="button" onClick={() => void session.signOut()}>
        Sign out
      </button>
    </>
  );
}

describe('AuthSessionProvider', () => {
  beforeEach(() => {
    sessionMocks.clear.mockReset();
    sessionMocks.refetch.mockReset().mockResolvedValue(undefined);
    sessionMocks.signOut.mockReset().mockResolvedValue(undefined);
    sessionMocks.useSession.mockReset().mockReturnValue({
      data: {
        user: {
          id: 'usr_1',
          email: 'manager@example.com',
          name: 'Morgan Lee',
          displayName: 'Morgan Lee',
          companyName: 'Northline Builders',
          createdAt: '2026-07-29T00:00:00.000Z',
        },
      },
      isPending: false,
      refetch: sessionMocks.refetch,
    });
  });

  it('provides the current user and refreshes the session on demand', async () => {
    const user = userEvent.setup();
    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );

    expect(screen.getByText('Status: authenticated')).toBeVisible();
    expect(screen.getByText('User: Morgan Lee')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(sessionMocks.refetch).toHaveBeenCalledOnce();
  });

  it('clears project data and refreshes the session after signing out', async () => {
    const user = userEvent.setup();
    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(sessionMocks.signOut).toHaveBeenCalledOnce();
    expect(sessionMocks.clear).toHaveBeenCalledOnce();
    expect(sessionMocks.refetch).toHaveBeenCalledOnce();
  });

  it('clears project data even when the auth request fails', async () => {
    const failure = new Error('Network unavailable.');
    sessionMocks.signOut.mockRejectedValue(failure);
    let signOut: (() => Promise<void>) | undefined;

    function CaptureSession(): null {
      signOut = useAuthSession().signOut;
      return null;
    }

    render(
      <AuthSessionProvider>
        <CaptureSession />
      </AuthSessionProvider>,
    );

    await expect(
      act(async () => {
        await signOut?.();
      }),
    ).rejects.toThrow('Network unavailable.');
    expect(sessionMocks.clear).toHaveBeenCalledOnce();
    expect(sessionMocks.refetch).toHaveBeenCalledOnce();
  });

  it('rejects use outside its provider', () => {
    function InvalidConsumer(): null {
      useAuthSession();
      return null;
    }

    expect(() => render(<InvalidConsumer />)).toThrow(
      'useAuthSession must be used within an AuthSessionProvider.',
    );
  });
});
