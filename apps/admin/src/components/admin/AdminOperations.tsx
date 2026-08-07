import { useCallback, useEffect, useState } from 'react';
import { adminAuthClient } from '../../lib/admin-auth';
import type { AdminSession } from '../../lib/admin-auth';
import { getPublicEnv } from '../../lib/env';

type PageState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: AdminSession };
type ProbeState = 'checking' | 'healthy' | 'unavailable';

interface ProbeResult {
  state: ProbeState;
  detail: string;
}

interface GitHubBranchHead {
  name: 'dev' | 'main';
  sha: string;
  message: string;
  committedAt: string;
}

interface GitHubPullRequest {
  number: number;
  title: string;
  draft: boolean;
  updatedAt: string;
  headRef: string;
  headSha: string;
  baseRef: string;
}

interface GitHubRateLimit {
  limit: number;
  remaining: number;
  resetAt: string;
}

type GitHubState =
  | { status: 'checking' }
  | {
      status: 'available';
      branches: readonly GitHubBranchHead[];
      pullRequests: readonly GitHubPullRequest[];
      rateLimit: GitHubRateLimit | null;
      observedAt: string;
    }
  | {
      status: 'unavailable';
      detail: string;
      rateLimit: GitHubRateLimit | null;
      retryAfterSeconds: number | null;
    };

interface ServiceLink {
  name: string;
  description: string;
  dashboardUrl: string;
  statusUrl?: string;
}

const buttonClass =
  'inline-flex h-10 items-center justify-center rounded-md border border-hairline bg-card px-4 text-sm font-medium text-ink shadow-sm transition hover:bg-secondary ring-focus disabled:cursor-not-allowed disabled:opacity-60';

const GITHUB_REPOSITORY_URL = 'https://github.com/patrickchin/harpa-pro';
const GITHUB_API_URL = 'https://api.github.com/repos/patrickchin/harpa-pro';
const GITHUB_ACCEPT = 'application/vnd.github+json';

const SERVICE_GROUPS: ReadonlyArray<{
  title: string;
  services: ReadonlyArray<ServiceLink>;
}> = [
  {
    title: 'Infrastructure and observability',
    services: [
      {
        name: 'Fly.io',
        description: 'API machines, deployments, metrics, and runtime logs.',
        dashboardUrl: 'https://fly.io/dashboard',
        statusUrl: 'https://status.flyio.net/',
      },
      {
        name: 'Neon',
        description: 'Application and admin databases, branches, usage, and restore points.',
        dashboardUrl: 'https://console.neon.tech/app/projects',
        statusUrl: 'https://neonstatus.com/',
      },
      {
        name: 'Cloudflare',
        description: 'Pages, R2, Turnstile, DNS, domains, and traffic.',
        dashboardUrl: 'https://dash.cloudflare.com/',
        statusUrl: 'https://www.cloudflarestatus.com/',
      },
      {
        name: 'Sentry',
        description: 'Mobile and API errors, releases, and performance.',
        dashboardUrl: 'https://sentry.io/organizations/',
        statusUrl: 'https://status.sentry.io/',
      },
      {
        name: 'Better Stack',
        description: 'Centralized logs and uptime checks.',
        dashboardUrl: 'https://betterstack.com/logs',
        statusUrl: 'https://status.betterstack.com/',
      },
    ],
  },
  {
    title: 'Deployments, secrets, and delivery',
    services: [
      {
        name: 'GitHub Actions',
        description: 'Tests, deployments, migrations, releases, and scheduled cleanup.',
        dashboardUrl: 'https://github.com/patrickchin/harpa-pro/actions',
        statusUrl: 'https://www.githubstatus.com/',
      },
      {
        name: 'Doppler',
        description: 'Production and development secrets and service tokens.',
        dashboardUrl: 'https://dashboard.doppler.com/',
        statusUrl: 'https://www.dopplerstatus.com/',
      },
      {
        name: 'Expo / EAS',
        description: 'Native builds, submissions, signing credentials, and OTA updates.',
        dashboardUrl: 'https://expo.dev/',
        statusUrl: 'https://status.expo.dev/',
      },
      {
        name: 'Resend',
        description: 'Application email delivery, bounces, and domain reputation.',
        dashboardUrl: 'https://resend.com/emails',
        statusUrl: 'https://resend-status.com/',
      },
      {
        name: 'Zoho Mail',
        description: 'Harpa Pro mailboxes and mail administration.',
        dashboardUrl: 'https://mail.zoho.com/',
        statusUrl: 'https://status.zoho.com/',
      },
      {
        name: 'App Store Connect',
        description: 'iOS builds, TestFlight, reviews, releases, and store health.',
        dashboardUrl: 'https://appstoreconnect.apple.com/apps/6776759817/appstore',
        statusUrl: 'https://developer.apple.com/system-status/',
      },
      {
        name: 'Google Play Console',
        description: 'Android builds, testing tracks, reviews, ANRs, and releases.',
        dashboardUrl: 'https://play.google.com/console/',
      },
    ],
  },
  {
    title: 'AI and development services',
    services: [
      {
        name: 'OpenAI',
        description: 'Report generation usage, limits, billing, and API keys.',
        dashboardUrl: 'https://platform.openai.com/usage',
        statusUrl: 'https://status.openai.com/',
      },
      {
        name: 'Groq',
        description: 'Voice transcription usage, billing, and API keys.',
        dashboardUrl: 'https://console.groq.com/keys',
        statusUrl: 'https://groqstatus.com/',
      },
      {
        name: 'Kimi / Moonshot',
        description: 'Optional model access, balance, usage, and API keys.',
        dashboardUrl: 'https://platform.kimi.ai/console',
      },
      {
        name: 'Firecrawl',
        description: 'Development research usage, credits, and API keys.',
        dashboardUrl: 'https://www.firecrawl.dev/app',
        statusUrl: 'https://status.firecrawl.dev/',
      },
    ],
  },
];

const INITIAL_PROBES: Record<'product' | 'admin', ProbeResult> = {
  product: { state: 'checking', detail: 'Checking product API and database…' },
  admin: { state: 'checking', detail: 'Checking admin API and database…' },
};

class GitHubRequestError extends Error {
  constructor(
    readonly rateLimited: boolean,
    readonly rateLimit: GitHubRateLimit | null,
    readonly retryAfterSeconds: number | null,
  ) {
    super('GitHub public repository data is unavailable.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid GitHub ${key}.`);
  }
  return value;
}

function parseIsoDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid GitHub date.');
  return date.toISOString();
}

function parseRateLimit(response: Response): GitHubRateLimit | null {
  const limit = Number(response.headers.get('x-ratelimit-limit'));
  const remaining = Number(response.headers.get('x-ratelimit-remaining'));
  const resetSeconds = Number(response.headers.get('x-ratelimit-reset'));
  const resetAt = new Date(resetSeconds * 1000);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    !Number.isInteger(remaining) ||
    remaining < 0 ||
    !Number.isInteger(resetSeconds) ||
    resetSeconds < 1 ||
    Number.isNaN(resetAt.getTime())
  ) {
    return null;
  }
  return {
    limit,
    remaining,
    resetAt: resetAt.toISOString(),
  };
}

function parseRetryAfter(response: Response): number | null {
  const retryAfterSeconds = Number(response.headers.get('retry-after'));
  return Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds
    : null;
}

async function fetchGitHubJson(path: string): Promise<{
  data: unknown;
  rateLimit: GitHubRateLimit | null;
}> {
  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    headers: { Accept: GITHUB_ACCEPT },
    credentials: 'omit',
    cache: 'no-store',
  });
  const rateLimit = parseRateLimit(response);
  if (!response.ok) {
    const retryAfterSeconds = parseRetryAfter(response);
    let errorMessage = '';
    try {
      const errorBody: unknown = await response.json();
      if (isRecord(errorBody) && typeof errorBody.message === 'string') {
        errorMessage = errorBody.message;
      }
    } catch {
      // Error bodies are optional; HTTP status and headers remain authoritative.
    }
    const rateLimited =
      response.status === 429 ||
      (response.status === 403 &&
        (rateLimit?.remaining === 0 ||
          retryAfterSeconds !== null ||
          /(?:secondary )?rate limit|abuse detection/i.test(errorMessage)));
    throw new GitHubRequestError(rateLimited, rateLimit, retryAfterSeconds);
  }
  return { data: await response.json(), rateLimit };
}

function parseBranchHead(name: 'dev' | 'main', value: unknown): GitHubBranchHead {
  if (!Array.isArray(value) || !isRecord(value[0])) {
    throw new Error(`Missing GitHub ${name} branch head.`);
  }
  const item = value[0];
  const sha = requiredString(item, 'sha');
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Invalid GitHub commit SHA.');
  const commit = item.commit;
  if (!isRecord(commit)) throw new Error('Invalid GitHub commit.');
  const committer = commit.committer;
  if (!isRecord(committer)) throw new Error('Invalid GitHub committer.');
  return {
    name,
    sha,
    message: requiredString(commit, 'message').split('\n')[0] ?? '',
    committedAt: parseIsoDate(requiredString(committer, 'date')),
  };
}

function parsePullRequests(value: unknown): GitHubPullRequest[] {
  if (!Array.isArray(value)) throw new Error('Invalid GitHub pull request list.');
  return value.map((item) => {
    if (!isRecord(item) || !isRecord(item.head) || !isRecord(item.base)) {
      throw new Error('Invalid GitHub pull request.');
    }
    const number = item.number;
    if (!Number.isInteger(number) || (number as number) < 1) {
      throw new Error('Invalid GitHub pull request number.');
    }
    if (typeof item.draft !== 'boolean') {
      throw new Error('Invalid GitHub pull request draft state.');
    }
    const headSha = requiredString(item.head, 'sha');
    if (!/^[0-9a-f]{40}$/.test(headSha)) {
      throw new Error('Invalid GitHub pull request SHA.');
    }
    return {
      number: number as number,
      title: requiredString(item, 'title'),
      draft: item.draft,
      updatedAt: parseIsoDate(requiredString(item, 'updated_at')),
      headRef: requiredString(item.head, 'ref'),
      headSha,
      baseRef: requiredString(item.base, 'ref'),
    };
  });
}

async function loadGitHubStatus(): Promise<GitHubState> {
  try {
    const dev = await fetchGitHubJson('/commits?sha=dev&per_page=1');
    const main = await fetchGitHubJson('/commits?sha=main&per_page=1');
    const pulls = await fetchGitHubJson(
      '/pulls?state=open&sort=updated&direction=desc&per_page=30',
    );
    return {
      status: 'available',
      branches: [parseBranchHead('dev', dev.data), parseBranchHead('main', main.data)],
      pullRequests: parsePullRequests(pulls.data),
      rateLimit: pulls.rateLimit ?? main.rateLimit ?? dev.rateLimit,
      observedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof GitHubRequestError) {
      return {
        status: 'unavailable',
        detail: error.rateLimited
          ? error.rateLimit?.remaining === 0
            ? 'GitHub rate limit reached for this browser/IP.'
            : 'GitHub temporarily throttled requests for this browser/IP.'
          : 'GitHub public repository data is unavailable.',
        rateLimit: error.rateLimit,
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }
    return {
      status: 'unavailable',
      detail: 'GitHub public repository data is unavailable.',
      rateLimit: null,
      retryAfterSeconds: null,
    };
  }
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

async function runProbe(path: string): Promise<ProbeResult> {
  try {
    const response = await fetch(`${getPublicEnv().apiBaseUrl}${path}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    return response.ok
      ? { state: 'healthy', detail: 'API, database, and schema are ready.' }
      : { state: 'unavailable', detail: `Readiness returned HTTP ${response.status}.` };
  } catch {
    return { state: 'unavailable', detail: 'Readiness could not be reached.' };
  }
}

function ProbeBadge({ state }: { state: ProbeState }) {
  const label = state === 'checking' ? 'Checking' : state === 'healthy' ? 'Healthy' : 'Unavailable';
  const tone =
    state === 'checking'
      ? 'bg-secondary text-ink-soft'
      : state === 'healthy'
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-red-100 text-red-800';

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function GitHubRateLimitLine({ rateLimit }: { rateLimit: GitHubRateLimit }) {
  return (
    <p className="text-xs text-ink-soft">
      Primary public API bucket:{' '}
      <span className="font-semibold text-ink">
        {rateLimit.remaining} of {rateLimit.limit} requests remain
      </span>{' '}
      for this browser/IP. Resets{' '}
      <time dateTime={rateLimit.resetAt}>{formatTimestamp(rateLimit.resetAt)}</time>.
    </p>
  );
}

function GitHubRepositoryStatus({ state }: { state: GitHubState }) {
  return (
    <section className="mt-8" aria-labelledby="github-repository-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink" id="github-repository-title">
            GitHub public repository
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-soft">
            Advisory source-control state. Branch heads and pull requests do not prove what is
            deployed.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <a
            className="text-accent-ink underline underline-offset-4 ring-focus"
            href={GITHUB_REPOSITORY_URL}
            rel="noreferrer"
            target="_blank"
          >
            Open repository ↗
          </a>
          <a
            className="text-ink-soft underline underline-offset-4 ring-focus"
            href={`${GITHUB_REPOSITORY_URL}/pulls`}
            rel="noreferrer"
            target="_blank"
          >
            Open pull requests ↗
          </a>
        </div>
      </div>

      {state.status === 'checking' && (
        <div
          aria-live="polite"
          className="mt-4 rounded-xl border border-hairline bg-card p-5 text-sm text-ink-soft shadow-sm"
        >
          Checking public repository state…
        </div>
      )}

      {state.status === 'unavailable' && (
        <div
          aria-live="polite"
          className="mt-4 rounded-xl border border-hairline bg-card p-5 shadow-sm"
        >
          <p className="text-sm font-medium text-red-800">{state.detail}</p>
          {state.retryAfterSeconds && (
            <p className="mt-2 text-xs text-ink-soft">
              Retry after {state.retryAfterSeconds} seconds.
            </p>
          )}
          {state.rateLimit && (
            <div className="mt-2">
              <GitHubRateLimitLine rateLimit={state.rateLimit} />
            </div>
          )}
        </div>
      )}

      {state.status === 'available' && (
        <div aria-live="polite" className="mt-4 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            {state.branches.map((branch) => (
              <article
                className="rounded-xl border border-hairline bg-card p-5 shadow-sm"
                key={branch.name}
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-semibold text-ink">{branch.name}</h3>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-ink-soft">
                    Branch head
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-ink">{branch.message}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
                  <a
                    aria-label={`Open ${branch.name} commit ${branch.sha.slice(0, 8)}`}
                    className="font-mono font-semibold text-accent-ink underline underline-offset-4 ring-focus"
                    href={`${GITHUB_REPOSITORY_URL}/commit/${branch.sha}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {branch.sha.slice(0, 8)} ↗
                  </a>
                  <time dateTime={branch.committedAt}>{formatTimestamp(branch.committedAt)}</time>
                </div>
              </article>
            ))}
          </div>

          <article className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-ink">Open pull requests</h3>
                <p className="mt-1 text-sm text-ink-soft">
                  Showing up to 30 open pull requests in this repository.
                </p>
              </div>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-ink-soft">
                {state.pullRequests.length} shown
              </span>
            </div>

            <div
              className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-hairline"
              data-testid="github-pr-scroller"
            >
              {state.pullRequests.length === 0 ? (
                <p className="p-4 text-sm text-ink-soft">No open pull requests.</p>
              ) : (
                <ul aria-label="Open pull requests" className="divide-y divide-border">
                  {state.pullRequests.map((pullRequest) => (
                    <li className="p-4" key={pullRequest.number}>
                      <div className="flex items-start justify-between gap-4">
                        <a
                          className="min-w-0 text-sm font-semibold text-accent-ink underline underline-offset-4 ring-focus"
                          href={`${GITHUB_REPOSITORY_URL}/pull/${pullRequest.number}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          #{pullRequest.number} {pullRequest.title} ↗
                        </a>
                        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-ink-soft">
                          {pullRequest.draft ? 'Draft' : 'Ready'}
                        </span>
                      </div>
                      <p className="mt-2 break-all text-xs text-ink-soft">
                        {pullRequest.headRef} → {pullRequest.baseRef} ·{' '}
                        {pullRequest.headSha.slice(0, 8)} · updated{' '}
                        <time dateTime={pullRequest.updatedAt}>
                          {formatTimestamp(pullRequest.updatedAt)}
                        </time>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-1">
              {state.rateLimit && <GitHubRateLimitLine rateLimit={state.rateLimit} />}
              <p className="text-xs text-ink-soft">
                Observed <time dateTime={state.observedAt}>{formatTimestamp(state.observedAt)}</time>.
              </p>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

function Operations({ session, onSignOut }: { session: AdminSession; onSignOut: () => void }) {
  const { apiBaseUrl } = getPublicEnv();
  const [probes, setProbes] = useState(INITIAL_PROBES);
  const [github, setGitHub] = useState<GitHubState>({ status: 'checking' });
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setProbes(INITIAL_PROBES);
    setGitHub({ status: 'checking' });
    const [[product, admin], githubStatus] = await Promise.all([
      Promise.all([runProbe('/readyz'), runProbe('/admin/readyz')]),
      loadGitHubStatus(),
    ]);
    setProbes({ product, admin });
    setGitHub(githubStatus);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section>
      <div className="flex flex-col gap-4 border-b border-hairline pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-ink">
            Operations
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">
            Service monitoring
          </h1>
          <p className="mt-2 text-sm text-ink-soft">Signed in as {session.email}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className={buttonClass} href="/">
            Activity
          </a>
          <button className={buttonClass} disabled={refreshing} type="button" onClick={refresh}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className={buttonClass} type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>

      <section className="mt-6" aria-labelledby="customer-checks-title">
        <div>
          <h2 className="text-xl font-semibold text-ink" id="customer-checks-title">
            Customer-facing checks
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Checked on page load and when you press Refresh. Vendor account health stays in the
            linked consoles below.
          </p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2" aria-live="polite">
          {[
            {
              id: 'product' as const,
              name: 'Product API and database',
              href: `${apiBaseUrl}/readyz`,
            },
            {
              id: 'admin' as const,
              name: 'Admin API and database',
              href: `${apiBaseUrl}/admin/readyz`,
            },
          ].map((probe) => (
            <article
              className="rounded-xl border border-hairline bg-card p-5 shadow-sm"
              key={probe.id}
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-semibold text-ink">{probe.name}</h3>
                <ProbeBadge state={probes[probe.id].state} />
              </div>
              <p className="mt-3 text-sm text-ink-soft">{probes[probe.id].detail}</p>
              <a
                className="mt-4 inline-flex text-sm font-semibold text-accent-ink underline underline-offset-4 ring-focus"
                href={probe.href}
                rel="noreferrer"
                target="_blank"
              >
                Open readiness probe ↗
              </a>
            </article>
          ))}
        </div>
      </section>

      <GitHubRepositoryStatus state={github} />

      <div className="mt-8 grid gap-8">
        {SERVICE_GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="text-xl font-semibold text-ink">{group.title}</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.services.map((service) => (
                <article
                  className="flex min-h-40 flex-col rounded-xl border border-hairline bg-card p-5 shadow-sm"
                  key={service.name}
                >
                  <h3 className="font-semibold text-ink">{service.name}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">
                    {service.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
                    <a
                      className="text-accent-ink underline underline-offset-4 ring-focus"
                      href={service.dashboardUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open dashboard ↗
                    </a>
                    {service.statusUrl && (
                      <a
                        className="text-ink-soft underline underline-offset-4 ring-focus"
                        href={service.statusUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Service status ↗
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

export default function AdminOperations() {
  const [pageState, setPageState] = useState<PageState>({ status: 'loading' });

  const checkSession = useCallback(async () => {
    setPageState({ status: 'loading' });
    try {
      const session = await adminAuthClient.getSession();
      setPageState(session ? { status: 'signed-in', session } : { status: 'signed-out' });
    } catch {
      setPageState({ status: 'unavailable' });
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  async function signOut() {
    try {
      await adminAuthClient.logout();
    } finally {
      setPageState({ status: 'signed-out' });
    }
  }

  if (pageState.status === 'loading') {
    return (
      <div className="rounded-xl border border-hairline bg-card p-10 text-center text-sm text-ink-soft">
        Checking admin session…
      </div>
    );
  }
  if (pageState.status === 'unavailable') {
    return (
      <section className="mx-auto max-w-md rounded-2xl border border-hairline bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Admin sign-in is unavailable.</h1>
        <button className={`${buttonClass} mt-4`} type="button" onClick={() => void checkSession()}>
          Retry
        </button>
      </section>
    );
  }
  if (pageState.status === 'signed-out') {
    return (
      <section className="mx-auto max-w-md rounded-2xl border border-hairline bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Admin sign-in required.</h1>
        <p className="mt-2 text-sm text-ink-soft">Sign in before opening service monitoring.</p>
        <a className={`${buttonClass} mt-4`} href="/">
          Open sign in
        </a>
      </section>
    );
  }

  return <Operations session={pageState.session} onSignOut={() => void signOut()} />;
}
