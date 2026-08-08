import type {
  NeonInventoryObservation,
  NeonInventoryReason,
  NeonProject,
  R2Bucket,
  R2CapacityCaveat,
  R2CapacityObservation,
  R2CapacityReason,
  R2OperationEstimate,
  R2StorageClassSnapshot,
  ReportGenerateDiagnosticObservation,
} from '@harpa/api-contract';
import { operations as operationSchemas } from '@harpa/api-contract/schemas';
import { useCallback, useEffect, useRef, useState } from 'react';
import { adminAuthClient } from '../../lib/admin-auth';
import type { AdminSession } from '../../lib/admin-auth';
import { getPublicEnv } from '../../lib/env';

type PageState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: AdminSession };

interface ApiIdentity {
  ok: true;
  service: 'api';
  version: string;
  gitCommit: 'local' | string;
  buildTime?: string;
}

interface ReadyResponse {
  ok: true;
  db: 'up';
  head: string | null;
}

interface NotReadyResponse {
  ok: false;
  db: 'down' | 'schema-missing' | 'head-mismatch';
  expected?: string;
  actual?: string | null;
}

interface PagesMarker {
  commit: string;
  branch: string;
}

type ApiIdentityState =
  | { status: 'loading' }
  | { status: 'ready'; identity: ApiIdentity; observedAt: string }
  | { status: 'unknown' };
type ReadinessState =
  | { status: 'loading' }
  | { status: 'healthy'; readiness: ReadyResponse; observedAt: string }
  | { status: 'unavailable'; readiness?: NotReadyResponse; observedAt?: string };
type PagesMarkerState =
  | { status: 'loading' }
  | { status: 'ready'; marker: PagesMarker; observedAt: string }
  | { status: 'unknown' };

interface DeploymentState {
  api: ApiIdentityState;
  product: ReadinessState;
  admin: ReadinessState;
  pages: PagesMarkerState;
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
type R2CapacityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; observation: R2CapacityObservation };
type R2CapacityFetchResult =
  { status: 'ready'; observation: R2CapacityObservation } | { status: 'unauthorized' };
type ReportDiagnosticState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ready'; observation: ReportGenerateDiagnosticObservation }
  | { status: 'invalid-response' }
  | { status: 'request-rejected' }
  | { status: 'rate-limited' }
  | { status: 'unavailable' };
type ReportDiagnosticFetchResult =
  | { status: 'ready'; observation: ReportGenerateDiagnosticObservation }
  | { status: 'invalid-response' }
  | { status: 'request-rejected' }
  | { status: 'rate-limited' }
  | { status: 'unavailable' }
  | { status: 'unauthorized' };

type ReportDiagnosticSuccess = Extract<
  ReportGenerateDiagnosticObservation,
  { status: 'pass' | 'warning' }
>;
type ReportDiagnosticFailure = Extract<ReportGenerateDiagnosticObservation, { status: 'fail' }>;
type ReportDiagnosticWarning = Extract<
  ReportGenerateDiagnosticObservation,
  { status: 'warning' }
>['warnings'][number];

const NEON_CONSOLE_URL = 'https://console.neon.tech/app/projects';
const CLOUDFLARE_CONSOLE_URL = 'https://dash.cloudflare.com/';

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

const INITIAL_DEPLOYMENT_STATE: DeploymentState = {
  api: { status: 'loading' },
  product: { status: 'loading' },
  admin: { status: 'loading' },
  pages: { status: 'loading' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key))
  );
}

function isSafeIdentifier(value: unknown, maximumLength = 160): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
  );
}

function isSafeBranchLabel(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 160 &&
    /^[A-Za-z0-9@][A-Za-z0-9@._/+!-]*$/.test(value)
  );
}

function isSafeVersion(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 64 &&
    /^[A-Za-z0-9][A-Za-z0-9.+_-]*$/.test(value)
  );
}

function isIsoTimestamp(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  ) {
    return false;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const normalizedInput = value.replace(/(?:\.(\d{1,3}))?Z$/, (_match, fraction?: string) => {
    return `.${(fraction ?? '').padEnd(3, '0')}Z`;
  });
  return new Date(parsed).toISOString() === normalizedInput;
}

function isFullSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
}

function parseApiIdentity(value: unknown): ApiIdentity | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['ok', 'service', 'version', 'gitCommit'], ['buildTime']) ||
    value.ok !== true ||
    value.service !== 'api' ||
    !isSafeVersion(value.version) ||
    (value.gitCommit !== 'local' && !isFullSha(value.gitCommit)) ||
    (Object.hasOwn(value, 'buildTime') && !isIsoTimestamp(value.buildTime))
  ) {
    return null;
  }

  return {
    ok: true,
    service: 'api',
    version: value.version,
    gitCommit: value.gitCommit,
    ...(typeof value.buildTime === 'string' ? { buildTime: value.buildTime } : {}),
  };
}

function parseReadyResponse(value: unknown): ReadyResponse | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['ok', 'db', 'head']) ||
    value.ok !== true ||
    value.db !== 'up' ||
    (value.head !== null && !isSafeIdentifier(value.head))
  ) {
    return null;
  }
  return { ok: true, db: 'up', head: value.head };
}

function parseNotReadyResponse(value: unknown): NotReadyResponse | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['ok', 'db'], ['expected', 'actual', 'message']) ||
    value.ok !== false ||
    (value.db !== 'down' && value.db !== 'schema-missing' && value.db !== 'head-mismatch') ||
    (Object.hasOwn(value, 'expected') && !isSafeIdentifier(value.expected)) ||
    (Object.hasOwn(value, 'actual') && value.actual !== null && !isSafeIdentifier(value.actual)) ||
    (Object.hasOwn(value, 'message') &&
      (typeof value.message !== 'string' || value.message.length > 2_000))
  ) {
    return null;
  }

  if (value.db === 'head-mismatch') {
    if (!isSafeIdentifier(value.expected) || !Object.hasOwn(value, 'actual')) return null;
    if (value.actual !== null && !isSafeIdentifier(value.actual)) return null;
    return {
      ok: false,
      db: 'head-mismatch',
      expected: value.expected,
      actual: value.actual,
    };
  }

  if (Object.hasOwn(value, 'expected') || Object.hasOwn(value, 'actual')) return null;

  return {
    ok: false,
    db: value.db,
  };
}

function parsePagesMarker(value: unknown): PagesMarker | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['commit', 'branch']) ||
    !isFullSha(value.commit) ||
    !isSafeBranchLabel(value.branch)
  ) {
    return null;
  }
  return { commit: value.commit, branch: value.branch };
}

async function readJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function loadApiIdentity(): Promise<ApiIdentityState> {
  try {
    const response = await fetch(`${getPublicEnv().apiBaseUrl}/healthz`, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) return { status: 'unknown' };
    const identity = parseApiIdentity(await readJson(response));
    return identity
      ? { status: 'ready', identity, observedAt: new Date().toISOString() }
      : { status: 'unknown' };
  } catch {
    return { status: 'unknown' };
  }
}

async function loadReadiness(path: '/readyz' | '/admin/readyz'): Promise<ReadinessState> {
  try {
    const response = await fetch(`${getPublicEnv().apiBaseUrl}${path}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    const body = await readJson(response);
    if (response.status === 200) {
      const readiness = parseReadyResponse(body);
      return readiness
        ? { status: 'healthy', readiness, observedAt: new Date().toISOString() }
        : { status: 'unavailable' };
    }
    if (response.status === 503) {
      const readiness = parseNotReadyResponse(body);
      return readiness
        ? { status: 'unavailable', readiness, observedAt: new Date().toISOString() }
        : { status: 'unavailable' };
    }
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

async function loadPagesMarker(): Promise<PagesMarkerState> {
  try {
    const response = await fetch('/_cf-pages-deployment.json', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) return { status: 'unknown' };
    const marker = parsePagesMarker(await readJson(response));
    return marker
      ? { status: 'ready', marker, observedAt: new Date().toISOString() }
      : { status: 'unknown' };
  } catch {
    return { status: 'unknown' };
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

function unknownR2CapacityObservation(reason: R2CapacityReason): R2CapacityObservation {
  return {
    observedAt: new Date().toISOString(),
    status: 'unknown',
    reason,
  };
}

function r2ReasonCopy(reason: R2CapacityReason): string {
  switch (reason) {
    case 'not_configured':
      return 'R2 capacity is not configured.';
    case 'timeout':
      return 'Cloudflare request timed out.';
    case 'rate_limited':
      return 'R2 capacity observation was rate limited.';
    case 'forbidden':
      return 'Cloudflare denied access to this capacity observation.';
    case 'invalid_response':
      return 'R2 capacity returned an invalid response.';
    case 'provider_unavailable':
      return 'R2 capacity is temporarily unavailable.';
  }
}

function r2ResponseFailureReason(status: number): R2CapacityReason {
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  if (status === 408 || status === 504) return 'timeout';
  return 'provider_unavailable';
}

async function loadR2Capacity(): Promise<R2CapacityFetchResult> {
  let response: Response;
  try {
    response = await fetch(`${getPublicEnv().apiBaseUrl}/admin/operations/r2-capacity`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    return {
      status: 'ready',
      observation: unknownR2CapacityObservation('provider_unavailable'),
    };
  }

  if (response.status === 401) return { status: 'unauthorized' };
  if (!response.ok) {
    return {
      status: 'ready',
      observation: unknownR2CapacityObservation(r2ResponseFailureReason(response.status)),
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'ready', observation: unknownR2CapacityObservation('invalid_response') };
  }

  const parsed = operationSchemas.r2CapacityObservation.safeParse(body);
  return {
    status: 'ready',
    observation: parsed.success ? parsed.data : unknownR2CapacityObservation('invalid_response'),
  };
}

async function runReportDiagnostic(csrfToken: string): Promise<ReportDiagnosticFetchResult> {
  let response: Response;
  try {
    response = await fetch(`${getPublicEnv().apiBaseUrl}/admin/operations/report-generate`, {
      method: 'POST',
      headers: { 'X-Admin-CSRF': csrfToken },
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    return { status: 'unavailable' };
  }

  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status === 403) return { status: 'request-rejected' };
  if (response.status === 429) return { status: 'rate-limited' };
  if (!response.ok) return { status: 'unavailable' };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'invalid-response' };
  }

  const parsed = operationSchemas.reportGenerateDiagnosticObservation.safeParse(body);
  return parsed.success
    ? { status: 'ready', observation: parsed.data }
    : { status: 'invalid-response' };
}

type EvidenceBadgeState = 'checking' | 'observed' | 'healthy' | 'unavailable' | 'unknown';

function EvidenceBadge({ state }: { state: EvidenceBadgeState }) {
  const label =
    state === 'checking'
      ? 'Checking'
      : state === 'observed'
        ? 'Observed'
        : state === 'healthy'
          ? 'Healthy'
          : state === 'unavailable'
            ? 'Unavailable'
            : 'Unknown';
  const tone =
    state === 'checking'
      ? 'bg-secondary text-ink-soft'
      : state === 'healthy'
        ? 'bg-emerald-100 text-emerald-800'
        : state === 'unavailable'
          ? 'bg-red-100 text-red-800'
          : 'bg-secondary text-ink-soft';

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function ApiIdentityCard({ state, href }: { state: ApiIdentityState; href: string }) {
  const badgeState =
    state.status === 'loading' ? 'checking' : state.status === 'ready' ? 'observed' : 'unknown';

  return (
    <article className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-semibold text-ink">API build identity</h3>
        <EvidenceBadge state={badgeState} />
      </div>
      {state.status === 'loading' ? (
        <p className="mt-3 text-sm text-ink-soft">Checking the API build identity…</p>
      ) : state.status === 'unknown' ? (
        <p className="mt-3 text-sm text-ink-soft">API build identity could not be confirmed.</p>
      ) : (
        <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-ink-soft">Version</dt>
          <dd className="break-all font-mono text-ink">{state.identity.version}</dd>
          <dt className="text-ink-soft">Git commit</dt>
          <dd className="break-all font-mono text-ink">{state.identity.gitCommit}</dd>
          {state.identity.buildTime && (
            <>
              <dt className="text-ink-soft">Built</dt>
              <dd className="break-all font-mono text-ink">
                <time dateTime={state.identity.buildTime}>{state.identity.buildTime}</time>
              </dd>
            </>
          )}
          <dt className="text-ink-soft">Observed</dt>
          <dd className="break-all font-mono text-ink">
            <time dateTime={state.observedAt}>{state.observedAt}</time>
          </dd>
        </dl>
      )}
      <a
        className="mt-4 inline-flex text-sm font-semibold text-accent-ink underline underline-offset-4 ring-focus"
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        Open liveness probe ↗
      </a>
    </article>
  );
}

function readinessDetail(state: Extract<ReadinessState, { status: 'unavailable' }>): string {
  if (!state.readiness) return 'Readiness could not be confirmed.';
  if (state.readiness.db === 'head-mismatch') {
    return 'The observed migration head does not match the running API requirement.';
  }
  if (state.readiness.db === 'schema-missing') {
    return 'Migration metadata could not be found.';
  }
  return 'Database readiness could not be confirmed.';
}

function ReadinessCard({
  name,
  state,
  href,
}: {
  name: string;
  state: ReadinessState;
  href: string;
}) {
  const badgeState =
    state.status === 'loading'
      ? 'checking'
      : state.status === 'healthy'
        ? 'healthy'
        : 'unavailable';
  const mismatch =
    state.status === 'unavailable' && state.readiness?.db === 'head-mismatch'
      ? state.readiness
      : null;

  return (
    <article className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-semibold text-ink">{name}</h3>
        <EvidenceBadge state={badgeState} />
      </div>
      {state.status === 'loading' ? (
        <p className="mt-3 text-sm text-ink-soft">Checking database readiness…</p>
      ) : state.status === 'healthy' ? (
        <>
          <p className="mt-3 text-sm text-ink-soft">Database and schema are ready.</p>
          <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-ink-soft">Migration head</dt>
            <dd className="break-all font-mono text-ink">
              {state.readiness.head ?? 'No migration recorded'}
            </dd>
            <dt className="text-ink-soft">Observed</dt>
            <dd className="break-all font-mono text-ink">
              <time dateTime={state.observedAt}>{state.observedAt}</time>
            </dd>
          </dl>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-soft">{readinessDetail(state)}</p>
          {mismatch && (
            <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-sm">
              {mismatch.expected && (
                <>
                  <dt className="text-ink-soft">Expected</dt>
                  <dd className="break-all font-mono text-ink">{mismatch.expected}</dd>
                </>
              )}
              {Object.hasOwn(mismatch, 'actual') && (
                <>
                  <dt className="text-ink-soft">Actual</dt>
                  <dd className="break-all font-mono text-ink">
                    {mismatch.actual ?? 'No migration recorded'}
                  </dd>
                </>
              )}
            </dl>
          )}
        </>
      )}
      <a
        className="mt-4 inline-flex text-sm font-semibold text-accent-ink underline underline-offset-4 ring-focus"
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        Open readiness probe ↗
      </a>
    </article>
  );
}

function PagesIdentityCard({ state }: { state: PagesMarkerState }) {
  const badgeState =
    state.status === 'loading' ? 'checking' : state.status === 'ready' ? 'observed' : 'unknown';

  return (
    <article className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-semibold text-ink">Administrator Pages identity</h3>
        <EvidenceBadge state={badgeState} />
      </div>
      {state.status === 'loading' ? (
        <p className="mt-3 text-sm text-ink-soft">Checking the same-origin Pages marker…</p>
      ) : state.status === 'unknown' ? (
        <p className="mt-3 text-sm text-ink-soft">
          The same-origin Pages deployment marker is unavailable.
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-ink-soft">Commit</dt>
          <dd className="break-all font-mono text-ink">{state.marker.commit}</dd>
          <dt className="text-ink-soft">Branch</dt>
          <dd className="break-all font-mono text-ink">{state.marker.branch}</dd>
          <dt className="text-ink-soft">Observed</dt>
          <dd className="break-all font-mono text-ink">
            <time dateTime={state.observedAt}>{state.observedAt}</time>
          </dd>
        </dl>
      )}
    </article>
  );
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

const r2Number = new Intl.NumberFormat('en-US');

function r2StatusTone(status: 'available' | 'partial' | 'unknown'): string {
  if (status === 'available') return 'bg-emerald-100 text-emerald-800';
  if (status === 'partial') return 'bg-amber-100 text-amber-800';
  return 'bg-secondary text-ink-soft';
}

function R2StatusBadge({ status }: { status: 'available' | 'partial' | 'unknown' }) {
  const label = status[0]!.toUpperCase() + status.slice(1);
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r2StatusTone(status)}`}>
      {label}
    </span>
  );
}

function StorageSnapshot({ label, snapshot }: { label: string; snapshot: R2StorageClassSnapshot }) {
  const publishedObjectLabel = snapshot.publishedObjects === 1 ? 'object' : 'objects';
  const uploadingObjectLabel = snapshot.uploadingObjects === 1 ? 'object' : 'objects';

  return (
    <article className="rounded-lg bg-secondary p-4">
      <h4 className="font-semibold text-ink">{label}</h4>
      <ul className="mt-3 space-y-1 text-sm text-ink-soft">
        <li>{r2Number.format(snapshot.publishedPayloadBytes)} payload bytes</li>
        <li>{r2Number.format(snapshot.publishedMetadataBytes)} metadata bytes</li>
        <li>
          {r2Number.format(snapshot.publishedObjects)} published {publishedObjectLabel}
        </li>
        <li>{r2Number.format(snapshot.uploadingPayloadBytes)} uploading payload bytes</li>
        <li>{r2Number.format(snapshot.uploadingMetadataBytes)} uploading metadata bytes</li>
        <li>
          {r2Number.format(snapshot.uploadingObjects)} uploading {uploadingObjectLabel}
        </li>
      </ul>
    </article>
  );
}

function OperationEstimate({ label, estimate }: { label: string; estimate: R2OperationEstimate }) {
  return (
    <article className="rounded-lg bg-secondary p-4">
      <h4 className="font-semibold text-ink">{label}</h4>
      <p className="mt-2 text-sm text-ink-soft">
        {r2Number.format(estimate.estimatedUsed)} used
        {' · '}
        {r2Number.format(estimate.estimatedRemaining)} estimated remaining
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        {r2Number.format(estimate.publishedAllowance)} published free-tier reference
      </p>
    </article>
  );
}

function storageClassLabel(storageClass: R2Bucket['defaultStorageClass']): string {
  if (storageClass === 'standard') return 'Standard';
  if (storageClass === 'infrequent_access') return 'Infrequent Access';
  return 'Unknown storage class';
}

function jurisdictionLabel(jurisdiction: R2Bucket['jurisdiction']): string {
  if (jurisdiction === 'default') return 'Default jurisdiction';
  if (jurisdiction === 'eu') return 'EU jurisdiction';
  if (jurisdiction === 'fedramp') return 'FedRAMP jurisdiction';
  return 'Unknown jurisdiction';
}

function R2BucketList({
  buckets,
}: {
  buckets: Extract<R2CapacityObservation, { status: 'available' | 'partial' }>['buckets'];
}) {
  if (buckets.status === 'unknown') {
    return (
      <div className="mt-5 rounded-lg bg-secondary p-4 text-sm text-ink-soft">
        <p className="font-semibold text-ink">Bucket inventory unavailable.</p>
        <p className="mt-1">{r2ReasonCopy(buckets.reason)}</p>
      </div>
    );
  }

  return (
    <div className="mt-5 border-t border-hairline pt-5">
      <h3 className="font-semibold text-ink">
        {r2Number.format(buckets.items.length)} visible{' '}
        {buckets.items.length === 1 ? 'bucket' : 'buckets'}
      </h3>
      <div
        aria-label="R2 buckets"
        className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-hairline"
        role="region"
        tabIndex={0}
      >
        {buckets.items.length === 0 ? (
          <p className="p-4 text-sm text-ink-soft">No visible R2 buckets.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {buckets.items.map((bucket) => (
              <li className="p-4" key={bucket.name}>
                <p className="break-all font-medium text-ink">{bucket.name}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {jurisdictionLabel(bucket.jurisdiction)}
                  {' · '}
                  {bucket.location ? bucket.location.toUpperCase() : 'Location unavailable'}
                  {' · '}
                  {storageClassLabel(bucket.defaultStorageClass)}
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  {bucket.createdAt ? (
                    <>
                      Created <time dateTime={bucket.createdAt}>{bucket.createdAt}</time>
                    </>
                  ) : (
                    'Creation time unavailable'
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function r2CaveatCopy(
  caveat: R2CapacityCaveat,
  observation: Extract<R2CapacityObservation, { status: 'available' | 'partial' }>,
): string {
  switch (caveat) {
    case 'storage_snapshot_not_gb_month':
      return 'Current storage is a snapshot, not remaining GB-month capacity.';
    case 'storage_metrics_may_lag':
      return 'Storage metrics may lag.';
    case 'infrequent_access_not_covered_by_free_tier':
      return 'Infrequent Access storage is outside the Standard-storage free tier.';
    case 'operations_estimated_from_analytics':
      return 'Operation headroom is a conservative account-wide estimate from analytics and published mappings; storage-class eligibility is unavailable, so this is not a provider billing balance.';
    case 'unclassified_operations_excluded': {
      const count =
        observation.operations.status === 'available'
          ? observation.operations.unclassifiedRequests
          : null;
      return count === null
        ? 'Unclassified successful requests were excluded from the operation estimates.'
        : `${r2Number.format(count)} successful ${count === 1 ? 'request was' : 'requests were'} unclassified and excluded from the operation estimates.`;
    }
    case 'bucket_inventory_truncated':
      return 'Bucket inventory is truncated; more buckets may exist.';
  }
}

function R2CapacityDetails({
  observation,
}: {
  observation: Extract<R2CapacityObservation, { status: 'available' | 'partial' }>;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs text-ink-soft">
          Observed <time dateTime={observation.observedAt}>{observation.observedAt}</time>
        </p>
        <R2StatusBadge status={observation.status} />
      </div>

      <div className="mt-5 border-t border-hairline pt-5">
        <h3 className="font-semibold text-ink">Published free-tier reference</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <p className="rounded-lg bg-secondary p-4 text-sm text-ink">
            {r2Number.format(observation.freeTierReference.storageGbMonth)} GB-month
          </p>
          <p className="rounded-lg bg-secondary p-4 text-sm text-ink">
            {r2Number.format(observation.freeTierReference.classAOperations)} Class A operations
          </p>
          <p className="rounded-lg bg-secondary p-4 text-sm text-ink">
            {r2Number.format(observation.freeTierReference.classBOperations)} Class B operations
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-hairline pt-5">
        <h3 className="font-semibold text-ink">Current storage snapshot</h3>
        {observation.storage.status === 'unknown' ? (
          <div className="mt-3 rounded-lg bg-secondary p-4 text-sm text-ink-soft">
            <p className="font-semibold text-ink">Storage snapshot unavailable.</p>
            <p className="mt-1">{r2ReasonCopy(observation.storage.reason)}</p>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <StorageSnapshot label="Standard storage" snapshot={observation.storage.standard} />
            <StorageSnapshot
              label="Infrequent Access"
              snapshot={observation.storage.infrequentAccess}
            />
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-hairline pt-5">
        <h3 className="font-semibold text-ink">Month-to-date operation estimates</h3>
        {observation.operations.status === 'unknown' ? (
          <div className="mt-3 rounded-lg bg-secondary p-4 text-sm text-ink-soft">
            <p className="font-semibold text-ink">Operation estimates unavailable.</p>
            <p className="mt-1">{r2ReasonCopy(observation.operations.reason)}</p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-xs text-ink-soft">
              Window{' '}
              <time dateTime={observation.operations.windowStart}>
                {observation.operations.windowStart}
              </time>
              {' to '}
              <time dateTime={observation.operations.windowEnd}>
                {observation.operations.windowEnd}
              </time>
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <OperationEstimate label="Class A" estimate={observation.operations.classA} />
              <OperationEstimate label="Class B" estimate={observation.operations.classB} />
            </div>
            <p className="mt-3 text-sm text-ink-soft">
              {r2Number.format(observation.operations.freeRequests)} free operations
              {' · '}
              {r2Number.format(observation.operations.unclassifiedRequests)} unclassified successful
              operations
            </p>
          </>
        )}
      </div>

      <R2BucketList buckets={observation.buckets} />

      <div className="mt-5 border-t border-hairline pt-5">
        <h3 className="font-semibold text-ink">Interpretation notes</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-soft">
          {observation.caveats.map((caveat) => (
            <li key={caveat}>{r2CaveatCopy(caveat, observation)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function R2Capacity({ state }: { state: R2CapacityState }) {
  if (state.status === 'idle') return null;

  return (
    <section className="mt-8" aria-labelledby="r2-capacity-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink" id="r2-capacity-title">
            R2 capacity
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Read-only account snapshots and conservative free-tier operation estimates.
          </p>
        </div>
        <a
          className="inline-flex text-sm font-semibold text-accent-ink underline underline-offset-4 ring-focus"
          href={CLOUDFLARE_CONSOLE_URL}
          rel="noreferrer"
          target="_blank"
        >
          Open Cloudflare console ↗
        </a>
      </div>

      <div className="mt-4" aria-live="polite">
        {state.status === 'loading' ? (
          <div className="rounded-xl border border-hairline bg-card p-5 text-sm text-ink-soft shadow-sm">
            Loading R2 capacity…
          </div>
        ) : state.observation.status === 'unknown' ? (
          <div className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-xs text-ink-soft">
                Observed{' '}
                <time dateTime={state.observation.observedAt}>{state.observation.observedAt}</time>
              </p>
              <R2StatusBadge status="unknown" />
            </div>
            <p className="mt-3 text-sm text-ink-soft">{r2ReasonCopy(state.observation.reason)}</p>
          </div>
        ) : (
          <R2CapacityDetails observation={state.observation} />
        )}
      </div>
    </section>
  );
}

const diagnosticNumber = new Intl.NumberFormat('en-US');

function DiagnosticBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'pass' | 'warning' | 'fail' | 'unknown';
}) {
  const toneClass =
    tone === 'pass'
      ? 'bg-emerald-100 text-emerald-800'
      : tone === 'warning'
        ? 'bg-amber-100 text-amber-800'
        : tone === 'fail'
          ? 'bg-red-100 text-red-800'
          : 'bg-secondary text-ink-soft';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{label}</span>
  );
}

function warningCopy(warning: ReportDiagnosticWarning): string {
  switch (warning) {
    case 'replay_only':
      return 'This run exercised the endpoint and persistence, but did not confirm a fresh live AI provider call.';
    case 'limits_unavailable':
      return 'Generation passed, but effective usage limits were unavailable.';
    case 'sign_out_failed':
      return 'Generation passed, but sign-out could not be confirmed.';
  }
}

function failureReasonCopy(reason: ReportDiagnosticFailure['reason']): string {
  switch (reason) {
    case 'sign_in_failed':
      return 'The synthetic account could not sign in.';
    case 'target_not_found':
      return 'The configured synthetic report was not found.';
    case 'target_not_draft':
      return 'The configured synthetic report is not a draft.';
    case 'conflict':
      return 'The synthetic report changed during the diagnostic.';
    case 'usage_limit_exceeded':
      return 'The synthetic account has reached its report-generation limit.';
    case 'rate_limited':
      return 'Rate limiting prevented report generation.';
    case 'provider_error':
      return 'The AI provider could not generate the report.';
    case 'timeout':
      return 'The diagnostic timed out.';
    case 'invalid_response':
      return 'An upstream API returned an invalid response.';
    case 'upstream_unavailable':
      return 'An upstream API was unavailable.';
  }
}

function failurePhaseLabel(phase: ReportDiagnosticFailure['phase']): string {
  switch (phase) {
    case 'sign_in':
      return 'Sign in';
    case 'target_read':
      return 'Target read';
    case 'generate':
      return 'Generate';
    case 'proof_read':
      return 'Proof read';
    case 'limits':
      return 'Limits';
    case 'sign_out':
      return 'Sign out';
  }
}

function CleanupResult({ cleanup }: { cleanup: ReportDiagnosticFailure['cleanup'] }) {
  if (cleanup === 'succeeded') return <p>Sign-out confirmed.</p>;
  if (cleanup === 'failed') return <p>Sign-out could not be confirmed.</p>;
  return <p>No synthetic session was created.</p>;
}

function DiagnosticLimits({ limits }: { limits: NonNullable<ReportDiagnosticSuccess['limits']> }) {
  const rows = [
    ['Report generations', limits.reportGenerate],
    ['AI input tokens', limits.aiInputTokens],
    ['AI output tokens', limits.aiOutputTokens],
  ] as const;

  return (
    <div className="mt-5 border-t border-hairline pt-5">
      <h4 className="font-semibold text-ink">
        {limits.plan[0]!.toUpperCase() + limits.plan.slice(1)} plan
      </h4>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {rows.map(([label, bucket]) => (
          <article className="rounded-lg bg-secondary p-4" key={label}>
            <h5 className="text-sm font-semibold text-ink">{label}</h5>
            <p className="mt-1 text-sm text-ink-soft">
              {diagnosticNumber.format(bucket.used)} used
              {' · '}
              {bucket.remaining === null
                ? 'Unlimited'
                : `${diagnosticNumber.format(bucket.remaining)} remaining`}
              {bucket.limit === null ? '' : ` · ${diagnosticNumber.format(bucket.limit)} limit`}
            </p>
            {bucket.overridden && (
              <p className="mt-1 text-xs font-medium text-accent-ink">Custom limit</p>
            )}
            <p className="mt-2 text-xs text-ink-soft">
              Resets <time dateTime={bucket.resetAt}>{bucket.resetAt}</time>
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function SuccessfulDiagnostic({ observation }: { observation: ReportDiagnosticSuccess }) {
  const isWarning = observation.status === 'warning';
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">
            Observed <time dateTime={observation.observedAt}>{observation.observedAt}</time>
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Completed in {diagnosticNumber.format(observation.durationMs)} ms.
          </p>
        </div>
        <DiagnosticBadge
          label={isWarning ? 'Warning' : 'Pass'}
          tone={isWarning ? 'warning' : 'pass'}
        />
      </div>

      {isWarning && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-800">
          {observation.warnings.map((warning) => (
            <li key={warning}>{warningCopy(warning)}</li>
          ))}
        </ul>
      )}

      <div className="mt-5 grid gap-5 border-t border-hairline pt-5 lg:grid-cols-2">
        <div>
          <h4 className="font-semibold text-ink">Synthetic target</h4>
          <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-ink-soft">Account</dt>
            <dd className="break-all text-ink">{observation.target.accountEmail}</dd>
            <dt className="text-ink-soft">Project</dt>
            <dd className="break-all text-ink">{observation.target.projectId}</dd>
            <dt className="text-ink-soft">Report ID</dt>
            <dd className="break-all text-ink">{observation.target.reportId}</dd>
            <dt className="text-ink-soft">Report</dt>
            <dd className="text-ink">Report {observation.target.reportNumber}</dd>
          </dl>
        </div>

        <div>
          <h4 className="font-semibold text-ink">Generation proof</h4>
          <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-ink-soft">Mode</dt>
            <dd className="text-ink">
              {observation.generation.fixtureMode === 'live' ? 'Live' : 'Replay'}
            </dd>
            <dt className="text-ink-soft">Provider</dt>
            <dd className="text-ink">{observation.generation.vendor}</dd>
            <dt className="text-ink-soft">Model</dt>
            <dd className="break-all text-ink">{observation.generation.model}</dd>
            <dt className="text-ink-soft">HTTP</dt>
            <dd className="text-ink">{observation.generation.httpStatus}</dd>
            <dt className="text-ink-soft">Request ID</dt>
            <dd className="break-all text-ink">
              {observation.generation.requestId ?? 'Not returned'}
            </dd>
            <dt className="text-ink-soft">Latency</dt>
            <dd className="text-ink">
              {diagnosticNumber.format(observation.generation.durationMs)} ms
            </dd>
            <dt className="text-ink-soft">Idempotency</dt>
            <dd className="text-ink">
              {observation.generation.idempotentReplay ? 'Replayed' : 'Fresh'}
            </dd>
          </dl>
        </div>
      </div>

      <div className="mt-5 grid gap-3 border-t border-hairline pt-5 text-sm md:grid-cols-2">
        {[
          ['Requested', observation.generation.requestedAt],
          ['Finished', observation.generation.finishedAt],
          ['Report updated', observation.generation.reportUpdatedAt],
          ['Generated', observation.generation.generatedAt],
        ].map(([label, timestamp]) => (
          <p className="text-ink-soft" key={label}>
            {label} <time dateTime={timestamp}>{timestamp}</time>
          </p>
        ))}
      </div>

      {observation.limits && <DiagnosticLimits limits={observation.limits} />}

      <div className="mt-5 border-t border-hairline pt-5 text-sm text-ink">
        {observation.cleanup === 'succeeded' ? (
          <p>Sign-out confirmed.</p>
        ) : (
          <p>Sign-out could not be confirmed.</p>
        )}
      </div>
    </div>
  );
}

function FailedDiagnostic({ observation }: { observation: ReportDiagnosticFailure }) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">
            Observed <time dateTime={observation.observedAt}>{observation.observedAt}</time>
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Stopped after {diagnosticNumber.format(observation.durationMs)} ms.
          </p>
        </div>
        <DiagnosticBadge label="Failed" tone="fail" />
      </div>
      <dl className="mt-5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 border-t border-hairline pt-5 text-sm">
        <dt className="text-ink-soft">Phase</dt>
        <dd className="text-ink">{failurePhaseLabel(observation.phase)}</dd>
        <dt className="text-ink-soft">Result</dt>
        <dd className="text-ink">{failureReasonCopy(observation.reason)}</dd>
        <dt className="text-ink-soft">Cleanup</dt>
        <dd className="text-ink">
          <CleanupResult cleanup={observation.cleanup} />
        </dd>
      </dl>
    </div>
  );
}

function DiagnosticResult({ state }: { state: ReportDiagnosticState }) {
  if (state.status === 'idle') return <p>Not run yet in this browser session.</p>;
  if (state.status === 'running') return <p>Running diagnostic…</p>;
  if (state.status === 'invalid-response') {
    return (
      <div>
        <DiagnosticBadge label="Unknown" tone="unknown" />
        <p className="mt-3 text-sm text-ink-soft">The diagnostic returned an invalid response.</p>
      </div>
    );
  }
  if (state.status === 'request-rejected') {
    return (
      <div>
        <DiagnosticBadge label="Request rejected" tone="fail" />
        <p className="mt-3 text-sm text-ink-soft">
          The admin origin or CSRF check rejected this diagnostic request.
        </p>
      </div>
    );
  }
  if (state.status === 'rate-limited') {
    return (
      <div>
        <DiagnosticBadge label="Rate limited" tone="warning" />
        <p className="mt-3 text-sm text-ink-soft">Diagnostic run limit reached. Try again later.</p>
      </div>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <div>
        <DiagnosticBadge label="Unknown" tone="unknown" />
        <p className="mt-3 text-sm text-ink-soft">The diagnostic could not be reached.</p>
      </div>
    );
  }

  if (state.observation.status === 'unknown') {
    return (
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-ink-soft">
            Observed{' '}
            <time dateTime={state.observation.observedAt}>{state.observation.observedAt}</time>
          </p>
          <DiagnosticBadge label="Unknown" tone="unknown" />
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          Report-generation diagnostic is not configured.
        </p>
      </div>
    );
  }
  if (state.observation.status === 'fail') {
    return <FailedDiagnostic observation={state.observation} />;
  }
  return <SuccessfulDiagnostic observation={state.observation} />;
}

function ReportDiagnostic({ state, onRun }: { state: ReportDiagnosticState; onRun: () => void }) {
  const running = state.status === 'running';
  return (
    <section className="mt-8" aria-labelledby="report-diagnostic-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink" id="report-diagnostic-title">
            Report generation diagnostic
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Each run updates one synthetic report and may consume AI quota.
          </p>
        </div>
        <button className={buttonClass} disabled={running} type="button" onClick={onRun}>
          Run diagnostic
        </button>
      </div>
      <div
        aria-live="polite"
        className="mt-4 rounded-xl border border-hairline bg-card p-5 text-ink shadow-sm"
      >
        <DiagnosticResult state={state} />
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
  const [deployment, setDeployment] = useState<DeploymentState>(INITIAL_DEPLOYMENT_STATE);
  const [neonInventory, setNeonInventory] = useState<NeonInventoryState>({ status: 'idle' });
  const [r2Capacity, setR2Capacity] = useState<R2CapacityState>({ status: 'idle' });
  const [reportDiagnostic, setReportDiagnostic] = useState<ReportDiagnosticState>({
    status: 'idle',
  });
  const reportDiagnosticRunning = useRef(false);
  const refreshGeneration = useRef(0);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const generation = refreshGeneration.current + 1;
    refreshGeneration.current = generation;
    const isCurrent = () => refreshGeneration.current === generation;
    setRefreshing(true);
    setNeonInventory({ status: 'loading' });
    setR2Capacity({ status: 'loading' });
    try {
      const [, , , , inventory, capacity] = await Promise.all([
        loadApiIdentity().then((api) => {
          if (isCurrent()) setDeployment((current) => ({ ...current, api }));
        }),
        loadReadiness('/readyz').then((product) => {
          if (isCurrent()) setDeployment((current) => ({ ...current, product }));
        }),
        loadReadiness('/admin/readyz').then((admin) => {
          if (isCurrent()) setDeployment((current) => ({ ...current, admin }));
        }),
        loadPagesMarker().then((pages) => {
          if (isCurrent()) setDeployment((current) => ({ ...current, pages }));
        }),
        loadNeonInventory(),
        loadR2Capacity(),
      ]);
      if (!isCurrent()) return;
      if (inventory.status === 'unauthorized' || capacity.status === 'unauthorized') {
        onSessionExpired();
        return;
      }
      setNeonInventory(inventory);
      setR2Capacity(capacity);
    } finally {
      if (isCurrent()) setRefreshing(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRunDiagnostic = useCallback(async () => {
    if (reportDiagnosticRunning.current) return;
    reportDiagnosticRunning.current = true;
    setReportDiagnostic({ status: 'running' });
    try {
      const result = await runReportDiagnostic(session.csrfToken);
      if (result.status === 'unauthorized') {
        onSessionExpired();
        return;
      }
      setReportDiagnostic(result);
    } finally {
      reportDiagnosticRunning.current = false;
    }
  }, [onSessionExpired, session.csrfToken]);

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

      <section className="mt-6" aria-labelledby="deployment-identity-title">
        <div>
          <h2 className="text-xl font-semibold text-ink" id="deployment-identity-title">
            Deployment identity and readiness
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Checked on page load and when you press Refresh. Each card reports its own evidence
            source.
          </p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2" aria-live="polite">
          <ApiIdentityCard state={deployment.api} href={`${apiBaseUrl}/healthz`} />
          <ReadinessCard
            name="Product database readiness"
            state={deployment.product}
            href={`${apiBaseUrl}/readyz`}
          />
          <ReadinessCard
            name="Administrator database readiness"
            state={deployment.admin}
            href={`${apiBaseUrl}/admin/readyz`}
          />
          <PagesIdentityCard state={deployment.pages} />
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          Build identity, readiness, provider metadata, and exact promotion proof are different
          evidence classes.
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          API and Pages commits can differ in pull-request previews: Fly can run a synthetic merge
          commit while Pages reports the pull-request head. A difference is not, by itself,
          deployment drift.
        </p>
      </section>

      <ReportDiagnostic state={reportDiagnostic} onRun={() => void handleRunDiagnostic()} />

      <NeonInventory state={neonInventory} />

      <R2Capacity state={r2Capacity} />

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
