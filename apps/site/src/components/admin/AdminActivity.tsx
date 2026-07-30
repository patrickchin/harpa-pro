import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
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

function fromForTimePeriod(period: TimePeriod, now = new Date()): string | null {
  if (period === 'all') return null;

  const from = new Date(now);
  if (period === 'week') from.setDate(from.getDate() - 7);
  if (period === 'month') from.setMonth(from.getMonth() - 1);
  if (period === 'six_months') from.setMonth(from.getMonth() - 6);
  if (period === 'year') from.setFullYear(from.getFullYear() - 1);
  return from.toISOString();
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

const columnHelper = createColumnHelper<activity.Event>();

function ActivityFeed({
  email,
  refetchSession,
}: {
  email: string;
  refetchSession: RefetchSession;
}) {
  const { apiBaseUrl } = getPublicEnv();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [items, setItems] = useState<activity.Event[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<FeedState>('loading');
  const [selected, setSelected] = useState<activity.Event | null>(null);

  const load = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (!append) setState('loading');
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (cursor) params.set('cursor', cursor);
        params.set('level', appliedFilters.level);
        if (appliedFilters.eventType) {
          params.set('eventType', appliedFilters.eventType);
        }
        if (appliedFilters.actorUserId) {
          params.set('actorUserId', appliedFilters.actorUserId);
        }
        if (appliedFilters.excludedActors.length > 0) {
          params.set(
            'excludeActorUserIds',
            appliedFilters.excludedActors.map((actor) => actor.id).join(','),
          );
        }
        if (appliedFilters.projectId) {
          params.set('projectId', appliedFilters.projectId);
        }
        const from = fromForTimePeriod(appliedFilters.timePeriod);
        if (from) params.set('from', from);

        const response = await fetch(`${apiBaseUrl}/admin/activity?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (response.status === 401) {
          await refetchSession();
          setState('error');
          return;
        }
        if (response.status === 403) {
          setState('forbidden');
          return;
        }
        if (!response.ok) throw new Error(`activity request ${response.status}`);

        const parsed = activitySchemas.listResponse.parse(await response.json());
        setItems((current) => (append ? [...current, ...parsed.items] : parsed.items));
        setNextCursor(parsed.nextCursor);
        setState('ready');
      } catch {
        setState('error');
      }
    },
    [apiBaseUrl, appliedFilters, refetchSession],
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
    setAppliedFilters(add);
    setSelected(null);
  }

  function removeExcludedActor(actorUserId: string) {
    const remove = (current: Filters): Filters => ({
      ...current,
      excludedActors: current.excludedActors.filter((actor) => actor.id !== actorUserId),
    });

    setFilters(remove);
    setAppliedFilters(remove);
  }

  function clearExcludedActors() {
    const clear = (current: Filters): Filters => ({
      ...current,
      excludedActors: [],
    });

    setFilters(clear);
    setAppliedFilters(clear);
  }

  useEffect(() => {
    void load(null, false);
  }, [load]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('occurredAt', {
        header: 'Time',
        cell: (info) =>
          new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(info.getValue())),
      }),
      columnHelper.accessor('eventType', {
        header: 'Event',
        cell: (info) => eventLabel(info.getValue()),
      }),
      columnHelper.accessor('actorLabel', {
        header: 'Actor',
        cell: (info) => (
          <span>
            <span className="block font-medium text-ink">{info.getValue()}</span>
            {info.row.original.actorEmail && (
              <span className="block text-xs text-ink-soft">{info.row.original.actorEmail}</span>
            )}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'project',
        header: 'Project',
        cell: (info) => info.row.original.projectLabel ?? '—',
      }),
      columnHelper.accessor('subjectLabel', {
        header: 'Subject',
        cell: (info) => (
          <button
            className="font-medium text-accent-ink underline decoration-transparent underline-offset-4 hover:decoration-current ring-focus"
            type="button"
            onClick={() => setSelected(info.row.original)}
          >
            {info.getValue()}
          </button>
        ),
      }),
    ],
    [],
  );
  const visibleEventOptions = useMemo(() => eventOptionsForLevel(filters.level), [filters.level]);
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

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
        <button className={buttonClass} type="button" onClick={signOut}>
          Sign out
        </button>
      </div>

      <form
        className="my-5 grid gap-3 rounded-xl border border-hairline bg-card p-4 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSelected(null);
          setAppliedFilters({ ...filters });
        }}
      >
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Detail level
          <select
            className={inputClass}
            value={filters.level}
            onChange={(event) =>
              setFilters((current) => {
                const level = event.target.value as ActivityLevel;
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
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                eventType: event.target.value as Filters['eventType'],
              }))
            }
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
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                timePeriod: event.target.value as TimePeriod,
              }))
            }
          >
            <option value="week">Past week</option>
            <option value="month">Past month</option>
            <option value="six_months">Past 6 months</option>
            <option value="year">Past year</option>
            <option value="all">All time</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button className={primaryButtonClass} type="submit">
            Apply filters
          </button>
          <button
            className={buttonClass}
            type="button"
            onClick={() => {
              setFilters({ ...EMPTY_FILTERS, excludedActors: [] });
              setAppliedFilters({ ...EMPTY_FILTERS, excludedActors: [] });
              setSelected(null);
            }}
          >
            Clear
          </button>
        </div>
        {(filters.actorUserId || filters.projectId) && (
          <div className="md:col-span-4 flex flex-wrap gap-2 text-xs text-ink-soft">
            {filters.actorUserId && <span>Actor: {filters.actorUserId}</span>}
            {filters.projectId && <span>Project: {filters.projectId}</span>}
          </div>
        )}
        {filters.excludedActors.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 md:col-span-4">
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
      </form>

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
            onClick={() => void load(null, false)}
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
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-secondary text-xs uppercase tracking-wide text-ink-soft">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th className="border-b border-hairline px-4 py-3" key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr className="border-b border-hairline last:border-0" key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td className="px-4 py-3 align-top text-ink-soft" key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <button
                className={buttonClass}
                type="button"
                onClick={() => void load(nextCursor, true)}
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
              <button className={buttonClass} type="button" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="font-medium text-ink">Event ID</dt>
              <dd className="break-all text-ink-soft">{selected.id}</dd>
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
            <div className="mt-5 flex flex-wrap gap-2">
              {selected.actorUserId && (
                <>
                  <button
                    className={buttonClass}
                    type="button"
                    onClick={() => {
                      const next = {
                        ...filters,
                        actorUserId: selected.actorUserId ?? '',
                      };
                      setFilters(next);
                      setAppliedFilters(next);
                      setSelected(null);
                    }}
                  >
                    Filter by actor
                  </button>
                  <button
                    className={buttonClass}
                    disabled={
                      filters.excludedActors.length >= MAX_EXCLUDED_ACTORS ||
                      filters.excludedActors.some((actor) => actor.id === selected.actorUserId)
                    }
                    type="button"
                    onClick={() =>
                      addExcludedActor({
                        id: selected.actorUserId!,
                        label: selected.actorLabel,
                      })
                    }
                  >
                    Exclude actor
                  </button>
                </>
              )}
              {selected.projectId && (
                <button
                  className={buttonClass}
                  type="button"
                  onClick={() => {
                    const next = {
                      ...filters,
                      projectId: selected.projectId ?? '',
                    };
                    setFilters(next);
                    setAppliedFilters(next);
                    setSelected(null);
                  }}
                >
                  Filter by project
                </button>
              )}
            </div>
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
