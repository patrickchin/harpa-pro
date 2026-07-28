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
import { getPublicEnv } from '../../lib/env';

type FeedState = 'loading' | 'ready' | 'forbidden' | 'error';

interface Filters {
  eventType: '' | activity.EventType;
  from: string;
  to: string;
  actorUserId: string;
  projectId: string;
}

const EMPTY_FILTERS: Filters = {
  eventType: '',
  from: '',
  to: '',
  actorUserId: '',
  projectId: '',
};

const inputClass =
  'h-10 rounded-md border border-hairline bg-card px-3 text-sm text-ink outline-none ring-focus';
const buttonClass =
  'inline-flex h-10 items-center justify-center rounded-md border border-hairline bg-card px-4 text-sm font-medium text-ink shadow-sm transition hover:bg-secondary ring-focus disabled:cursor-not-allowed disabled:opacity-60';
const primaryButtonClass =
  'inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm transition hover:brightness-95 ring-focus disabled:cursor-not-allowed disabled:opacity-60';

function eventLabel(eventType: activity.EventType): string {
  if (eventType === 'user.signed_up') return 'Signed up';
  if (eventType === 'project.created') return 'Project created';
  return 'Report created';
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function SignIn({ refetchSession }: { refetchSession: () => Promise<unknown> }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await adminAuthClient.emailOtp.sendVerificationOtp({
      email: email.trim().toLowerCase(),
      type: 'sign-in',
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? 'Unable to send a code.');
      return;
    }
    setCodeSent(true);
  }

  async function verifyCode(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await adminAuthClient.signIn.emailOtp({
      email: email.trim().toLowerCase(),
      otp: code.trim(),
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? 'That code could not be verified.');
      return;
    }
    await refetchSession();
  }

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-ink">Private admin</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">Sign in to activity</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Use the email address on your Harpa Pro admin account.
      </p>

      {!codeSent ? (
        <form className="mt-6 grid gap-4" onSubmit={sendCode}>
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Email
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button className={primaryButtonClass} disabled={pending} type="submit">
            {pending ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form className="mt-6 grid gap-4" onSubmit={verifyCode}>
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Verification code
            <input
              className={inputClass}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button className={primaryButtonClass} disabled={pending} type="submit">
            {pending ? 'Verifying…' : 'Verify code'}
          </button>
          <button
            className="text-sm text-ink-soft underline underline-offset-4"
            type="button"
            onClick={() => {
              setCodeSent(false);
              setCode('');
              setError(null);
            }}
          >
            Use a different email
          </button>
        </form>
      )}

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
  refetchSession: () => Promise<unknown>;
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
        if (appliedFilters.eventType) {
          params.set('eventType', appliedFilters.eventType);
        }
        if (appliedFilters.actorUserId) {
          params.set('actorUserId', appliedFilters.actorUserId);
        }
        if (appliedFilters.projectId) {
          params.set('projectId', appliedFilters.projectId);
        }
        const from = toIso(appliedFilters.from);
        const to = toIso(appliedFilters.to);
        if (from) params.set('from', from);
        if (to) params.set('to', to);

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
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  async function signOut() {
    await adminAuthClient.signOut();
    await refetchSession();
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
            <option value="user.signed_up">Signed up</option>
            <option value="project.created">Project created</option>
            <option value="report.created">Report created</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          From
          <input
            className={inputClass}
            type="datetime-local"
            value={filters.from}
            onChange={(event) =>
              setFilters((current) => ({ ...current, from: event.target.value }))
            }
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          To
          <input
            className={inputClass}
            type="datetime-local"
            value={filters.to}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
          />
        </label>
        <div className="flex items-end gap-2">
          <button className={primaryButtonClass} type="submit">
            Apply filters
          </button>
          <button
            className={buttonClass}
            type="button"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setAppliedFilters(EMPTY_FILTERS);
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
  const session = adminAuthClient.useSession();

  if (session.isPending) {
    return (
      <div className="rounded-xl border border-hairline bg-card p-10 text-center text-sm text-ink-soft">
        Checking admin session…
      </div>
    );
  }
  if (!session.data) return <SignIn refetchSession={session.refetch} />;

  return <ActivityFeed email={session.data.user.email} refetchSession={session.refetch} />;
}
