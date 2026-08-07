import type {
  NeonInventoryObservation,
  NeonInventoryReason,
  NeonProject,
} from '@harpa/api-contract';
import { operations as operationSchemas } from '@harpa/api-contract/schemas';
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

interface ServiceLink {
  name: string;
  description: string;
  dashboardUrl: string;
  statusUrl?: string;
}

type NeonInventoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; observation: NeonInventoryObservation };
type NeonInventoryFetchResult =
  { status: 'ready'; observation: NeonInventoryObservation } | { status: 'unauthorized' };

const NEON_CONSOLE_URL = 'https://console.neon.tech/app/projects';

const buttonClass =
  'inline-flex h-10 items-center justify-center rounded-md border border-hairline bg-card px-4 text-sm font-medium text-ink shadow-sm transition hover:bg-secondary ring-focus disabled:cursor-not-allowed disabled:opacity-60';

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
        dashboardUrl: NEON_CONSOLE_URL,
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

function unknownNeonObservation(reason: NeonInventoryReason): NeonInventoryObservation {
  return {
    observedAt: new Date().toISOString(),
    status: 'unknown',
    reason,
  };
}

function reasonCopy(reason: NeonInventoryReason): string {
  switch (reason) {
    case 'not_configured':
      return 'Neon inventory is not configured.';
    case 'unsafe_permissions':
      return 'Viewer-only Neon access could not be verified.';
    case 'timeout':
      return 'Provider request timed out.';
    case 'rate_limited':
      return 'Neon rate limiting prevented this observation.';
    case 'forbidden':
      return 'Neon denied access to this inventory.';
    case 'not_found':
      return 'The requested Neon inventory was not found.';
    case 'invalid_response':
      return 'Neon returned an unexpected response.';
    case 'provider_unavailable':
      return 'Neon inventory is temporarily unavailable.';
  }
}

function responseFailureReason(status: number): NeonInventoryReason {
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return 'provider_unavailable';
}

async function loadNeonInventory(): Promise<NeonInventoryFetchResult> {
  let response: Response;
  try {
    response = await fetch(`${getPublicEnv().apiBaseUrl}/admin/operations/neon`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    return { status: 'ready', observation: unknownNeonObservation('provider_unavailable') };
  }

  if (response.status === 401) return { status: 'unauthorized' };
  if (!response.ok) {
    return {
      status: 'ready',
      observation: unknownNeonObservation(responseFailureReason(response.status)),
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'ready', observation: unknownNeonObservation('invalid_response') };
  }

  const parsed = operationSchemas.neonInventoryObservation.safeParse(body);
  return {
    status: 'ready',
    observation: parsed.success ? parsed.data : unknownNeonObservation('invalid_response'),
  };
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

function branchCountLabel(project: NeonProject): string {
  if (project.branchCount.status === 'unknown') return 'Branch count Unknown';
  return `${project.branchCount.count} ${project.branchCount.count === 1 ? 'branch' : 'branches'}`;
}

function ProjectInventoryCard({ project }: { project: NeonProject }) {
  return (
    <article className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">{project.name}</h3>
          <p className="mt-1 break-all text-xs text-ink-soft">{project.id}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {project.regionId} · PostgreSQL {project.pgVersion} · Viewer
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Created <time dateTime={project.createdAt}>{project.createdAt}</time>
            {' · '}updated <time dateTime={project.updatedAt}>{project.updatedAt}</time>
          </p>
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-ink">
          {branchCountLabel(project)}
        </span>
      </div>

      {project.branchCount.status === 'unknown' && (
        <p className="mt-3 text-sm text-ink-soft">{reasonCopy(project.branchCount.reason)}</p>
      )}

      <p className="mt-4 text-sm text-ink-soft">
        Neon reports the total branch count separately from the active branch details below;
        deleted-branch semantics may differ.
      </p>

      {project.branchDetails.status === 'unknown' ? (
        <div className="mt-4 rounded-lg bg-secondary p-4 text-sm text-ink-soft">
          <p className="font-semibold text-ink">Branch details unavailable.</p>
          <p className="mt-1">{reasonCopy(project.branchDetails.reason)}</p>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-ink-soft">
            {project.branchDetails.branches.length} active branch{' '}
            {project.branchDetails.branches.length === 1 ? 'detail' : 'details'} returned.
          </p>
          {project.branchDetails.truncated && (
            <p className="mt-1 text-sm font-medium text-amber-800">
              Branch detail list is truncated.
            </p>
          )}
          <div
            aria-label={`Branches for ${project.name}`}
            className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-hairline"
            role="region"
            tabIndex={0}
          >
            {project.branchDetails.branches.length === 0 ? (
              <p className="p-4 text-sm text-ink-soft">No active branch details returned.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {project.branchDetails.branches.map((branch) => (
                  <li className="p-4" key={branch.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink">{branch.name}</p>
                        <p className="mt-1 break-all text-xs text-ink-soft">{branch.id}</p>
                        <p className="mt-1 text-xs text-ink-soft">
                          {branch.currentState}
                          {branch.parentId ? ` · parent ${branch.parentId}` : ' · no parent'}
                        </p>
                        <p className="mt-1 text-xs text-ink-soft">
                          Created <time dateTime={branch.createdAt}>{branch.createdAt}</time>
                          {' · '}updated <time dateTime={branch.updatedAt}>{branch.updatedAt}</time>
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {branch.default && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-ink">
                            Default
                          </span>
                        )}
                        {branch.protected && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-ink">
                            Protected
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function NeonInventory({ state }: { state: NeonInventoryState }) {
  if (state.status === 'idle') return null;

  return (
    <section className="mt-8" aria-labelledby="neon-inventory-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink" id="neon-inventory-title">
            Neon inventory
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Read-only provider metadata, separate from readiness, deployment proof, quota, and
            billing evidence.
          </p>
        </div>
        <a
          className="inline-flex text-sm font-semibold text-accent-ink underline underline-offset-4 ring-focus"
          href={NEON_CONSOLE_URL}
          rel="noreferrer"
          target="_blank"
        >
          Open Neon console ↗
        </a>
      </div>

      <div className="mt-4 rounded-xl border border-hairline bg-card p-5 shadow-sm">
        <p className="text-sm font-semibold text-ink">Remaining Neon credit: Unknown</p>
        <p className="mt-1 text-sm text-ink-soft">
          Neon has no documented remaining-credit API. Use the Neon console for current billing
          information.
        </p>
      </div>

      <div className="mt-4" aria-live="polite">
        {state.status === 'loading' ? (
          <div className="rounded-xl border border-hairline bg-card p-5 text-sm text-ink-soft shadow-sm">
            Loading Neon inventory…
          </div>
        ) : state.observation.status === 'unknown' ? (
          <div className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
            <p className="font-semibold text-ink">Unknown</p>
            <p className="mt-2 text-sm text-ink-soft">{reasonCopy(state.observation.reason)}</p>
            <p className="mt-2 text-xs text-ink-soft">
              Observed{' '}
              <time dateTime={state.observation.observedAt}>{state.observation.observedAt}</time>
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
              {state.observation.status === 'partial' && (
                <p className="font-semibold text-amber-800">Partial Neon inventory</p>
              )}
              <p
                className={
                  state.observation.status === 'partial'
                    ? 'mt-2 text-sm text-ink'
                    : 'text-sm text-ink'
                }
              >
                {state.observation.projects.length}{' '}
                {state.observation.projects.length === 1 ? 'visible project' : 'visible projects'}
              </p>
              {state.observation.unavailableProjectCount > 0 && (
                <p className="mt-1 text-sm text-ink-soft">
                  {state.observation.unavailableProjectCount}{' '}
                  {state.observation.unavailableProjectCount === 1
                    ? 'project unavailable.'
                    : 'projects unavailable.'}
                </p>
              )}
              {state.observation.projectsTruncated && (
                <p className="mt-1 text-sm text-ink-soft">Project list is truncated.</p>
              )}
              <p className="mt-2 text-xs text-ink-soft">
                Observed{' '}
                <time dateTime={state.observation.observedAt}>{state.observation.observedAt}</time>
              </p>
            </div>

            {state.observation.projects.length === 0 ? (
              <div className="mt-4 rounded-xl border border-hairline bg-card p-5 text-sm text-ink-soft shadow-sm">
                No accessible Neon projects.
              </div>
            ) : (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {state.observation.projects.map((project) => (
                  <ProjectInventoryCard key={project.id} project={project} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Operations({
  session,
  onSessionExpired,
  onSignOut,
}: {
  session: AdminSession;
  onSessionExpired: () => void;
  onSignOut: () => void;
}) {
  const { apiBaseUrl } = getPublicEnv();
  const [probes, setProbes] = useState(INITIAL_PROBES);
  const [neonInventory, setNeonInventory] = useState<NeonInventoryState>({ status: 'idle' });
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setProbes(INITIAL_PROBES);
    setNeonInventory({ status: 'loading' });
    try {
      const [product, admin, inventory] = await Promise.all([
        runProbe('/readyz'),
        runProbe('/admin/readyz'),
        loadNeonInventory(),
      ]);
      setProbes({ product, admin });
      if (inventory.status === 'unauthorized') {
        onSessionExpired();
        return;
      }
      setNeonInventory(inventory);
    } finally {
      setRefreshing(false);
    }
  }, [onSessionExpired]);

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

      <NeonInventory state={neonInventory} />

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

  const refetchSession = useCallback(async () => {
    const session = await adminAuthClient.getSession();
    setPageState(session ? { status: 'signed-in', session } : { status: 'signed-out' });
    return session;
  }, []);

  const checkSession = useCallback(async () => {
    setPageState({ status: 'loading' });
    try {
      await refetchSession();
    } catch {
      setPageState({ status: 'unavailable' });
    }
  }, [refetchSession]);

  const handleSessionExpired = useCallback(() => {
    void checkSession();
  }, [checkSession]);

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

  return (
    <Operations
      session={pageState.session}
      onSessionExpired={handleSessionExpired}
      onSignOut={() => void signOut()}
    />
  );
}
