// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const projectEvent = {
  id: 'aud_789abcdef012',
  occurredAt: '2026-07-29T03:05:00.000Z',
  level: 'milestone',
  eventType: 'project.created',
  actorUserId: 'usr_0123456789ab',
  actorLabel: 'Alice Activity',
  actorEmail: 'alice@example.com',
  subjectType: 'project',
  subjectId: 'prj_23456789',
  subjectLabel: 'Harbour Extension',
  projectId: 'prj_23456789',
  projectLabel: 'Harbour Extension',
  requestId: 'request-project-1',
  metadata: {},
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

function deferredResponse(): {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
} {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('blob read failed')));
    reader.readAsText(blob);
  });
}

function lastActivityUrl(fetchMock: { mock: { calls: Array<Array<unknown>> } }): URL {
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

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.get(key) ?? null;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };
}

function ensureStorage(name: 'localStorage' | 'sessionStorage'): Storage {
  const existing = window[name];
  if (existing) return existing;

  const storage = createMemoryStorage();
  Object.defineProperty(window, name, {
    configurable: true,
    value: storage,
  });
  return storage;
}

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:https://admin.example.test/activity-text-default'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  authMock.getSession.mockReset();
  authMock.getSession.mockResolvedValue(adminSession);
  authMock.login.mockReset();
  authMock.logout.mockReset();
  ensureStorage('localStorage').clear();
  ensureStorage('sessionStorage').clear();
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

  it('renders dense one-line entries, applies filters immediately, paginates, and inspects details', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(activityResponse([reportEvent], 'next-page-cursor'))
      .mockResolvedValueOnce(activityResponse([deletedEvent]));
    const user = userEvent.setup();
    render(<AdminActivity />);

    expect(await screen.findByTestId(`activity-row-${reportEvent.id}`)).toBeTruthy();
    const initialUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(initialUrl.origin + initialUrl.pathname).toBe('https://api.example.test/admin/activity');
    expect(initialUrl.searchParams.get('limit')).toBe('50');
    expect(initialUrl.searchParams.get('level')).toBe('milestone');
    expect(initialUrl.searchParams.get('from')).not.toBeNull();
    expect(initialUrl.searchParams.has('to')).toBe(false);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'include',
    });
    expect(screen.queryByRole('button', { name: 'Apply filters' })).toBeNull();
    const entry = screen.getByTestId(`activity-row-${reportEvent.id}`);
    expect(entry.className).toContain('whitespace-nowrap');
    expect(within(entry).getByText('Report created')).toBeTruthy();
    expect(within(entry).getByText('Alice Activity')).toBeTruthy();
    expect(within(entry).getByText('Report #7')).toBeTruthy();
    expect(within(entry).getByText('Tower Refurbishment')).toBeTruthy();
    expect(within(entry).getByTestId('event-icon-report.created').getAttribute('data-icon')).toBe(
      'file-plus-2',
    );
    expect(within(entry).getByTestId('event-icon-report.created').getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(within(entry).getByTestId('actor-icon').getAttribute('data-icon')).toBe('user');
    expect(within(entry).getByTestId('project-icon').getAttribute('data-icon')).toBe('folder');
    expect(entry.getAttribute('aria-label') ?? '').toContain(
      'Event: Report created. Actor: Alice Activity. Subject: Report #7. Project: Tower Refurbishment.',
    );
    const columnHeaders = screen.getByTestId('activity-column-headers');
    expect(Array.from(columnHeaders.children, (header) => header.textContent?.trim())).toEqual([
      'New',
      'Time',
      'Event',
      'User',
      'Subject',
      'Project',
    ]);
    expect(columnHeaders.getAttribute('aria-hidden')).toBeNull();
    expect(
      within(columnHeaders)
        .getByRole('button', { name: 'Filter by time' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
    expect(within(columnHeaders).getByRole('button', { name: 'Filter by event' })).toBeTruthy();
    expect(within(columnHeaders).getByRole('button', { name: 'Filter by user' })).toBeTruthy();
    expect(within(columnHeaders).getByRole('button', { name: 'Filter by project' })).toBeTruthy();
    expect(within(columnHeaders).queryByRole('button', { name: /new|subject/i })).toBeNull();
    expect(columnHeaders.className).toContain(
      'grid-cols-[3rem_8.5rem_10.5rem_12rem_12rem_minmax(12rem,1fr)]',
    );
    expect(entry.className).toContain(
      'grid-cols-[3rem_8.5rem_10.5rem_12rem_12rem_minmax(12rem,1fr)]',
    );
    expect(screen.queryByRole('columnheader')).toBeNull();
    expect(screen.queryByLabelText('Event type')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Load older' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('cursor=next-page-cursor');
    expect((await screen.findAllByText('Deleted user')).length).toBeGreaterThan(0);
    const deletedEntry = screen.getByTestId(`activity-row-${deletedEvent.id}`);
    expect(
      within(deletedEntry).getByTestId('event-icon-user.signed_up').getAttribute('data-icon'),
    ).toBe('user-plus');
    expect(within(deletedEntry).getByTestId('project-icon').getAttribute('data-icon')).toBe(
      'folder',
    );
    expect(deletedEntry.getAttribute('aria-label') ?? '').toContain('Project: No project.');

    await user.click(screen.getByTestId(`activity-row-${reportEvent.id}`));
    expect(screen.getByRole('dialog').textContent).toContain('request-report-1');
    expect(screen.getByRole('dialog').textContent).toContain('"reportNumber": 7');
  });

  it('defaults to milestones from the past calendar month and offers simpler ranges', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(activityResponse([]));
    const user = userEvent.setup();
    const beforeRender = new Date();

    render(<AdminActivity />);

    await screen.findByText('No activity matches these filters.');
    const header = screen.getByTestId('activity-column-headers');
    const timeTrigger = within(header).getByRole('button', { name: 'Filter by time' });
    expect(timeTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('group', { name: 'Time period' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Detail level' })).toBeNull();
    expect(screen.queryByLabelText('Filter actor')).toBeNull();
    expect(screen.queryByLabelText('Exclude actor')).toBeNull();
    expect(screen.queryByLabelText('Filter project')).toBeNull();

    await user.click(timeTrigger);
    const timeRegion = screen.getByRole('region', { name: 'Time filter' });
    const period = within(timeRegion).getByRole('group', { name: 'Time period' });
    expect(timeTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(within(period).getByRole('radio', { name: 'Past month' })).toHaveProperty(
      'checked',
      true,
    );
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
      await user.click(within(period).getByRole('radio', { name: preset.label }));
      const beforeApply = new Date();
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(callsBefore + 1));

      const url = lastActivityUrl(fetchMock);
      expectFromNear(
        url.searchParams.get('from'),
        subtractCalendar(beforeApply, preset.amount, preset.unit),
      );
      expect(url.searchParams.has('to')).toBe(false);
    }

    const callsBeforeAll = fetchMock.mock.calls.length;
    await user.click(within(period).getByRole('radio', { name: 'All time' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(callsBeforeAll + 1));
    expect(lastActivityUrl(fetchMock).searchParams.has('from')).toBe(false);
    expect(lastActivityUrl(fetchMock).searchParams.has('to')).toBe(false);
  });

  it('switches between milestone, detailed, and all activity levels', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(activityResponse([]));
    const user = userEvent.setup();
    render(<AdminActivity />);

    await screen.findByText('No activity matches these filters.');
    await user.click(screen.getByRole('button', { name: 'Filter by event' }));
    const level = within(screen.getByRole('region', { name: 'Event filter' })).getByRole('group', {
      name: 'Detail level',
    });
    const milestones = within(level).getByRole('radio', { name: 'Milestones' });
    const detailed = within(level).getByRole('radio', { name: 'Detailed activity' });
    const all = within(level).getByRole('radio', { name: 'All activity' });

    expect(milestones).toHaveProperty('checked', true);
    await user.click(detailed);
    await waitFor(() =>
      expect(lastActivityUrl(fetchMock).searchParams.get('level')).toBe('detail'),
    );
    expect(detailed).toHaveProperty('checked', true);

    await user.click(all);
    await waitFor(() => expect(lastActivityUrl(fetchMock).searchParams.get('level')).toBe('all'));
    expect(all).toHaveProperty('checked', true);
  });

  it('does not expose or send an event-type filter', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(activityResponse([]));
    const user = userEvent.setup();
    render(<AdminActivity />);

    await screen.findByText('No activity matches these filters.');
    expect(screen.queryByLabelText('Event type')).toBeNull();
    expect(lastActivityUrl(fetchMock).searchParams.has('eventType')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Filter by event' }));
    await user.click(
      within(screen.getByRole('group', { name: 'Detail level' })).getByRole('radio', {
        name: 'All activity',
      }),
    );
    await waitFor(() => expect(lastActivityUrl(fetchMock).searchParams.get('level')).toBe('all'));
    expect(lastActivityUrl(fetchMock).searchParams.has('eventType')).toBe(false);
  });

  it('shows all curated detail event labels', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(activityResponse([]))
      .mockResolvedValueOnce(activityResponse(detailEvents));
    const user = userEvent.setup();
    render(<AdminActivity />);

    await screen.findByText('No activity matches these filters.');
    await user.click(screen.getByRole('button', { name: 'Filter by event' }));
    await user.click(
      within(screen.getByRole('group', { name: 'Detail level' })).getByRole('radio', {
        name: 'All activity',
      }),
    );

    const feed = await screen.findByRole('list', { name: 'Activity events' });
    expect(within(feed).getByText('Text note added')).toBeTruthy();
    expect(within(feed).getByText('Voice note added')).toBeTruthy();
    expect(within(feed).getByText('Image uploaded')).toBeTruthy();
    expect(within(feed).getByText('Document uploaded')).toBeTruthy();
    expect(within(feed).getByTestId('event-icon-note.text_created').getAttribute('data-icon')).toBe(
      'message-square-text',
    );
    expect(
      within(feed).getByTestId('event-icon-note.voice_created').getAttribute('data-icon'),
    ).toBe('mic');
    expect(
      within(feed).getByTestId('event-icon-note.image_created').getAttribute('data-icon'),
    ).toBe('image');
    expect(
      within(feed).getByTestId('event-icon-note.document_created').getAttribute('data-icon'),
    ).toBe('file-text');
  });

  it('opens one attached filter region at a time and keeps it usable for empty results', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(activityResponse([]));
    const user = userEvent.setup();
    render(<AdminActivity />);

    await screen.findByText('No activity matches these filters.');
    const header = screen.getByTestId('activity-column-headers');
    const timeTrigger = within(header).getByRole('button', { name: 'Filter by time' });
    const eventTrigger = within(header).getByRole('button', { name: 'Filter by event' });
    const userTrigger = within(header).getByRole('button', { name: 'Filter by user' });
    const projectTrigger = within(header).getByRole('button', { name: 'Filter by project' });

    await user.click(timeTrigger);
    expect(screen.getByRole('region', { name: 'Time filter' })).toBeTruthy();
    expect(timeTrigger.getAttribute('aria-expanded')).toBe('true');

    await user.click(eventTrigger);
    expect(screen.queryByRole('region', { name: 'Time filter' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Event filter' })).toBeTruthy();
    expect(timeTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(eventTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getAllByRole('region', { name: /^(?:Time|Event|User|Project) filter$/ }),
    ).toHaveLength(1);

    await user.click(userTrigger);
    expect(screen.queryByRole('region', { name: 'Event filter' })).toBeNull();
    expect(screen.getByRole('region', { name: 'User filter' })).toBeTruthy();
    await user.click(projectTrigger);
    expect(screen.queryByRole('region', { name: 'User filter' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Project filter' })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('searches users and applies include-only and multiple excludes without contradictions', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => activityResponse([reportEvent, secondReportEvent]));
    const user = userEvent.setup();
    render(<AdminActivity />);

    await screen.findByTestId(`activity-row-${reportEvent.id}`);
    await user.click(screen.getByRole('button', { name: 'Filter by user' }));
    const userRegion = screen.getByRole('region', { name: 'User filter' });
    const search = within(userRegion).getByRole('searchbox', { name: 'Search users' });
    const includedUsers = within(userRegion).getByRole('group', { name: 'Included users' });
    const aliceLabel = 'Alice Activity — alice@example.com';
    const bobLabel = 'Bob Builder — bob@example.com';

    expect(within(includedUsers).getByRole('radio', { name: 'All users' })).toHaveProperty(
      'checked',
      true,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    const requestsBeforeSearch = fetchMock.mock.calls.length;
    await user.type(search, 'bob');
    expect(within(includedUsers).queryByRole('radio', { name: `Only ${aliceLabel}` })).toBeNull();
    expect(within(includedUsers).getByRole('radio', { name: `Only ${bobLabel}` })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(requestsBeforeSearch);
    await user.clear(search);

    await user.click(within(userRegion).getByRole('checkbox', { name: `Exclude ${aliceLabel}` }));
    await waitFor(() =>
      expect(lastActivityUrl(fetchMock).searchParams.get('excludeActorUserIds')).toBe(
        'usr_0123456789ab',
      ),
    );

    await user.click(within(userRegion).getByRole('checkbox', { name: `Exclude ${bobLabel}` }));
    await waitFor(() =>
      expect(
        lastActivityUrl(fetchMock).searchParams.get('excludeActorUserIds')?.split(','),
      ).toEqual(['usr_0123456789ab', 'usr_123456789abc']),
    );

    await user.click(within(includedUsers).getByRole('radio', { name: `Only ${aliceLabel}` }));
    await waitFor(() => {
      const url = lastActivityUrl(fetchMock);
      expect(url.searchParams.get('actorUserId')).toBe(reportEvent.actorUserId);
      expect(url.searchParams.get('excludeActorUserIds')).toBe(secondReportEvent.actorUserId);
    });
    expect(
      within(userRegion).getByRole('checkbox', { name: `Exclude ${aliceLabel}` }),
    ).toHaveProperty('checked', false);

    await user.click(within(userRegion).getByRole('checkbox', { name: `Exclude ${aliceLabel}` }));
    await waitFor(() => {
      const url = lastActivityUrl(fetchMock);
      expect(url.searchParams.has('actorUserId')).toBe(false);
      expect(url.searchParams.get('excludeActorUserIds')?.split(',').sort()).toEqual(
        [reportEvent.actorUserId!, secondReportEvent.actorUserId!].sort(),
      );
    });
    expect(within(includedUsers).getByRole('radio', { name: 'All users' })).toHaveProperty(
      'checked',
      true,
    );
  });

  it('searches projects locally and applies an only-project choice immediately', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => activityResponse([reportEvent, secondReportEvent]));
    const user = userEvent.setup();
    render(<AdminActivity />);

    await screen.findByTestId(`activity-row-${reportEvent.id}`);
    await user.click(screen.getByRole('button', { name: 'Filter by project' }));
    const projectRegion = screen.getByRole('region', { name: 'Project filter' });
    const search = within(projectRegion).getByRole('searchbox', { name: 'Search projects' });
    const requestsBeforeSearch = fetchMock.mock.calls.length;

    await user.type(search, 'riverside');
    expect(
      within(projectRegion).queryByRole('radio', { name: 'Only Tower Refurbishment' }),
    ).toBeNull();
    const riverside = within(projectRegion).getByRole('radio', {
      name: 'Only Riverside Offices',
    });
    expect(fetchMock).toHaveBeenCalledTimes(requestsBeforeSearch);

    await user.click(riverside);
    await waitFor(() =>
      expect(lastActivityUrl(fetchMock).searchParams.get('projectId')).toBe(
        secondReportEvent.projectId,
      ),
    );
  });

  it('marks only events discovered by a manual refresh as new in this browser session', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(activityResponse([reportEvent]))
      .mockResolvedValueOnce(activityResponse([projectEvent, reportEvent]))
      .mockResolvedValueOnce(activityResponse([projectEvent, reportEvent]));
    const user = userEvent.setup();
    render(<AdminActivity />);

    await screen.findByTestId(`activity-row-${reportEvent.id}`);
    const feed = screen.getByRole('list', { name: 'Activity events' });
    expect(within(feed).queryByText('New')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    const newEntry = await screen.findByTestId(`activity-row-${projectEvent.id}`);
    expect(within(newEntry).getByText('New')).toBeTruthy();
    expect(
      within(newEntry).getByTestId('event-icon-project.created').getAttribute('data-icon'),
    ).toBe('folder-plus');
    expect(
      within(screen.getByTestId(`activity-row-${reportEvent.id}`)).queryByText('New'),
    ).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('1 new event since last refresh.');
    expect(lastActivityUrl(fetchMock).searchParams.get('level')).toBe('milestone');

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('No new events since last refresh.'),
    );
    expect(within(feed).queryByText('New')).toBeNull();
  });

  it('reenables refresh when an automatic filter request supersedes it', async () => {
    const pendingRefresh = deferredResponse();
    const nextRefresh = deferredResponse();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(activityResponse([reportEvent]))
      .mockReturnValueOnce(pendingRefresh.promise)
      .mockResolvedValueOnce(activityResponse([reportEvent]))
      .mockReturnValueOnce(nextRefresh.promise);
    const user = userEvent.setup();
    render(<AdminActivity />);

    await screen.findByTestId(`activity-row-${reportEvent.id}`);
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    await user.click(refresh);
    expect(refresh).toHaveProperty('disabled', true);

    await user.click(
      within(screen.getByRole('group', { name: 'Time period' })).getByRole('radio', {
        name: 'Past week',
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await screen.findByTestId(`activity-row-${reportEvent.id}`);
    expect(refresh).toHaveProperty('disabled', false);

    await user.click(refresh);
    expect(refresh).toHaveProperty('disabled', true);
    pendingRefresh.resolve(activityResponse([projectEvent, reportEvent]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(refresh).toHaveProperty('disabled', true);

    nextRefresh.resolve(activityResponse([reportEvent]));
    await waitFor(() => expect(refresh).toHaveProperty('disabled', false));
  });

  it('ignores a stale response after a newer automatic filter request finishes', async () => {
    const pendingInitial = deferredResponse();
    vi.spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(pendingInitial.promise)
      .mockResolvedValueOnce(activityResponse(detailEvents));
    const user = userEvent.setup();
    render(<AdminActivity />);

    await user.click(
      within(await screen.findByRole('group', { name: 'Detail level' })).getByRole('radio', {
        name: 'Detailed activity',
      }),
    );
    expect(await screen.findByTestId(`activity-row-${detailEvents[0]!.id}`)).toBeTruthy();

    pendingInitial.resolve(activityResponse([reportEvent]));
    await waitFor(() => expect(screen.queryByTestId(`activity-row-${reportEvent.id}`)).toBeNull());
    expect(screen.getByTestId(`activity-row-${detailEvents[0]!.id}`)).toBeTruthy();
  });

  it('opens the currently loaded filtered events as a plain-text browser document', async () => {
    const createObjectUrl = vi.mocked(URL.createObjectURL);
    createObjectUrl.mockReturnValue('blob:https://admin.example.test/activity-text');
    const revokeObjectUrl = vi.mocked(URL.revokeObjectURL);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(activityResponse([reportEvent]));

    const view = render(<AdminActivity />);

    const textLink = await screen.findByRole('link', { name: 'Open as text' });
    expect(textLink.getAttribute('href')).toBe('blob:https://admin.example.test/activity-text');
    expect(textLink.getAttribute('target')).toBe('_blank');
    expect(textLink.getAttribute('type')).toBe('text/plain');
    expect(createObjectUrl).toHaveBeenCalledOnce();

    const blob = createObjectUrl.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('text/plain;charset=utf-8');
    const text = await readBlobText(blob);
    expect(text).toContain(
      '2026-07-29T03:00:00.000Z\treport.created\tAlice Activity\talice@example.com',
    );
    expect(text).toContain('Tower Refurbishment\tReport #7');
    expect(text.split('\n').filter((line) => line.includes(reportEvent.id))).toHaveLength(1);

    view.unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:https://admin.example.test/activity-text');
  });

  it('hides and revokes a stale text export while replacement filters load', async () => {
    const pendingFilter = deferredResponse();
    const revokeObjectUrl = vi.mocked(URL.revokeObjectURL);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(activityResponse([reportEvent]))
      .mockReturnValueOnce(pendingFilter.promise);
    const user = userEvent.setup();
    render(<AdminActivity />);

    expect(await screen.findByRole('link', { name: 'Open as text' })).toBeTruthy();
    await user.click(
      within(screen.getByRole('group', { name: 'Time period' })).getByRole('radio', {
        name: 'Past week',
      }),
    );

    expect(screen.queryByRole('link', { name: 'Open as text' })).toBeNull();
    await waitFor(() =>
      expect(revokeObjectUrl).toHaveBeenCalledWith(
        'blob:https://admin.example.test/activity-text-default',
      ),
    );

    pendingFilter.resolve(activityResponse([projectEvent]));
    expect(await screen.findByRole('link', { name: 'Open as text' })).toBeTruthy();
  });

  it('keeps keyboard focus inside event details and returns it to the row', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(activityResponse([reportEvent]));
    const user = userEvent.setup();
    render(<AdminActivity />);

    const row = await screen.findByTestId(`activity-row-${reportEvent.id}`);
    await user.click(row);

    const dialog = await screen.findByRole('dialog');
    const close = within(dialog).getByRole('button', { name: 'Close' });
    await waitFor(() => expect(document.activeElement).toBe(close));

    await user.tab();
    expect(document.activeElement).toBe(close);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(row);
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
    expect(await screen.findByTestId(`activity-row-${reportEvent.id}`)).toBeTruthy();
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
