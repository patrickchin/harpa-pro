// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { activity } from '@harpa/api-contract';

const authMock = vi.hoisted(() => {
  const refetchSession = vi.fn();
  return {
    sendVerificationOtp: vi.fn(),
    signInEmailOtp: vi.fn(),
    signOut: vi.fn(),
    refetchSession,
    sessionState: {
      data: null as { user: { email: string } } | null,
      isPending: true,
      refetch: refetchSession,
    },
  };
});

vi.mock('../../lib/admin-auth', () => ({
  adminAuthClient: {
    useSession: () => authMock.sessionState,
    emailOtp: { sendVerificationOtp: authMock.sendVerificationOtp },
    signIn: { emailOtp: authMock.signInEmailOtp },
    signOut: authMock.signOut,
  },
}));

vi.mock('../../lib/env', () => ({
  getPublicEnv: () => ({
    apiBaseUrl: 'https://api.example.test',
    turnstileSiteKey: 'test-site-key',
  }),
}));

import AdminActivity from './AdminActivity';

const reportEvent: activity.Event = {
  id: 'aud_0123456789ab',
  occurredAt: '2026-07-29T03:00:00.000Z',
  eventType: 'report.created',
  actorUserId: 'usr_0123456789ab',
  actorLabel: 'Alice Activity',
  actorEmail: 'alice@example.com',
  subjectType: 'report',
  subjectId: 'rpt_01234567',
  subjectLabel: 'Report #7',
  projectId: 'prj_01234567',
  projectLabel: 'Tower Refurbishment',
  requestId: 'request-report-1',
  metadata: { reportNumber: 7 },
};

const deletedEvent: activity.Event = {
  id: 'aud_123456789abc',
  occurredAt: '2026-07-29T02:00:00.000Z',
  eventType: 'user.signed_up',
  actorUserId: null,
  actorLabel: 'Deleted user',
  actorEmail: null,
  subjectType: 'user',
  subjectId: null,
  subjectLabel: 'Deleted user',
  projectId: null,
  projectLabel: null,
  requestId: null,
  metadata: { method: 'email_otp' },
};

function activityResponse(items: activity.Event[], nextCursor: string | null = null): Response {
  return new Response(JSON.stringify({ items, nextCursor }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  authMock.sessionState = {
    data: { user: { email: 'admin@example.com' } },
    isPending: false,
    refetch: authMock.refetchSession,
  };
  authMock.sendVerificationOtp.mockReset();
  authMock.signInEmailOtp.mockReset();
  authMock.signOut.mockReset();
  authMock.refetchSession.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('AdminActivity', () => {
  it('shows session loading before exposing auth or activity controls', () => {
    authMock.sessionState = {
      data: null,
      isPending: true,
      refetch: authMock.refetchSession,
    };

    render(<AdminActivity />);

    expect(screen.getByText('Checking admin session…')).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('completes the email-OTP sign-in flow without storing a bearer token', async () => {
    authMock.sessionState = {
      data: null,
      isPending: false,
      refetch: authMock.refetchSession,
    };
    authMock.sendVerificationOtp.mockResolvedValue({
      data: { success: true },
      error: null,
    });
    authMock.signInEmailOtp.mockResolvedValue({
      data: { user: { email: 'admin@example.com' } },
      error: null,
    });
    const user = userEvent.setup();
    render(<AdminActivity />);

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(authMock.sendVerificationOtp).toHaveBeenCalledWith({
      email: 'admin@example.com',
      type: 'sign-in',
    });

    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify code' }));
    expect(authMock.signInEmailOtp).toHaveBeenCalledWith({
      email: 'admin@example.com',
      otp: '123456',
    });
    expect(authMock.refetchSession).toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
  });

  it('renders, filters, paginates, and inspects the activity feed', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(activityResponse([reportEvent], 'next-page-cursor'))
      .mockResolvedValueOnce(activityResponse([reportEvent], 'next-page-cursor'))
      .mockResolvedValueOnce(activityResponse([deletedEvent]));
    const user = userEvent.setup();
    render(<AdminActivity />);

    expect(await screen.findByText('Tower Refurbishment')).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.test/admin/activity?limit=50');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'include',
    });

    await user.selectOptions(screen.getByLabelText('Event type'), 'report.created');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('eventType=report.created');

    fireEvent.click(screen.getByRole('button', { name: 'Load older' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('cursor=next-page-cursor');
    expect((await screen.findAllByText('Deleted user')).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Report #7/ }));
    expect(screen.getByRole('dialog').textContent).toContain('request-report-1');
    expect(screen.getByRole('dialog').textContent).toContain('"reportNumber": 7');
  });

  it('renders empty, forbidden, and retryable failure states', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(activityResponse([]))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(activityResponse([reportEvent]));
    const user = userEvent.setup();
    let view = render(<AdminActivity />);

    expect(await screen.findByText('No activity matches these filters.')).toBeTruthy();

    view.unmount();
    view = render(<AdminActivity />);
    expect(await screen.findByText('This account is not an admin.')).toBeTruthy();

    view.unmount();
    render(<AdminActivity />);
    expect(await screen.findByText('The activity feed is unavailable.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Tower Refurbishment')).toBeTruthy();
  });

  it('signs out through Better Auth', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(activityResponse([]));
    authMock.signOut.mockResolvedValue({
      data: { success: true },
      error: null,
    });
    const user = userEvent.setup();
    render(<AdminActivity />);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(authMock.signOut).toHaveBeenCalled();
    expect(authMock.refetchSession).toHaveBeenCalled();
  });
});
