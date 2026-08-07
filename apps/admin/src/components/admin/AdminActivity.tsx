import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { activity as activitySchemas } from '@harpa/api-contract';
import type { activity } from '@harpa/api-contract';
import { adminAuthClient } from '../../lib/admin-auth';
import type { AdminSession } from '../../lib/admin-auth';
import { getPublicEnv } from '../../lib/env';

type FeedState = 'loading' | 'ready' | 'forbidden' | 'error';
type ActivityLevel = 'milestone' | 'detail' | 'all';
type TimePeriod = 'week' | 'month' | 'six_months' | 'year' | 'all';
type HeaderFilter = 'user' | 'project';
type SessionState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: AdminSession };

type RefetchSession = () => Promise<AdminSession | null>;

interface ActorExclusion {
  id: string;
  label: string | null;
  state: activity.EntityState;
}

interface ActorOption extends ActorExclusion {
  email: string | null;
}

interface ProjectOption {
  id: string;
  label: string | null;
  state: activity.EntityState;
}

interface Filters {
  level: ActivityLevel;
  timePeriod: TimePeriod;
  actorUserId: string;
  projectId: string;
  excludedActors: ActorExclusion[];
}

interface PopupPosition {
  left: number;
  top: number;
  width: number;
}

const EMPTY_FILTERS: Filters = {
  level: 'milestone',
  timePeriod: 'month',
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
const activityColumnsClass =
  'grid w-full min-w-[920px] grid-cols-[3rem_8.5rem_10.5rem_12rem_12rem_minmax(12rem,1fr)] items-center gap-3 px-3';
const FILTER_PANEL_ID = 'activity-header-filter-panel';

const EVENT_LABELS = {
  'user.signed_up': 'Signed up',
  'project.created': 'Project created',
  'report.created': 'Report created',
  'note.text_created': 'Text note added',
  'note.voice_created': 'Voice note added',
  'note.image_created': 'Image uploaded',
  'note.document_created': 'Document uploaded',
} satisfies Record<activity.EventType, string>;

function eventLabel(eventType: activity.EventType): string {
  return EVENT_LABELS[eventType];
}

type EntityKind = activity.Event['subjectType'];

function deletedEntityPlaceholder(kind: EntityKind): string {
  return `[deleted ${kind}]`;
}

function displayEntityLabel(
  kind: EntityKind,
  value: string | null,
  state: activity.EntityState,
): string {
  if (state === 'deleted') return deletedEntityPlaceholder(kind);
  return value ?? `Unknown ${kind}`;
}

function accessibleEntityLabel(
  kind: EntityKind,
  value: string | null,
  state: activity.EntityState,
): string {
  return state === 'deleted' ? `deleted ${kind} (unavailable)` : (value ?? `Unknown ${kind}`);
}

function EntityLabel({
  kind,
  value,
  state,
  className = '',
}: {
  kind: EntityKind;
  value: string | null;
  state: activity.EntityState;
  className?: string;
}) {
  const deleted = state === 'deleted';
  return (
    <span
      className={[className, deleted ? 'font-normal italic text-ink-soft' : '']
        .filter(Boolean)
        .join(' ')}
      data-entity-placeholder={deleted ? 'deleted' : undefined}
    >
      {displayEntityLabel(kind, value, state)}
    </span>
  );
}

const DETAIL_LEVEL_OPTIONS = [
  { value: 'milestone', label: 'Milestones' },
  { value: 'detail', label: 'Detailed activity' },
  { value: 'all', label: 'All activity' },
] satisfies ReadonlyArray<{ value: ActivityLevel; label: string }>;

const TIME_PERIOD_OPTIONS = [
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
  { value: 'six_months', label: 'Past 6 months' },
  { value: 'year', label: 'Past year' },
  { value: 'all', label: 'All time' },
] satisfies ReadonlyArray<{ value: TimePeriod; label: string }>;

function filterChoiceClass(selected: boolean): string {
  return `flex h-8 w-full items-center justify-center rounded-md px-2.5 text-xs font-semibold whitespace-nowrap transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
    selected
      ? 'bg-accent text-accent-foreground shadow-sm'
      : 'text-ink-soft hover:bg-card hover:text-ink'
  }`;
}

function filterListChoiceClass(selected: boolean): string {
  return `flex min-h-9 w-full items-center rounded-md border px-3 py-2 text-left text-xs font-medium transition peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
    selected
      ? 'border-accent/50 bg-accent/10 text-ink'
      : 'border-hairline bg-card text-ink-soft hover:border-accent/30 hover:bg-secondary/60 hover:text-ink'
  }`;
}

function HeaderFilterButton({
  activeCount,
  filter,
  label,
  openFilter,
  onToggle,
}: {
  activeCount: number;
  filter: HeaderFilter;
  label: string;
  openFilter: HeaderFilter | null;
  onToggle: (filter: HeaderFilter, trigger: HTMLButtonElement) => void;
}) {
  const expanded = openFilter === filter;
  const activeDescriptionId = `activity-${filter}-filter-status`;
  return (
    <button
      aria-controls={expanded ? FILTER_PANEL_ID : undefined}
      aria-describedby={activeCount > 0 ? activeDescriptionId : undefined}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      aria-label={`Filter by ${filter}`}
      className={`inline-flex h-8 w-full items-center gap-1.5 rounded px-1 text-left transition ring-focus ${
        expanded ? 'bg-accent/10 text-accent-ink' : 'hover:bg-card hover:text-ink'
      }`}
      data-activity-filter-trigger={filter}
      type="button"
      onClick={(event) => onToggle(filter, event.currentTarget)}
    >
      <span>{label}</span>
      {activeCount > 0 && (
        <>
          <span
            aria-hidden="true"
            className="inline-flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] leading-4 text-accent-foreground"
          >
            {activeCount}
          </span>
          <span className="sr-only" id={activeDescriptionId}>
            {activeCount} active {label.toLocaleLowerCase()} filter
            {activeCount === 1 ? '' : 's'}
          </span>
        </>
      )}
      <svg
        aria-hidden="true"
        className="size-3 shrink-0"
        fill="none"
        focusable="false"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M4 5h16l-6.5 7.5V19l-3 1v-7.5Z" />
      </svg>
    </button>
  );
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
    `Actor: ${accessibleEntityLabel('user', event.actorLabel, event.actorState)}.`,
    `Subject: ${accessibleEntityLabel(event.subjectType, event.subjectLabel, event.subjectState)}.`,
    `Project: ${
      event.projectState === 'none'
        ? 'No project'
        : accessibleEntityLabel('project', event.projectLabel, event.projectState)
    }.`,
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
    oneLineField(displayEntityLabel('user', event.actorLabel, event.actorState)),
    oneLineField(event.actorEmail),
    oneLineField(
      event.projectState === 'none'
        ? null
        : displayEntityLabel('project', event.projectLabel, event.projectState),
    ),
    oneLineField(displayEntityLabel(event.subjectType, event.subjectLabel, event.subjectState)),
    event.id,
    event.actorUserId ?? '',
    event.projectId ?? '',
    event.subjectId ?? '',
    event.requestId ?? '',
    JSON.stringify(event.metadata),
  ].join('\t');
}

function actorIdentityLabel(actor: ActorOption): string {
  const emailOrId = actor.email ?? actor.id;
  return actor.state === 'deleted' && actor.email ? `${actor.id} — ${actor.email}` : emailOrId;
}

function actorOptionLabel(actor: ActorOption): string {
  return `${displayEntityLabel('user', actor.label, actor.state)} — ${actorIdentityLabel(actor)}`;
}

function projectOptionLabel(project: ProjectOption): string {
  return `${displayEntityLabel('project', project.label, project.state)} — ${project.id}`;
}

function compareLabels(
  leftLabel: string,
  rightLabel: string,
  leftId: string,
  rightId: string,
): number {
  const labelOrder = leftLabel.localeCompare(rightLabel);
  return labelOrder !== 0 ? labelOrder : leftId.localeCompare(rightId);
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
  const [openFilter, setOpenFilter] = useState<HeaderFilter | null>(null);
  const [popupPosition, setPopupPosition] = useState<PopupPosition>({
    left: 8,
    top: 8,
    width: 400,
  });
  const [userSearch, setUserSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
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
  const popupRef = useRef<HTMLElement | null>(null);
  const popupTriggerRef = useRef<HTMLButtonElement | null>(null);
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
          state: event.actorState,
        });
      }
      return [...byId.values()].sort((left, right) =>
        compareLabels(
          displayEntityLabel('user', left.label, left.state),
          displayEntityLabel('user', right.label, right.state),
          left.id,
          right.id,
        ),
      );
    });
    setKnownProjects((current) => {
      const byId = new Map(current.map((project) => [project.id, project]));
      for (const event of events) {
        if (!event.projectId || event.projectState === 'none') continue;
        byId.set(event.projectId, {
          id: event.projectId,
          label: event.projectLabel,
          state: event.projectState,
        });
      }
      return [...byId.values()].sort((left, right) =>
        compareLabels(
          displayEntityLabel('project', left.label, left.state),
          displayEntityLabel('project', right.label, right.state),
          left.id,
          right.id,
        ),
      );
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

  function selectIncludedActor(actorUserId: string) {
    setFilters((current) => {
      const excludedActors = actorUserId
        ? current.excludedActors.filter((actor) => actor.id !== actorUserId)
        : current.excludedActors;
      if (
        current.actorUserId === actorUserId &&
        excludedActors.length === current.excludedActors.length
      ) {
        return current;
      }
      return { ...current, actorUserId, excludedActors };
    });
  }

  function toggleActorExclusion(actor: ActorExclusion, checked: boolean) {
    setFilters((current) => {
      const alreadyExcluded = current.excludedActors.some((excluded) => excluded.id === actor.id);
      if (checked) {
        if (alreadyExcluded || current.excludedActors.length >= MAX_EXCLUDED_ACTORS) {
          return current;
        }
        return {
          ...current,
          actorUserId: current.actorUserId === actor.id ? '' : current.actorUserId,
          excludedActors: [...current.excludedActors, actor],
        };
      }
      if (!alreadyExcluded) return current;
      return {
        ...current,
        excludedActors: current.excludedActors.filter((excluded) => excluded.id !== actor.id),
      };
    });
  }

  function toggleHeaderFilter(filter: HeaderFilter, trigger: HTMLButtonElement) {
    popupTriggerRef.current = trigger;
    setOpenFilter((current) => (current === filter ? null : filter));
  }

  function closeHeaderFilter(restoreFocus: boolean) {
    const trigger = popupTriggerRef.current;
    setOpenFilter(null);
    if (restoreFocus && trigger?.isConnected) trigger.focus();
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

  const positionHeaderFilter = useCallback(() => {
    if (!openFilter || !popupTriggerRef.current) return;

    const viewportPadding = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const preferredWidth = openFilter === 'user' ? 440 : 400;
    const width = Math.max(0, Math.min(preferredWidth, viewportWidth - viewportPadding * 2));
    const triggerBounds = popupTriggerRef.current.getBoundingClientRect();
    const popupHeight = Math.min(
      popupRef.current?.offsetHeight ?? 480,
      viewportHeight - viewportPadding * 2,
    );
    const maximumLeft = Math.max(viewportPadding, viewportWidth - width - viewportPadding);
    const left = Math.min(Math.max(viewportPadding, triggerBounds.left), maximumLeft);
    const belowTop = triggerBounds.bottom + viewportPadding;
    const aboveTop = triggerBounds.top - popupHeight - viewportPadding;
    const maximumTop = Math.max(viewportPadding, viewportHeight - popupHeight - viewportPadding);
    const top =
      belowTop + popupHeight <= viewportHeight - viewportPadding
        ? belowTop
        : aboveTop >= viewportPadding
          ? aboveTop
          : Math.min(Math.max(viewportPadding, belowTop), maximumTop);

    setPopupPosition((current) =>
      current.left === left && current.top === top && current.width === width
        ? current
        : { left, top, width },
    );
  }, [openFilter]);

  useLayoutEffect(() => {
    if (!openFilter) return;

    positionHeaderFilter();
    popupRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    const popupResizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => positionHeaderFilter());
    if (popupRef.current) popupResizeObserver?.observe(popupRef.current);
    window.addEventListener('resize', positionHeaderFilter);
    window.addEventListener('scroll', positionHeaderFilter, true);
    return () => {
      popupResizeObserver?.disconnect();
      window.removeEventListener('resize', positionHeaderFilter);
      window.removeEventListener('scroll', positionHeaderFilter, true);
    };
  }, [openFilter, positionHeaderFilter]);

  useEffect(() => {
    if (!openFilter) return;

    function dismissHeaderFilter(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || popupRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-activity-filter-trigger]')) return;
      closeHeaderFilter(false);
    }

    function closeHeaderFilterFromKeyboard(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeHeaderFilter(true);
    }

    document.addEventListener('pointerdown', dismissHeaderFilter);
    document.addEventListener('keydown', closeHeaderFilterFromKeyboard);
    return () => {
      document.removeEventListener('pointerdown', dismissHeaderFilter);
      document.removeEventListener('keydown', closeHeaderFilterFromKeyboard);
    };
  }, [openFilter]);

  const visibleActors = useMemo(() => {
    const query = userSearch.trim().toLocaleLowerCase();
    if (!query) return knownActors;
    return knownActors.filter((actor) =>
      actorOptionLabel(actor).toLocaleLowerCase().includes(query),
    );
  }, [knownActors, userSearch]);
  const visibleProjects = useMemo(() => {
    const query = projectSearch.trim().toLocaleLowerCase();
    if (!query) return knownProjects;
    return knownProjects.filter((project) =>
      projectOptionLabel(project).toLocaleLowerCase().includes(query),
    );
  }, [knownProjects, projectSearch]);
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
          <a className={buttonClass} href="/operations">
            Operations
          </a>
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

      <section
        aria-label="Activity filters"
        className="my-4 rounded-xl border border-hairline bg-card p-3"
        role="region"
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,5fr)_auto]">
          <fieldset className="grid min-w-0 gap-1">
            <legend className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Detail level
            </legend>
            <div className="overflow-x-auto rounded-lg" data-testid="detail-level-options">
              <div className="grid min-w-[20rem] grid-cols-3 gap-1 rounded-lg border border-hairline bg-secondary/40 p-1 shadow-inner">
                {DETAIL_LEVEL_OPTIONS.map((option) => {
                  const optionSelected = filters.level === option.value;
                  return (
                    <label className="block cursor-pointer" key={option.value}>
                      <input
                        checked={optionSelected}
                        className="peer sr-only"
                        name="activity-detail-level"
                        type="radio"
                        value={option.value}
                        onChange={() =>
                          setFilters((current) =>
                            current.level === option.value
                              ? current
                              : { ...current, level: option.value },
                          )
                        }
                      />
                      <span className={filterChoiceClass(optionSelected)}>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </fieldset>

          <fieldset className="grid min-w-0 gap-1">
            <legend className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Time period
            </legend>
            <div className="overflow-x-auto rounded-lg" data-testid="time-period-options">
              <div className="grid min-w-[31rem] grid-cols-5 gap-1 rounded-lg border border-hairline bg-secondary/40 p-1 shadow-inner">
                {TIME_PERIOD_OPTIONS.map((option) => {
                  const optionSelected = filters.timePeriod === option.value;
                  return (
                    <label className="block cursor-pointer" key={option.value}>
                      <input
                        checked={optionSelected}
                        className="peer sr-only"
                        name="activity-time-period"
                        type="radio"
                        value={option.value}
                        onChange={() =>
                          setFilters((current) =>
                            current.timePeriod === option.value
                              ? current
                              : { ...current, timePeriod: option.value },
                          )
                        }
                      />
                      <span className={filterChoiceClass(optionSelected)}>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </fieldset>

          <div className="flex items-end">
            <button
              className={buttonClass}
              type="button"
              onClick={() => {
                setFilters({ ...EMPTY_FILTERS, excludedActors: [] });
                setUserSearch('');
                setProjectSearch('');
                closeHeaderFilter(false);
              }}
            >
              Clear filters
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-soft">Selections apply immediately.</p>
      </section>

      {refreshMessage && (
        <p className="mb-3 text-xs font-medium text-ink-soft" role="status">
          {refreshMessage}
        </p>
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
      {(state === 'loading' || state === 'ready') && (
        <>
          <div
            className="mt-4 overflow-hidden rounded-xl border border-hairline bg-card shadow-sm"
            data-testid="activity-table-shell"
          >
            <div className="overflow-x-auto" data-testid="activity-table-scroller">
              <div
                className={`${activityColumnsClass} min-h-10 border-b border-l-4 border-hairline border-l-transparent bg-secondary/40 text-[10px] font-bold uppercase tracking-wide text-ink-soft`}
                data-testid="activity-column-headers"
              >
                <span className="inline-flex h-8 items-center">New</span>
                <span className="inline-flex h-8 items-center">Time</span>
                <span className="inline-flex h-8 items-center">Event</span>
                <HeaderFilterButton
                  activeCount={(filters.actorUserId ? 1 : 0) + filters.excludedActors.length}
                  filter="user"
                  label="User"
                  openFilter={openFilter}
                  onToggle={toggleHeaderFilter}
                />
                <span className="inline-flex h-8 items-center">Subject</span>
                <HeaderFilterButton
                  activeCount={filters.projectId ? 1 : 0}
                  filter="project"
                  label="Project"
                  openFilter={openFilter}
                  onToggle={toggleHeaderFilter}
                />
              </div>

              {state === 'loading' && (
                <div className="p-10 text-center text-sm text-ink-soft">Loading activity…</div>
              )}
              {state === 'ready' && items.length === 0 && (
                <div className="p-10 text-center text-sm text-ink-soft">
                  No activity matches these filters.
                </div>
              )}
              {state === 'ready' && items.length > 0 && (
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
                          className={`${activityColumnsClass} min-h-9 whitespace-nowrap py-1.5 text-left text-xs transition hover:bg-secondary/70 ring-focus`}
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
                            <EntityLabel
                              kind="user"
                              state={event.actorState}
                              value={event.actorLabel}
                            />
                          </span>
                          <EntityLabel
                            className="font-medium text-accent-ink"
                            kind={event.subjectType}
                            state={event.subjectState}
                            value={event.subjectLabel}
                          />
                          <span className="inline-flex items-center gap-1.5 text-ink-soft">
                            <ActivityIcon
                              className="size-3.5 shrink-0"
                              name="folder"
                              testId="project-icon"
                            />
                            {event.projectState !== 'none' ? (
                              <EntityLabel
                                kind="project"
                                state={event.projectState}
                                value={event.projectLabel}
                              />
                            ) : (
                              <span>—</span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          {state === 'ready' && items.length > 0 && nextCursor && (
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

      {openFilter &&
        typeof document !== 'undefined' &&
        createPortal(
          <section
            aria-label={`${openFilter === 'user' ? 'User' : 'Project'} filter`}
            aria-modal="false"
            className="z-50 max-h-[calc(100vh-1rem)] overflow-y-auto rounded-xl border border-hairline bg-card shadow-xl"
            id={FILTER_PANEL_ID}
            ref={popupRef}
            role="dialog"
            style={{
              left: popupPosition.left,
              position: 'fixed',
              top: popupPosition.top,
              width: popupPosition.width,
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-2.5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-accent-ink">
                  {openFilter} column
                </p>
                <h2 className="text-sm font-semibold text-ink">Filter by {openFilter}</h2>
              </div>
              <button
                aria-label={`Close ${openFilter} filter`}
                className="inline-flex size-8 items-center justify-center rounded-md border border-hairline text-lg leading-none text-ink-soft transition hover:bg-secondary hover:text-ink ring-focus"
                type="button"
                onClick={() => closeHeaderFilter(true)}
              >
                ×
              </button>
            </div>

            {openFilter === 'user' && (
              <div className="grid gap-3 p-3">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Search users
                  <input
                    className={`${inputClass} w-full normal-case`}
                    type="search"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                  />
                </label>

                <label className="relative block cursor-pointer">
                  <input
                    aria-label="Any user"
                    checked={!filters.actorUserId}
                    className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                    name="activity-included-user"
                    type="radio"
                    value=""
                    onChange={() => selectIncludedActor('')}
                  />
                  <span className={filterListChoiceClass(!filters.actorUserId)}>Any user</span>
                </label>

                <ul
                  aria-label="Users"
                  className="grid max-h-72 gap-1.5 overflow-y-auto rounded-lg bg-secondary/25 p-1"
                >
                  {visibleActors.map((actor) => {
                    const included = filters.actorUserId === actor.id;
                    const excluded = filters.excludedActors.some(
                      (option) => option.id === actor.id,
                    );
                    return (
                      <li
                        className="grid gap-2 rounded-lg border border-hairline bg-card p-2.5 sm:grid-cols-[minmax(0,1fr)_8.5rem] sm:items-center"
                        key={actor.id}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            <EntityLabel kind="user" state={actor.state} value={actor.label} />
                          </p>
                          <p className="truncate text-xs text-ink-soft">
                            {actorIdentityLabel(actor)}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <label className="relative block cursor-pointer">
                            <input
                              aria-label={`Only ${actorOptionLabel(actor)}`}
                              checked={included}
                              className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                              name="activity-included-user"
                              type="radio"
                              value={actor.id}
                              onChange={() => selectIncludedActor(actor.id)}
                            />
                            <span className={filterListChoiceClass(included)}>Only</span>
                          </label>
                          <label className="relative block cursor-pointer">
                            <input
                              aria-label={`Exclude ${actorOptionLabel(actor)}`}
                              checked={excluded}
                              className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                              disabled={
                                !excluded && filters.excludedActors.length >= MAX_EXCLUDED_ACTORS
                              }
                              type="checkbox"
                              onChange={(event) =>
                                toggleActorExclusion(actor, event.target.checked)
                              }
                            />
                            <span className={filterListChoiceClass(excluded)}>Exclude</span>
                          </label>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {visibleActors.length === 0 && (
                  <p className="text-xs text-ink-soft">No users match this search.</p>
                )}
                <p className="text-xs text-ink-soft">
                  Include one user or exclude up to {MAX_EXCLUDED_ACTORS}. Choices apply
                  immediately.
                </p>
              </div>
            )}

            {openFilter === 'project' && (
              <div className="grid gap-3 p-3">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Search projects
                  <input
                    className={`${inputClass} w-full normal-case`}
                    type="search"
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                  />
                </label>

                <label className="relative block cursor-pointer">
                  <input
                    aria-label="Any project"
                    checked={!filters.projectId}
                    className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                    name="activity-project"
                    type="radio"
                    value=""
                    onChange={() =>
                      setFilters((current) =>
                        current.projectId ? { ...current, projectId: '' } : current,
                      )
                    }
                  />
                  <span className={filterListChoiceClass(!filters.projectId)}>Any project</span>
                </label>

                <ul
                  aria-label="Projects"
                  className="grid max-h-72 gap-1.5 overflow-y-auto rounded-lg bg-secondary/25 p-1"
                >
                  {visibleProjects.map((project) => {
                    const optionSelected = filters.projectId === project.id;
                    return (
                      <li
                        className="grid gap-2 rounded-lg border border-hairline bg-card p-2.5 sm:grid-cols-[minmax(0,1fr)_5rem] sm:items-center"
                        key={project.id}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            <EntityLabel
                              kind="project"
                              state={project.state}
                              value={project.label}
                            />
                          </p>
                          <p className="truncate font-mono text-xs text-ink-soft">{project.id}</p>
                        </div>
                        <label className="relative block cursor-pointer">
                          <input
                            aria-label={`Only ${projectOptionLabel(project)}`}
                            checked={optionSelected}
                            className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                            name="activity-project"
                            type="radio"
                            value={project.id}
                            onChange={() =>
                              setFilters((current) =>
                                current.projectId === project.id
                                  ? current
                                  : { ...current, projectId: project.id },
                              )
                            }
                          />
                          <span className={filterListChoiceClass(optionSelected)}>Only</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {visibleProjects.length === 0 && (
                  <p className="text-xs text-ink-soft">No projects match this search.</p>
                )}
                <p className="text-xs text-ink-soft">Choices apply immediately.</p>
              </div>
            )}
          </section>,
          document.body,
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
                  <EntityLabel
                    kind={selected.subjectType}
                    state={selected.subjectState}
                    value={selected.subjectLabel}
                  />
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
                <EntityLabel kind="user" state={selected.actorState} value={selected.actorLabel} />
                {selected.actorEmail ? ` — ${selected.actorEmail}` : null}
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
