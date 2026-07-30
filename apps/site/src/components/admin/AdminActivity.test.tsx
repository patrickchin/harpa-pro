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

const reportEvent = {
  id: 'aud_0123456789ab',
  occurredAt: '2026-07-29T03:00:00.000Z',
  level: 'milestone',
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
} as unknown as activity.Event;

const deletedEvent = {
  id: 'aud_123456789abc',
  occurredAt: '2026-07-29T02:00:00.000Z',
  level: 'milestone',
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
} as unknown as activity.Event;

const secondReportEvent = {
  ...reportEvent,
  id: 'aud_23456789abcd',
  occurredAt: '2026-07-29T01:00:00.000Z',
  actorUserId: 'usr_123456789abc',
  actorLabel: 'Bob Builder',
  actorEmail: 'bob@example.com',
  subjectId: 'rpt_12345678',
  subjectLabel: 'Report #8',
  projectId: 'prj_12345678',
  projectLabel: 'Riverside Offices',
  requestId: 'request-report-2',
  metadata: { reportNumber: 8 },
} as unknown as activity.Event;

const detailEvents = [
  {
    id: 'aud_3456789abcde',
    occurredAt: '2026-07-29T00:04:00.000Z',
    level: 'detail',
    eventType: 'note.text_created',
    actorUserId: 'usr_0123456789ab',
    actorLabel: 'Alice Activity',
    actorEmail: 'alice@example.com',
    subjectType: 'note',
    subjectId: 'not_0123456789',
    subjectLabel: 'Text note',
    projectId: 'prj_01234567',
    projectLabel: 'Tower Refurbishment',
    requestId: 'request-note-text',
    metadata: {},
  },
  {
    id: 'aud_456789abcdef',
    occurredAt: '2026-07-29T00:03:00.000Z',
    level: 'detail',
    eventType: 'note.voice_created',
    actorUserId: 'usr_0123456789ab',
    actorLabel: 'Alice Activity',
    actorEmail: 'alice@example.com',
    subjectType: 'note',
    subjectId: 'not_123456789a',
    subjectLabel: 'Voice note',
    projectId: 'prj_01234567',
    projectLabel: 'Tower Refurbishment',
    requestId: 'request-note-voice',
    metadata: {},
  },
  {
    id: 'aud_56789abcdef0',
    occurredAt: '2026-07-29T00:02:00.000Z',
    level: 'detail',
    eventType: 'note.image_created',
    actorUserId: 'usr_0123456789ab',
    actorLabel: 'Alice Activity',
    actorEmail: 'alice@example.com',
    subjectType: 'note',
    subjectId: 'not_23456789ab',
    subjectLabel: 'Image note',
    projectId: 'prj_01234567',
    projectLabel: 'Tower Refurbishment',
    requestId: 'request-note-image',
    metadata: {},
  },
  {
    id: 'aud_6789abcdef01',
    occurredAt: '2026-07-29T00:01:00.000Z',
    level: 'detail',
    eventType: 'note.document_created',
    actorUserId: 'usr_0123456789ab',
    actorLabel: 'Alice Activity',
    actorEmail: 'alice@example.com',
    subjectType: 'note',
    subjectId: 'not_3456789abc',
    subjectLabel: 'Document note',
    projectId: 'prj_01234567',
    projectLabel: 'Tower Refurbishment',
    requestId: 'request-note-document',
    metadata: {},
  },
] as unknown as activity.Event[];

function activityResponse(items: activity.Event[], nextCursor: string | null = null): Response {
  return new Response(JSON.stringify({ items, nextCursor }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function lastActivityUrl(fetchMock: ReturnType<typeof vi.spyOn>): URL {
  const request = fetchMock.mock.calls.at(-1)?.[0];
  if (!request) throw new Error('expected an activity request');
  return new URL(String(request));
}

function expectFromNear(actual: string | null, expected: Date): void {
  expect(actual).not.toBeNull();
  expect(Math.abs(new Date(actual!).getTime() - expected.getTime())).toBeLessThan(10_000);
}

function subtractCalendar(now: Date, amount: number, unit: 'day' | 'month' | 'year'): Date {
  const result = new Date(now);
  if (unit === 'day') result.setDate(result.getDate() - amount);
  if (unit === 'month') result.setMonth(result.getMonth() - amount);
  if (unit === 'year') result.setFullYear(result.getFullYear() - amount);
  return result;
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

  it('shows a retryable unavailable state when the session check fails', async () => {
    authMock.getSession.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null);
    const user = userEvent.setup();

    render(<AdminActivity />);

    expect(await screen.findByText('Admin sign-in is unavailable.')).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(authMock.getSession).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
  });

  it('signs in through the visible email/password form without using browser storage', async () => {
    authMock.getSession.mockResolvedValueOnce(null).mockResolvedValueOnce(adminSession);
    authMock.login.mockResolvedValue(adminSession);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(activityResponse([]));
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
    expect(
      await screen.findByText(`Signed in as ${adminSession.email}.`, { exact: false }),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('shows a generic error and clears the password after a failed login', async () => {
    authMock.getSession.mockResolvedValue(null);
    authMock.login.mockRejectedValue({
      code: 'invalid_credentials',
      message: 'disabled identity admin@harpapro.com does not exist',
    });
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

  it('distinguishes rate limiting and service failures from invalid credentials', async () => {
    authMock.getSession.mockResolvedValue(null);
    authMock.login
      .mockRejectedValueOnce({ code: 'rate_limited' })
      .mockRejectedValueOnce(new Error('network unavailable'));
    const user = userEvent.setup();
    render(<AdminActivity />);

    await user.type(await screen.findByLabelText('Email'), adminSession.email);
    const password = screen.getByLabelText('Password');
    await user.type(password, 'a sufficiently long admin password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Too many sign-in attempts. Wait a few minutes and try again.',
    );

    await user.type(password, 'another sufficiently long password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Admin sign-in is unavailable. Please try again.',
      ),
    );
  });

  it('requires the login cookie to establish a confirmed admin session', async () => {
    authMock.getSession.mockResolvedValue(null);
    authMock.login.mockResolvedValue(adminSession);
    const user = userEvent.setup();
    render(<AdminActivity />);

    await user.type(await screen.findByLabelText('Email'), adminSession.email);
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    await user.type(password, 'correct horse battery staple 123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Sign-in could not establish an admin session. Check that cookies are enabled and try again.',
    );
    expect(authMock.getSession).toHaveBeenCalledTimes(2);
    expect(password.value).toBe('');
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
    const initialUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(initialUrl.origin + initialUrl.pathname).toBe('https://api.example.test/admin/activity');
    expect(initialUrl.searchParams.get('limit')).toBe('50');
    expect(initialUrl.searchParams.get('level')).toBe('milestone');
    expect(initialUrl.searchParams.get('from')).not.toBeNull();
    expect(initialUrl.searchParams.has('to')).toBe(false);
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

  it('defaults to milestones from the past calendar month and offers simpler ranges', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(activityResponse([]));
    const user = userEvent.setup();
    const beforeRender = new Date();

    render(<AdminActivity />);

    await screen.findByText('No activity matches these filters.');
    const level = screen.getByLabelText('Detail level') as HTMLSelectElement;
    const period = screen.getByLabelText('Time period') as HTMLSelectElement;
    expect(level.value).toBe('milestone');
    expect(period.value).toBe('month');
    expect(screen.queryByLabelText('From')).toBeNull();
    expect(screen.queryByLabelText('To')).toBeNull();

    const initialUrl = lastActivityUrl(fetchMock);
    expect(initialUrl.searchParams.get('level')).toBe('milestone');
    expectFromNear(initialUrl.searchParams.get('from'), subtractCalendar(beforeRender, 1, 'month'));
    expect(initialUrl.searchParams.has('to')).toBe(false);

    const presets = [
      { label: 'Past week', amount: 7, unit: 'day' },
      { label: 'Past month', amount: 1, unit: 'month' },
      { label: 'Past 6 months', amount: 6, unit: 'month' },
      { label: 'Past year', amount: 1, unit: 'year' },
    ] as const;

    for (const preset of presets) {
      const callsBefore = fetchMock.mock.calls.length;
      await user.selectOptions(period, screen.getByRole('option', { name: preset.label }));
      const beforeApply = new Date();
      await user.click(screen.getByRole('button', { name: 'Apply filters' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(callsBefore + 1));

      const url = lastActivityUrl(fetchMock);
      expectFromNear(
        url.searchParams.get('from'),
        subtractCalendar(beforeApply, preset.amount, preset.unit),
      );
      expect(url.searchParams.has('to')).toBe(false);
    }

    const callsBeforeAll = fetchMock.mock.calls.length;
    await user.selectOptions(period, screen.getByRole('option', { name: 'All time' }));
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(callsBeforeAll + 1));
    expect(lastActivityUrl(fetchMock).searchParams.has('from')).toBe(false);
    expect(lastActivityUrl(fetchMock).searchParams.has('to')).toBe(false);
  });

  it('switches between milestone, detailed, and all activity levels', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(activityResponse([]));
    const user = userEvent.setup();
    render(<AdminActivity />);

    await screen.findByText('No activity matches these filters.');
    const level = screen.getByLabelText('Detail level');

    expect(screen.getByRole('option', { name: 'Milestones' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Detailed activity' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'All activity' })).toBeTruthy();

    await user.selectOptions(level, screen.getByRole('option', { name: 'Detailed activity' }));
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
      expect(lastActivityUrl(fetchMock).searchParams.get('level')).toBe('detail'),
    );

    await user.selectOptions(level, screen.getByRole('option', { name: 'All activity' }));
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(lastActivityUrl(fetchMock).searchParams.get('level')).toBe('all'));
  });

  it('shows all curated detail event labels and event-type options', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(activityResponse([]))
      .mockResolvedValueOnce(activityResponse(detailEvents));
    const user = userEvent.setup();
    render(<AdminActivity />);

    await screen.findByText('No activity matches these filters.');
    const eventType = screen.getByLabelText('Event type');
    expect(screen.getByRole('option', { name: 'Text note added' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Voice note added' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Image uploaded' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Document uploaded' })).toBeTruthy();

    await user.selectOptions(
      screen.getByLabelText('Detail level'),
      screen.getByRole('option', { name: 'All activity' }),
    );
    await user.selectOptions(eventType, screen.getByRole('option', { name: 'All events' }));
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(await screen.findByText('Text note added')).toBeTruthy();
    expect(screen.getByText('Voice note added')).toBeTruthy();
    expect(screen.getByText('Image uploaded')).toBeTruthy();
    expect(screen.getByText('Document uploaded')).toBeTruthy();
  });

  it('excludes multiple actors with removable chips and clears all exclusions', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(activityResponse([reportEvent, secondReportEvent]));
    const user = userEvent.setup();
    render(<AdminActivity />);

    await screen.findByRole('button', { name: 'Report #7' });
    await user.click(screen.getByRole('button', { name: 'Report #7' }));
    await user.click(screen.getByRole('button', { name: 'Exclude actor' }));
    expect(
      await screen.findByRole('button', { name: 'Remove Alice Activity exclusion' }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(lastActivityUrl(fetchMock).searchParams.get('excludeActorUserIds')).toBe(
        'usr_0123456789ab',
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Report #8' }));
    await user.click(screen.getByRole('button', { name: 'Exclude actor' }));
    expect(
      await screen.findByRole('button', { name: 'Remove Bob Builder exclusion' }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        lastActivityUrl(fetchMock).searchParams.get('excludeActorUserIds')?.split(','),
      ).toEqual(['usr_0123456789ab', 'usr_123456789abc']),
    );

    await user.click(screen.getByRole('button', { name: 'Remove Alice Activity exclusion' }));
    await waitFor(() =>
      expect(lastActivityUrl(fetchMock).searchParams.get('excludeActorUserIds')).toBe(
        'usr_123456789abc',
      ),
    );
    expect(screen.queryByRole('button', { name: 'Remove Alice Activity exclusion' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove Bob Builder exclusion' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Clear excluded actors' }));
    await waitFor(() =>
      expect(lastActivityUrl(fetchMock).searchParams.has('excludeActorUserIds')).toBe(false),
    );
    expect(screen.queryByRole('button', { name: /exclusion$/ })).toBeNull();
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
