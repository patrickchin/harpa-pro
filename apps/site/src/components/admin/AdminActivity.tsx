import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { activity as activitySchemas } from '@harpa/api-contract';
import type { activity } from '@harpa/api-contract';
import { adminAuthClient } from '../../lib/admin-auth';
import type { AdminSession } from '../../lib/admin-auth';
import { getPublicEnv } from '../../lib/env';

type FeedState = 'loading' | 'ready' | 'forbidden' | 'error';
type ActivityLevel = 'milestone' | 'detail' | 'all';
type TimePeriod = 'week' | 'month' | 'six_months' | 'year' | 'all';
type SessionState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: AdminSession };

type RefetchSession = () => Promise<AdminSession | null>;

interface ActorExclusion {
  id: string;
  label: string;
}

interface ActorOption extends ActorExclusion {
  email: string | null;
}

interface ProjectOption {
  id: string;
  label: string;
}

interface Filters {
  level: ActivityLevel;
  timePeriod: TimePeriod;
  eventType: '' | activity.EventType;
  actorUserId: string;
  projectId: string;
  excludedActors: ActorExclusion[];
}

const EMPTY_FILTERS: Filters = {
  level: 'milestone',
  timePeriod: 'month',
  eventType: '',
  actorUserId: '',
  projectId: '',
  excludedActors: [],
};

const MAX_EXCLUDED_ACTORS = 20;

const inputClass =
  'h-10 rounded-md border border-hairline bg-card px-3 text-sm text-ink outline-none ring-focus';
const buttonClass =
  'inline-flex h-10 items-center justify-center rounded-md border border-hairline bg-card px-4 text-sm font-medium text-ink shadow-sm transition hover:bg-secondary ring-focus disabled:cursor-not-allowed disabled:opacity-60';
const primaryButtonClass =
  'inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm transition hover:brightness-95 ring-focus disabled:cursor-not-allowed disabled:opacity-60';

const EVENT_LABELS = {
  'user.signed_up': 'Signed up',
  'project.created': 'Project created',
  'report.created': 'Report created',
  'note.text_created': 'Text note added',
  'note.voice_created': 'Voice note added',
  'note.image_created': 'Image uploaded',
  'note.document_created': 'Document uploaded',
} satisfies Record<activity.EventType, string>;

const EVENT_OPTIONS = activitySchemas.eventTypes.map((value) => ({
  value,
  label: EVENT_LABELS[value],
  level: activitySchemas.eventRegistry[value].level,
}));

function eventOptionsForLevel(level: ActivityLevel) {
  if (level === 'all') return EVENT_OPTIONS;
  return EVENT_OPTIONS.filter((option) => option.level === level);
}

function eventLabel(eventType: activity.EventType): string {
  return EVENT_LABELS[eventType];
}

const EVENT_ROW_ACCENTS = {
  'user.signed_up': 'border-l-chart-4',
  'project.created': 'border-l-chart-2',
  'report.created': 'border-l-chart-3',
  'note.text_created': 'border-l-primary/35',
  'note.voice_created': 'border-l-chart-5',
  'note.image_created': 'border-l-chart-2/60',
  'note.document_created': 'border-l-chart-4/70',
} satisfies Record<activity.EventType, string>;

type ActivityIconName =
  | 'user-plus'
  | 'folder-plus'
  | 'file-plus-2'
  | 'message-square-text'
  | 'mic'
  | 'image'
  | 'file-text'
  | 'user'
  | 'folder';

const EVENT_ICON_NAMES = {
  'user.signed_up': 'user-plus',
  'project.created': 'folder-plus',
  'report.created': 'file-plus-2',
  'note.text_created': 'message-square-text',
  'note.voice_created': 'mic',
  'note.image_created': 'image',
  'note.document_created': 'file-text',
} satisfies Record<activity.EventType, ActivityIconName>;

const EVENT_ICON_TONES = {
  'user.signed_up': 'text-chart-4',
  'project.created': 'text-chart-2',
  'report.created': 'text-chart-3',
  'note.text_created': 'text-primary/70',
  'note.voice_created': 'text-chart-5',
  'note.image_created': 'text-chart-2',
  'note.document_created': 'text-chart-4',
} satisfies Record<activity.EventType, string>;

const ACTIVITY_ICON_GLYPHS = {
  'user-plus': (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" x2="19" y1="8" y2="14" />
      <line x1="22" x2="16" y1="11" y2="11" />
    </>
  ),
  'folder-plus': (
    <>
      <path d="M12 10v6" />
      <path d="M9 13h6" />
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </>
  ),
  'file-plus-2': (
    <>
      <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M3 15h6" />
      <path d="M6 12v6" />
    </>
  ),
  'message-square-text': (
    <>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M13 8H7" />
      <path d="M17 12H7" />
    </>
  ),
  mic: (
    <>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </>
  ),
  image: (
    <>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </>
  ),
  'file-text': (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </>
  ),
  user: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  folder: (
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  ),
} satisfies Record<ActivityIconName, ReactNode>;

function ActivityIcon({
  name,
  className,
  testId,
}: {
  name: ActivityIconName;
  className: string;
  testId: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      data-icon={name}
      data-testid={testId}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {ACTIVITY_ICON_GLYPHS[name]}
    </svg>
  );
}

function fromForTimePeriod(period: TimePeriod, now = new Date()): string | null {
  if (period === 'all') return null;

  const from = new Date(now);
  if (period === 'week') from.setDate(from.getDate() - 7);
  if (period === 'month') from.setMonth(from.getMonth() - 1);
  if (period === 'six_months') from.setMonth(from.getMonth() - 6);
  if (period === 'year') from.setFullYear(from.getFullYear() - 1);
  return from.toISOString();
}

function displayTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function activityRowLabel(event: activity.Event, isNew: boolean): string {
  return [
    isNew ? 'New activity.' : null,
    `Event: ${eventLabel(event.eventType)}.`,
    `Actor: ${event.actorLabel}.`,
    `Subject: ${event.subjectLabel}.`,
    `Project: ${event.projectLabel ?? 'No project'}.`,
    `Occurred at ${displayTime(event.occurredAt)}.`,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');
}

function oneLineField(value: string | null): string {
  return (value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}

function activityTextLine(event: activity.Event): string {
  return [
    event.occurredAt,
    event.eventType,
    oneLineField(event.actorLabel),
    oneLineField(event.actorEmail),
    oneLineField(event.projectLabel),
    oneLineField(event.subjectLabel),
    event.id,
    event.actorUserId ?? '',
    event.projectId ?? '',
    event.subjectId ?? '',
    event.requestId ?? '',
    JSON.stringify(event.metadata),
  ].join('\t');
}

function actorOptionLabel(actor: ActorOption): string {
  return actor.email ? `${actor.label} — ${actor.email}` : actor.label;
}

function signInErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if (error.code === 'invalid_credentials') return 'Invalid email or password.';
    if (error.code === 'rate_limited') {
      return 'Too many sign-in attempts. Wait a few minutes and try again.';
    }
  }

  return 'Admin sign-in is unavailable. Please try again.';
}

const SESSION_NOT_ESTABLISHED =
  'Sign-in could not establish an admin session. Check that cookies are enabled and try again.';

function SignIn({ refetchSession }: { refetchSession: RefetchSession }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    let loginSucceeded = false;
    try {
      await adminAuthClient.login({
        email: email.trim().toLowerCase(),
        password,
      });
      loginSucceeded = true;
      const confirmedSession = await refetchSession();
      if (!confirmedSession) setError(SESSION_NOT_ESTABLISHED);
    } catch (cause) {
      setError(loginSucceeded ? SESSION_NOT_ESTABLISHED : signInErrorMessage(cause));
    } finally {
      setPassword('');
      setPending(false);
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-ink">Private admin</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">Sign in to activity</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Use your provisioned @harpapro.com admin email and password.
      </p>

      <form className="mt-6 grid gap-4" onSubmit={signIn}>
        <label className="grid gap-1.5 text-sm font-medium text-ink">
          Email
          <input
            className={inputClass}
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            pattern="[^\s@]+@harpapro\.com"
            required
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value.toLowerCase())}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-ink">
          Password
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            minLength={20}
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className={primaryButtonClass} disabled={pending} type="submit">
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {error && (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function ActivityFeed({
  email,
  refetchSession,
}: {
  email: string;
  refetchSession: RefetchSession;
}) {
  const { apiBaseUrl } = getPublicEnv();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [items, setItems] = useState<activity.Event[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<FeedState>('loading');
  const [selected, setSelected] = useState<activity.Event | null>(null);
  const [knownActors, setKnownActors] = useState<ActorOption[]>([]);
  const [knownProjects, setKnownProjects] = useState<ProjectOption[]>([]);
  const [newEventIds, setNewEventIds] = useState<Set<string>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [textUrl, setTextUrl] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);
  const activeRefreshSequenceRef = useRef<number | null>(null);
  const baselineEventIdsRef = useRef<Set<string>>(new Set());
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeDetailsRef = useRef<HTMLButtonElement | null>(null);

  const rememberFilterOptions = useCallback((events: activity.Event[]) => {
    setKnownActors((current) => {
      const byId = new Map(current.map((actor) => [actor.id, actor]));
      for (const event of events) {
        if (!event.actorUserId) continue;
        byId.set(event.actorUserId, {
          id: event.actorUserId,
          label: event.actorLabel,
          email: event.actorEmail,
        });
      }
      return [...byId.values()].sort((left, right) => left.label.localeCompare(right.label));
    });
    setKnownProjects((current) => {
      const byId = new Map(current.map((project) => [project.id, project]));
      for (const event of events) {
        if (!event.projectId || !event.projectLabel) continue;
        byId.set(event.projectId, {
          id: event.projectId,
          label: event.projectLabel,
        });
      }
      return [...byId.values()].sort((left, right) => left.label.localeCompare(right.label));
    });
  }, []);

  const load = useCallback(
    async (mode: 'replace' | 'append' | 'refresh', cursor: string | null) => {
      const requestSequence = ++requestSequenceRef.current;
      if (mode === 'replace') {
        setState('loading');
        setItems([]);
        setNextCursor(null);
        setNewEventIds(new Set());
        setRefreshMessage(null);
      }
      if (mode !== 'refresh') {
        activeRefreshSequenceRef.current = null;
        setRefreshing(false);
      }
      if (mode === 'refresh') {
        activeRefreshSequenceRef.current = requestSequence;
        setRefreshing(true);
        setRefreshMessage(null);
      }

      try {
        const params = new URLSearchParams({ limit: '50' });
        if (cursor) params.set('cursor', cursor);
        params.set('level', filters.level);
        if (filters.eventType) {
          params.set('eventType', filters.eventType);
        }
        if (filters.actorUserId) {
          params.set('actorUserId', filters.actorUserId);
        }
        if (filters.excludedActors.length > 0) {
          params.set(
            'excludeActorUserIds',
            filters.excludedActors.map((actor) => actor.id).join(','),
          );
        }
        if (filters.projectId) {
          params.set('projectId', filters.projectId);
        }
        const from = fromForTimePeriod(filters.timePeriod);
        if (from) params.set('from', from);

        const response = await fetch(`${apiBaseUrl}/admin/activity?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (requestSequence !== requestSequenceRef.current) return;
        if (response.status === 401) {
          await refetchSession();
          if (requestSequence !== requestSequenceRef.current) return;
          setState('error');
          return;
        }
        if (response.status === 403) {
          setState('forbidden');
          return;
        }
        if (!response.ok) throw new Error(`activity request ${response.status}`);

        const parsed = activitySchemas.listResponse.parse(await response.json());
        if (requestSequence !== requestSequenceRef.current) return;
        rememberFilterOptions(parsed.items);

        if (mode === 'append') {
          setItems((current) => {
            const existingIds = new Set(current.map((event) => event.id));
            return [...current, ...parsed.items.filter((event) => !existingIds.has(event.id))];
          });
          baselineEventIdsRef.current = new Set([
            ...baselineEventIdsRef.current,
            ...parsed.items.map((event) => event.id),
          ]);
        } else {
          const incomingIds = new Set(parsed.items.map((event) => event.id));
          if (mode === 'refresh') {
            const nextNewIds = new Set(
              parsed.items
                .filter((event) => !baselineEventIdsRef.current.has(event.id))
                .map((event) => event.id),
            );
            setNewEventIds(nextNewIds);
            setRefreshMessage(
              nextNewIds.size === 0
                ? 'No new events since last refresh.'
                : `${nextNewIds.size} new event${nextNewIds.size === 1 ? '' : 's'} since last refresh.`,
            );
          } else {
            setNewEventIds(new Set());
          }
          baselineEventIdsRef.current = incomingIds;
          setItems(parsed.items);
        }

        setNextCursor(parsed.nextCursor);
        setState('ready');
      } catch {
        if (requestSequence === requestSequenceRef.current) setState('error');
      } finally {
        if (mode === 'refresh' && activeRefreshSequenceRef.current === requestSequence) {
          activeRefreshSequenceRef.current = null;
          setRefreshing(false);
        }
      }
    },
    [apiBaseUrl, filters, refetchSession, rememberFilterOptions],
  );

  function addExcludedActor(actor: ActorExclusion) {
    const add = (current: Filters): Filters => {
      if (
        current.excludedActors.length >= MAX_EXCLUDED_ACTORS ||
        current.excludedActors.some((excluded) => excluded.id === actor.id)
      ) {
        return current;
      }
      return {
        ...current,
        excludedActors: [...current.excludedActors, actor],
      };
    };

    setFilters(add);
  }

  function removeExcludedActor(actorUserId: string) {
    const remove = (current: Filters): Filters => ({
      ...current,
      excludedActors: current.excludedActors.filter((actor) => actor.id !== actorUserId),
    });

    setFilters(remove);
  }

  function clearExcludedActors() {
    const clear = (current: Filters): Filters => ({
      ...current,
      excludedActors: [],
    });

    setFilters(clear);
  }

  useEffect(() => {
    setSelected(null);
    void load('replace', null);
  }, [load]);

  useEffect(() => {
    if (!selected) return;

    const trigger = selectedTriggerRef.current;
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelected(null);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        closeDetailsRef.current?.focus();
      }
    };

    closeDetailsRef.current?.focus();
    document.addEventListener('keydown', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', keepFocusInside);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [selected]);

  const visibleEventOptions = useMemo(() => eventOptionsForLevel(filters.level), [filters.level]);
  const availableActorExclusions = useMemo(
    () =>
      knownActors.filter(
        (actor) => !filters.excludedActors.some((excluded) => excluded.id === actor.id),
      ),
    [filters.excludedActors, knownActors],
  );
  const textContents = useMemo(
    () => (state === 'ready' ? items.map(activityTextLine).join('\n') : ''),
    [items, state],
  );

  useEffect(() => {
    if (!textContents) {
      setTextUrl(null);
      return;
    }

    const url = URL.createObjectURL(
      new Blob([textContents], {
        type: 'text/plain;charset=utf-8',
      }),
    );
    setTextUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [textContents]);

  async function signOut() {
    try {
      await adminAuthClient.logout();
    } finally {
      await refetchSession();
    }
  }

  return (
    <section>
      <div className="flex flex-col gap-4 border-b border-hairline pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-ink">
            Business activity
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">
            Harpa Pro activity
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Signed in as {email}. Activity is recorded from this feature's deployment onward.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state === 'ready' && textUrl && (
            <a
              className={buttonClass}
              href={textUrl}
              rel="noreferrer"
              target="_blank"
              type="text/plain"
            >
              Open as text
            </a>
          )}
          <button
            className={buttonClass}
            disabled={refreshing || state === 'loading'}
            type="button"
            onClick={() => void load('refresh', null)}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className={buttonClass} type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>

      <section className="my-4 rounded-xl border border-hairline bg-card p-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Detail level
            <select
              className={inputClass}
              value={filters.level}
              onChange={(event) =>
                setFilters((current) => {
                  const level = event.target.value as ActivityLevel;
                  if (current.level === level) return current;
                  const nextEventOptions = eventOptionsForLevel(level);
                  const eventType =
                    current.eventType &&
                    !nextEventOptions.some((option) => option.value === current.eventType)
                      ? ''
                      : current.eventType;
                  return {
                    ...current,
                    level,
                    eventType,
                  };
                })
              }
            >
              <option value="milestone">Milestones</option>
              <option value="detail">Detailed activity</option>
              <option value="all">All activity</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Event type
            <select
              className={inputClass}
              value={filters.eventType}
              onChange={(event) => {
                const eventType = event.target.value as Filters['eventType'];
                setFilters((current) =>
                  current.eventType === eventType ? current : { ...current, eventType },
                );
              }}
            >
              <option value="">All events</option>
              {(filters.level === 'milestone' || filters.level === 'all') && (
                <optgroup label="Milestones">
                  {visibleEventOptions
                    .filter((option) => option.level === 'milestone')
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </optgroup>
              )}
              {(filters.level === 'detail' || filters.level === 'all') && (
                <optgroup label="Detailed activity">
                  {visibleEventOptions
                    .filter((option) => option.level === 'detail')
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Time period
            <select
              className={inputClass}
              value={filters.timePeriod}
              onChange={(event) => {
                const timePeriod = event.target.value as TimePeriod;
                setFilters((current) =>
                  current.timePeriod === timePeriod ? current : { ...current, timePeriod },
                );
              }}
            >
              <option value="week">Past week</option>
              <option value="month">Past month</option>
              <option value="six_months">Past 6 months</option>
              <option value="year">Past year</option>
              <option value="all">All time</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              className={buttonClass}
              type="button"
              onClick={() => setFilters({ ...EMPTY_FILTERS, excludedActors: [] })}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 border-t border-hairline pt-3 md:grid-cols-3">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Filter actor
            <select
              className={inputClass}
              value={filters.actorUserId}
              onChange={(event) => {
                const actorUserId = event.target.value;
                setFilters((current) =>
                  current.actorUserId === actorUserId ? current : { ...current, actorUserId },
                );
              }}
            >
              <option value="">All actors</option>
              {knownActors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actorOptionLabel(actor)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Exclude actor
            <select
              className={inputClass}
              disabled={
                filters.excludedActors.length >= MAX_EXCLUDED_ACTORS ||
                availableActorExclusions.length === 0
              }
              value=""
              onChange={(event) => {
                const actor = knownActors.find((option) => option.id === event.target.value);
                if (actor) addExcludedActor(actor);
              }}
            >
              <option value="">Choose actor…</option>
              {availableActorExclusions.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actorOptionLabel(actor)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Filter project
            <select
              className={inputClass}
              value={filters.projectId}
              onChange={(event) => {
                const projectId = event.target.value;
                setFilters((current) =>
                  current.projectId === projectId ? current : { ...current, projectId },
                );
              }}
            >
              <option value="">All projects</option>
              {knownProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filters.excludedActors.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Excluded actors
            </span>
            {filters.excludedActors.map((actor) => (
              <span
                className="inline-flex h-8 items-center gap-1 rounded-full border border-hairline bg-secondary pl-3 pr-1 text-xs font-medium text-ink"
                key={actor.id}
              >
                {actor.label}
                <button
                  aria-label={`Remove ${actor.label} exclusion`}
                  className="inline-flex size-6 items-center justify-center rounded-full text-ink-soft hover:bg-card hover:text-ink ring-focus"
                  type="button"
                  onClick={() => removeExcludedActor(actor.id)}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              className="text-xs font-medium text-accent-ink underline underline-offset-4 ring-focus"
              type="button"
              onClick={clearExcludedActors}
            >
              Clear excluded actors
            </button>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-soft">Selections apply immediately.</p>
      </section>

      {refreshMessage && (
        <p className="mb-3 text-xs font-medium text-ink-soft" role="status">
          {refreshMessage}
        </p>
      )}

      {state === 'loading' && (
        <div className="rounded-xl border border-hairline bg-card p-10 text-center text-sm text-ink-soft">
          Loading activity…
        </div>
      )}
      {state === 'forbidden' && (
        <div className="rounded-xl border border-hairline bg-card p-10 text-center">
          <h2 className="font-semibold text-ink">This account is not an admin.</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Sign out and use an account with Harpa Pro admin access.
          </p>
        </div>
      )}
      {state === 'error' && (
        <div className="rounded-xl border border-hairline bg-card p-10 text-center">
          <h2 className="font-semibold text-ink">The activity feed is unavailable.</h2>
          <button
            className={`${buttonClass} mt-4`}
            type="button"
            onClick={() => void load('replace', null)}
          >
            Retry
          </button>
        </div>
      )}
      {state === 'ready' && items.length === 0 && (
        <div className="rounded-xl border border-hairline bg-card p-10 text-center text-sm text-ink-soft">
          No activity matches these filters.
        </div>
      )}
      {state === 'ready' && items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-hairline bg-card shadow-sm">
            <ul aria-label="Activity events">
              {items.map((event) => {
                const isNew = newEventIds.has(event.id);
                return (
                  <li
                    className={`border-b border-l-4 border-hairline last:border-b-0 ${EVENT_ROW_ACCENTS[event.eventType]} ${
                      isNew ? 'bg-accent/10' : ''
                    }`}
                    key={event.id}
                  >
                    <button
                      aria-label={activityRowLabel(event, isNew)}
                      className="grid min-h-9 w-full min-w-[920px] grid-cols-[3rem_8.5rem_10.5rem_12rem_12rem_minmax(12rem,1fr)] items-center gap-3 whitespace-nowrap px-3 py-1.5 text-left text-xs transition hover:bg-secondary/70 ring-focus"
                      data-testid={`activity-row-${event.id}`}
                      type="button"
                      onClick={(clickEvent) => {
                        selectedTriggerRef.current = clickEvent.currentTarget;
                        setSelected(event);
                      }}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wide text-accent-ink">
                        {isNew ? 'New' : ''}
                      </span>
                      <time
                        className="font-mono text-[11px] tabular-nums text-ink-soft"
                        dateTime={event.occurredAt}
                      >
                        {displayTime(event.occurredAt)}
                      </time>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                        <ActivityIcon
                          className={`size-3.5 shrink-0 ${EVENT_ICON_TONES[event.eventType]}`}
                          name={EVENT_ICON_NAMES[event.eventType]}
                          testId={`event-icon-${event.eventType}`}
                        />
                        {eventLabel(event.eventType)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                        <ActivityIcon
                          className="size-3.5 shrink-0 text-ink-soft"
                          name="user"
                          testId="actor-icon"
                        />
                        {event.actorLabel}
                      </span>
                      <span className="font-medium text-accent-ink">{event.subjectLabel}</span>
                      <span className="inline-flex items-center gap-1.5 text-ink-soft">
                        <ActivityIcon
                          className="size-3.5 shrink-0"
                          name="folder"
                          testId="project-icon"
                        />
                        <span>{event.projectLabel ?? '—'}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <button
                className={buttonClass}
                type="button"
                onClick={() => void load('append', nextCursor)}
              >
                Load older
              </button>
            </div>
          )}
        </>
      )}

      {selected && (
        <div
          aria-labelledby="activity-detail-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-end bg-foreground/20 p-3 sm:p-6"
          role="dialog"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelected(null);
          }}
        >
          <section className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-hairline bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-accent-ink">
                  {eventLabel(selected.eventType)}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-ink" id="activity-detail-title">
                  {selected.subjectLabel}
                </h2>
              </div>
              <button
                className={buttonClass}
                ref={closeDetailsRef}
                type="button"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="font-medium text-ink">Event ID</dt>
              <dd className="break-all text-ink-soft">{selected.id}</dd>
              <dt className="font-medium text-ink">Occurred</dt>
              <dd className="break-all text-ink-soft">{selected.occurredAt}</dd>
              <dt className="font-medium text-ink">Actor</dt>
              <dd className="break-all text-ink-soft">
                {selected.actorEmail
                  ? `${selected.actorLabel} — ${selected.actorEmail}`
                  : selected.actorLabel}
              </dd>
              <dt className="font-medium text-ink">Actor ID</dt>
              <dd className="break-all text-ink-soft">{selected.actorUserId ?? 'Deleted'}</dd>
              <dt className="font-medium text-ink">Subject ID</dt>
              <dd className="break-all text-ink-soft">{selected.subjectId ?? 'Deleted'}</dd>
              <dt className="font-medium text-ink">Project ID</dt>
              <dd className="break-all text-ink-soft">{selected.projectId ?? '—'}</dd>
              <dt className="font-medium text-ink">Request ID</dt>
              <dd className="break-all text-ink-soft">{selected.requestId ?? '—'}</dd>
            </dl>
            <pre className="mt-5 overflow-x-auto rounded-lg bg-secondary p-4 text-xs text-ink">
              {JSON.stringify(selected.metadata, null, 2)}
            </pre>
          </section>
        </div>
      )}
    </section>
  );
}

export default function AdminActivity() {
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'loading' });

  const refetchSession = useCallback(async () => {
    const next = await adminAuthClient.getSession();
    setSessionState(next ? { status: 'signed-in', session: next } : { status: 'signed-out' });
    return next;
  }, []);

  const checkSession = useCallback(async () => {
    setSessionState({ status: 'loading' });
    try {
      await refetchSession();
    } catch {
      setSessionState({ status: 'unavailable' });
    }
  }, [refetchSession]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  if (sessionState.status === 'loading') {
    return (
      <div className="rounded-xl border border-hairline bg-card p-10 text-center text-sm text-ink-soft">
        Checking admin session…
      </div>
    );
  }
  if (sessionState.status === 'unavailable') {
    return (
      <section className="mx-auto max-w-md rounded-2xl border border-hairline bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Admin sign-in is unavailable.</h1>
        <p className="mt-2 text-sm text-ink-soft">
          The admin session could not be checked. Try again when the service is available.
        </p>
        <button className={`${buttonClass} mt-4`} type="button" onClick={() => void checkSession()}>
          Retry
        </button>
      </section>
    );
  }
  if (sessionState.status === 'signed-out') {
    return <SignIn refetchSession={refetchSession} />;
  }

  return <ActivityFeed email={sessionState.session.email} refetchSession={refetchSession} />;
}
