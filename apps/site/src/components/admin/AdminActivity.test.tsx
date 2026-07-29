// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { activity } from '@harpa/api-contract';

const authMock = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  };
});

vi.mock('../../lib/admin-auth', () => ({
  adminAuthClient: authMock,
}));

vi.mock('../../lib/env', () => ({
  getPublicEnv: () => ({
    apiBaseUrl: 'https://api.example.test',
    turnstileSiteKey: 'test-site-key',
  }),
}));

import AdminActivity from './AdminActivity';

const adminSession = {
  authenticated: true as const,
  email: 'admin@harpapro.com',
};

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
  authMock.getSession.mockReset();
  authMock.getSession.mockResolvedValue(adminSession);
  authMock.login.mockReset();
  authMock.logout.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('AdminActivity', () => {
  it('shows session loading before exposing auth or activity controls', () => {
    authMock.getSession.mockImplementation(() => new Promise(() => {}));

    render(<AdminActivity />);

    expect(authMock.getSession).toHaveBeenCalledOnce();
    expect(screen.getByText('Checking admin session…')).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('signs in through the visible email/password form without using browser storage', async () => {
    authMock.getSession.mockResolvedValue(null);
    authMock.login.mockResolvedValue(adminSession);
    const user = userEvent.setup();
    render(<AdminActivity />);

    const email = (await screen.findByLabelText('Email')) as HTMLInputElement;
    const password = screen.getByLabelText('Password') as HTMLInputElement;

    expect(password.type).toBe('password');
    expect(password.autocomplete).toBe('current-password');
    expect(screen.getAllByRole('button', { name: 'Sign in' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Send code' })).toBeNull();
    expect(screen.queryByLabelText('Verification code')).toBeNull();

    await user.type(email, 'admin@example.com');
    expect(email.checkValidity()).toBe(false);
    await user.clear(email);
    await user.type(email, 'admin@harpapro.com.evil');
    expect(email.checkValidity()).toBe(false);
    await user.clear(email);
    await user.type(email, adminSession.email);
    expect(email.checkValidity()).toBe(true);

    await user.type(password, 'correct horse battery staple 123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(authMock.login).toHaveBeenCalledWith({
      email: adminSession.email,
      password: 'correct horse battery staple 123',
    });
    await waitFor(() => expect(authMock.getSession).toHaveBeenCalledTimes(2));
    expect(password.value).toBe('');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('shows a generic error and clears the password after a failed login', async () => {
    authMock.getSession.mockResolvedValue(null);
    authMock.login.mockRejectedValue(
      new Error('disabled identity admin@harpapro.com does not exist'),
    );
    const user = userEvent.setup();
    render(<AdminActivity />);

    await user.type(await screen.findByLabelText('Email'), adminSession.email);
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    await user.type(password, 'wrong password that must disappear');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Invalid email or password.');
    expect(screen.getByRole('alert').textContent).not.toContain('disabled');
    expect(password.value).toBe('');
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toHaveProperty('disabled', true);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
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

  it('revokes the dedicated admin session and returns to the sign-in form', async () => {
    authMock.getSession.mockResolvedValueOnce(adminSession).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(activityResponse([]));
    authMock.logout.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<AdminActivity />);

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(authMock.logout).toHaveBeenCalledOnce();
    await waitFor(() => expect(authMock.getSession).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });
});
