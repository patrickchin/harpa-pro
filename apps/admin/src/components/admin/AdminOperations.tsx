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

function Operations({ session, onSignOut }: { session: AdminSession; onSignOut: () => void }) {
  const { apiBaseUrl } = getPublicEnv();
  const [probes, setProbes] = useState(INITIAL_PROBES);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setProbes(INITIAL_PROBES);
    const [product, admin] = await Promise.all([runProbe('/readyz'), runProbe('/admin/readyz')]);
    setProbes({ product, admin });
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
