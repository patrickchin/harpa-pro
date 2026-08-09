import type {
  AiUsageObservation,
  AiUsageReason,
  FlyApp,
  FlyInventoryObservation,
  FlyInventoryReason,
  NeonInventoryObservation,
  NeonInventoryReason,
  NeonProject,
  NeonUsageObservation,
  NeonUsageOrganizationTransferReason,
  NeonUsageProject,
  NeonUsageProjectReason,
  NeonUsageReason,
  R2Bucket,
  R2CapacityCaveat,
  R2CapacityObservation,
  R2CapacityReason,
  R2OperationEstimate,
  R2StorageClassSnapshot,
  SentryObservation,
  SentryObservationReason,
  ReportGenerateDiagnosticObservation,
  StorageLifecycleObservation,
  StorageLifecycleReason,
} from '@harpa/api-contract';
import { operations as operationSchemas } from '@harpa/api-contract/schemas';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { adminAuthClient } from '../../lib/admin-auth';
import type { AdminSession } from '../../lib/admin-auth';
import { getPublicEnv } from '../../lib/env';
import { calculateQuotaPercentages } from '../../lib/quota-percentages';

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
  publicPages: PagesMarkerState;
  adminPages: PagesMarkerState;
  dashboardPages: PagesMarkerState;
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

type NeonInventoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; observation: NeonInventoryObservation };
type NeonInventoryFetchResult =
  { status: 'ready'; observation: NeonInventoryObservation } | { status: 'unauthorized' };
type NeonUsageState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; observation: NeonUsageObservation };
type NeonUsageFetchResult =
  { status: 'ready'; observation: NeonUsageObservation } | { status: 'unauthorized' };
type R2CapacityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; observation: R2CapacityObservation };
type R2CapacityFetchResult =
  { status: 'ready'; observation: R2CapacityObservation } | { status: 'unauthorized' };
type SentryState =
  { status: 'idle' } | { status: 'loading' } | { status: 'ready'; observation: SentryObservation };
type SentryFetchResult =
  { status: 'ready'; observation: SentryObservation } | { status: 'unauthorized' };
type FlyInventoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; observation: FlyInventoryObservation };
type FlyInventoryFetchResult =
  { status: 'ready'; observation: FlyInventoryObservation } | { status: 'unauthorized' };
type StorageLifecycleState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; observation: StorageLifecycleObservation };
type StorageLifecycleFetchResult =
  { status: 'ready'; observation: StorageLifecycleObservation } | { status: 'unauthorized' };
type AiUsageState =
  { status: 'idle' } | { status: 'loading' } | { status: 'ready'; observation: AiUsageObservation };
type AiUsageFetchResult =
  { status: 'ready'; observation: AiUsageObservation } | { status: 'unauthorized' };
type ReportCanaryState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ready'; observation: ReportGenerateDiagnosticObservation }
  | { status: 'invalid-response' }
  | { status: 'request-rejected' }
  | { status: 'rate-limited' }
  | { status: 'unavailable' };
type ReportCanaryFetchResult =
  | { status: 'ready'; observation: ReportGenerateDiagnosticObservation }
  | { status: 'invalid-response' }
  | { status: 'request-rejected' }
  | { status: 'rate-limited' }
  | { status: 'unavailable' }
  | { status: 'unauthorized' };

type ReportCanarySuccess = Extract<
  ReportGenerateDiagnosticObservation,
  { status: 'pass' | 'warning' }
>;
type ReportCanaryFailure = Extract<ReportGenerateDiagnosticObservation, { status: 'fail' }>;
type ReportCanaryWarning = Extract<
  ReportGenerateDiagnosticObservation,
  { status: 'warning' }
>['warnings'][number];
type AvailableStorageLifecycleObservation = Extract<
  StorageLifecycleObservation,
  { status: 'available' }
>;

type ActiveNeonUsageObservation = Exclude<NeonUsageObservation, { status: 'unknown' }>;
type AvailableAiUsageObservation = Extract<AiUsageObservation, { status: 'available' }>;
type AiUsageWindow = AvailableAiUsageObservation['monthToDate'];
type AiUsageProvider = AiUsageWindow['providers'][number];
type AiUsageOperation = AiUsageWindow['operations'][keyof AiUsageWindow['operations']];
type AiUsageWarning = AiUsageWindow['warnings'][number];
type AiUsageCaveat = AvailableAiUsageObservation['caveats'][number];

const NEON_CONSOLE_URL = 'https://console.neon.tech/app/projects';
const CLOUDFLARE_CONSOLE_URL = 'https://dash.cloudflare.com/';
const FLY_DASHBOARD_URL = 'https://fly.io/dashboard';
const OPENAI_USAGE_URL = 'https://platform.openai.com/usage';
const GROQ_DASHBOARD_URL = 'https://console.groq.com/keys';
const KIMI_DASHBOARD_URL = 'https://platform.kimi.ai/console';
const GITHUB_REPOSITORY_URL = 'https://github.com/patrickchin/harpa-pro';
const GITHUB_API_URL = 'https://api.github.com/repos/patrickchin/harpa-pro';
const GITHUB_ACCEPT = 'application/vnd.github+json';

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
  publicPages: { status: 'loading' },
  adminPages: { status: 'loading' },
  dashboardPages: { status: 'loading' },
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
    remaining > limit ||
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
  return Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : null;
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

const quotaPercentFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatQuotaPercent(value: number): string {
  return quotaPercentFormatter.format(value);
}

function QuotaProgress({
  accessibleName,
  used,
  allowance,
}: {
  accessibleName: string;
  used: number;
  allowance: number;
}) {
  const percentages = calculateQuotaPercentages(used, allowance);
  if (!percentages) return null;
  const valueText = `${formatQuotaPercent(percentages.usedPercent)}% used, ${formatQuotaPercent(
    percentages.remainingPercent,
  )}% remaining`;

  return (
    <div className="mt-3">
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          aria-label={accessibleName}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percentages.paintedPercent}
          aria-valuetext={valueText}
          className="h-2 rounded-full bg-accent"
          role="progressbar"
          style={{ width: `${percentages.paintedPercent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-ink-soft">{valueText}</p>
    </div>
  );
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

function isPagesBranch(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 160 &&
    /^(?:main|dev|pr-[1-9][0-9]*)$/.test(value)
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
    !isPagesBranch(value.branch)
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

async function loadPagesMarker(
  url: string,
  credentials: 'omit' | 'same-origin',
): Promise<PagesMarkerState> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials,
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

function unknownNeonUsageObservation(reason: NeonUsageReason): NeonUsageObservation {
  return {
    observedAt: new Date().toISOString(),
    status: 'unknown',
    reason,
  };
}

function neonUsageReasonCopy(reason: NeonUsageReason): string {
  switch (reason) {
    case 'not_configured':
      return 'Neon Free usage is not configured.';
    case 'unsupported_plan':
      return 'Neon plan is not the supported Free plan.';
    case 'unsafe_permissions':
      return 'Viewer-only Neon usage access could not be verified.';
    case 'timeout':
      return 'Neon Free usage request timed out.';
    case 'rate_limited':
      return 'Neon Free usage observation was rate limited.';
    case 'forbidden':
      return 'Neon denied access to this usage observation.';
    case 'not_found':
      return 'The requested Neon usage observation was not found.';
    case 'invalid_response':
      return 'Neon Free usage returned an invalid response.';
    case 'provider_unavailable':
      return 'Neon Free usage is temporarily unavailable.';
  }
}

function neonUsageProjectReasonCopy(reason: NeonUsageProjectReason): string {
  switch (reason) {
    case 'timeout':
      return 'Provider request timed out.';
    case 'rate_limited':
      return 'Neon rate limiting prevented this observation.';
    case 'forbidden':
      return 'Neon denied access to this usage observation.';
    case 'not_found':
      return 'The requested Neon usage observation was not found.';
    case 'invalid_response':
      return 'Neon returned an invalid usage response.';
    case 'provider_unavailable':
      return 'Neon usage is temporarily unavailable.';
  }
}

function neonUsageTransferReasonCopy(reason: NeonUsageOrganizationTransferReason): string {
  switch (reason) {
    case 'incomplete_project_coverage':
      return 'Complete project coverage is unavailable.';
    case 'period_mismatch':
      return 'Project usage periods do not align.';
    case 'invalid_response':
      return 'Project transfer totals could not be safely reconciled.';
    case 'no_projects':
      return 'Organization transfer has no visible project consumption period.';
  }
}

function neonUsageResponseFailureReason(status: number): NeonUsageReason {
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  return 'provider_unavailable';
}

async function loadNeonUsage(): Promise<NeonUsageFetchResult> {
  let response: Response;
  try {
    response = await fetch(`${getPublicEnv().apiBaseUrl}/admin/operations/neon-usage`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    return {
      status: 'ready',
      observation: unknownNeonUsageObservation('provider_unavailable'),
    };
  }

  if (response.status === 401) return { status: 'unauthorized' };
  if (!response.ok) {
    return {
      status: 'ready',
      observation: unknownNeonUsageObservation(neonUsageResponseFailureReason(response.status)),
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'ready', observation: unknownNeonUsageObservation('invalid_response') };
  }

  const parsed = operationSchemas.neonUsageObservation.safeParse(body);
  return {
    status: 'ready',
    observation: parsed.success ? parsed.data : unknownNeonUsageObservation('invalid_response'),
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

function unknownSentryObservation(reason: SentryObservationReason): SentryObservation {
  return {
    observedAt: new Date().toISOString(),
    status: 'unknown',
    reason,
  };
}

function sentryReasonCopy(reason: SentryObservationReason): string {
  switch (reason) {
    case 'not_configured':
      return 'Sentry observation is not configured.';
    case 'timeout':
      return 'Sentry request timed out.';
    case 'rate_limited':
      return 'Sentry observation was rate limited.';
    case 'forbidden':
      return 'Sentry denied access to this observation.';
    case 'not_found':
      return 'The configured Sentry organization or project was not found.';
    case 'invalid_response':
      return 'Sentry returned an invalid response.';
    case 'provider_unavailable':
      return 'Sentry is temporarily unavailable.';
    case 'no_session_data':
      return 'No mobile session data was available.';
  }
}

function sentryResponseFailureReason(status: number): SentryObservationReason {
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  return 'provider_unavailable';
}

async function loadSentryObservation(): Promise<SentryFetchResult> {
  let response: Response;
  try {
    response = await fetch(`${getPublicEnv().apiBaseUrl}/admin/operations/sentry`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    return {
      status: 'ready',
      observation: unknownSentryObservation('provider_unavailable'),
    };
  }

  if (response.status === 401) return { status: 'unauthorized' };
  if (!response.ok) {
    return {
      status: 'ready',
      observation: unknownSentryObservation(sentryResponseFailureReason(response.status)),
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'ready', observation: unknownSentryObservation('invalid_response') };
  }

  const parsed = operationSchemas.sentryObservation.safeParse(body);
  return {
    status: 'ready',
    observation: parsed.success ? parsed.data : unknownSentryObservation('invalid_response'),
  };
}

function unknownFlyInventoryObservation(reason: FlyInventoryReason): FlyInventoryObservation {
  return {
    observedAt: new Date().toISOString(),
    status: 'unknown',
    reason,
  };
}

function flyReasonCopy(reason: FlyInventoryReason): string {
  switch (reason) {
    case 'not_configured':
      return 'Fly inventory is not configured.';
    case 'timeout':
      return 'Fly request timed out.';
    case 'rate_limited':
      return 'Fly inventory request was rate limited.';
    case 'forbidden':
      return 'Fly denied access to this inventory.';
    case 'not_found':
      return 'The requested Fly inventory was not found.';
    case 'invalid_response':
      return 'Fly inventory returned an invalid response.';
    case 'provider_unavailable':
      return 'Fly inventory is temporarily unavailable.';
  }
}

function flyResponseFailureReason(status: number): FlyInventoryReason {
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  return 'provider_unavailable';
}

async function loadFlyInventory(): Promise<FlyInventoryFetchResult> {
  let response: Response;
  try {
    response = await fetch(`${getPublicEnv().apiBaseUrl}/admin/operations/fly-inventory`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    return {
      status: 'ready',
      observation: unknownFlyInventoryObservation('provider_unavailable'),
    };
  }

  if (response.status === 401) return { status: 'unauthorized' };
  if (!response.ok) {
    return {
      status: 'ready',
      observation: unknownFlyInventoryObservation(flyResponseFailureReason(response.status)),
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      status: 'ready',
      observation: unknownFlyInventoryObservation('invalid_response'),
    };
  }

  const parsed = operationSchemas.flyInventoryObservation.safeParse(body);
  return {
    status: 'ready',
    observation: parsed.success ? parsed.data : unknownFlyInventoryObservation('invalid_response'),
  };
}

function unknownStorageLifecycleObservation(
  reason: StorageLifecycleReason,
): StorageLifecycleObservation {
  return {
    observedAt: new Date().toISOString(),
    status: 'unknown',
    reason,
  };
}

function storageLifecycleReasonCopy(reason: StorageLifecycleReason): string {
  switch (reason) {
    case 'rollout_state_missing':
      return 'Storage lifecycle rollout state is missing.';
    case 'timeout':
      return 'Storage lifecycle request timed out.';
    case 'database_unavailable':
      return 'Storage lifecycle is temporarily unavailable.';
    case 'invalid_response':
      return 'Storage lifecycle returned an invalid response.';
  }
}

async function loadStorageLifecycle(): Promise<StorageLifecycleFetchResult> {
  let response: Response;
  try {
    response = await fetch(`${getPublicEnv().apiBaseUrl}/admin/operations/storage-lifecycle`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    return {
      status: 'ready',
      observation: unknownStorageLifecycleObservation('database_unavailable'),
    };
  }

  if (response.status === 401) return { status: 'unauthorized' };
  if (!response.ok) {
    return {
      status: 'ready',
      observation: unknownStorageLifecycleObservation(
        response.status === 408 || response.status === 504 ? 'timeout' : 'database_unavailable',
      ),
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      status: 'ready',
      observation: unknownStorageLifecycleObservation('invalid_response'),
    };
  }

  const parsed = operationSchemas.storageLifecycleObservation.safeParse(body);
  return {
    status: 'ready',
    observation: parsed.success
      ? parsed.data
      : unknownStorageLifecycleObservation('invalid_response'),
  };
}

function unknownAiUsageObservation(reason: AiUsageReason): AiUsageObservation {
  return {
    observedAt: new Date().toISOString(),
    status: 'unknown',
    reason,
  };
}

function aiUsageReasonCopy(reason: AiUsageReason): string {
  switch (reason) {
    case 'schema_unavailable':
      return 'The AI usage ledger schema is unavailable.';
    case 'database_unavailable':
      return 'The AI usage ledger is temporarily unavailable.';
    case 'timeout':
      return 'The AI usage ledger query timed out.';
    case 'invalid_response':
      return 'The AI usage ledger returned an invalid response.';
  }
}

function aiUsageResponseFailureReason(status: number): AiUsageReason {
  if (status === 408 || status === 504) return 'timeout';
  return 'database_unavailable';
}

async function loadAiUsage(): Promise<AiUsageFetchResult> {
  let response: Response;
  try {
    response = await fetch(`${getPublicEnv().apiBaseUrl}/admin/operations/ai-usage`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    return {
      status: 'ready',
      observation: unknownAiUsageObservation('database_unavailable'),
    };
  }

  if (response.status === 401) return { status: 'unauthorized' };
  if (!response.ok) {
    return {
      status: 'ready',
      observation: unknownAiUsageObservation(aiUsageResponseFailureReason(response.status)),
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      status: 'ready',
      observation: unknownAiUsageObservation('invalid_response'),
    };
  }

  const parsed = operationSchemas.aiUsageObservation.safeParse(body);
  return {
    status: 'ready',
    observation: parsed.success ? parsed.data : unknownAiUsageObservation('invalid_response'),
  };
}

async function runReportCanary(csrfToken: string): Promise<ReportCanaryFetchResult> {
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

function PagesIdentityCard({
  name,
  source,
  state,
}: {
  name: string;
  source: string;
  state: PagesMarkerState;
}) {
  const badgeState =
    state.status === 'loading' ? 'checking' : state.status === 'ready' ? 'observed' : 'unknown';

  return (
    <article className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-semibold text-ink">{name}</h3>
        <EvidenceBadge state={badgeState} />
      </div>
      {state.status === 'loading' ? (
        <p className="mt-3 text-sm text-ink-soft">Checking the {source} Pages marker…</p>
      ) : state.status === 'unknown' ? (
        <p className="mt-3 text-sm text-ink-soft">The {source} Pages marker is unavailable.</p>
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

const neonUsageNumber = new Intl.NumberFormat('en-US');

function NeonUsageStatusBadge({ status }: { status: 'available' | 'partial' | 'unknown' }) {
  const tone =
    status === 'available'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'partial'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-secondary text-ink-soft';
  const label = status[0]!.toUpperCase() + status.slice(1);
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function neonUsageCaveatCopy(caveat: ActiveNeonUsageObservation['caveats'][number]) {
  switch (caveat) {
    case 'provider_values_may_lag':
      return 'Provider values may lag.';
    case 'free_plan_published_reference':
      return 'Percentages use Neon Free-plan published references.';
    case 'storage_uses_published_reference':
      return 'Storage uses a published reference, not a provider-returned remaining value.';
    case 'transfer_requires_complete_project_coverage':
      return 'Organization transfer percentage requires complete project coverage.';
    case 'not_invoice_or_credit_balance':
      return 'Not an invoice or credit balance.';
    case 'published_allowances_can_change':
      return 'Published provider allowances can change.';
  }
}

function NeonUsageMetricCard({
  label,
  projectName,
  used,
  allowance,
  unit,
}: {
  label: 'compute' | 'storage';
  projectName: string;
  used: number;
  allowance: number;
  unit: 'cu_seconds' | 'bytes';
}) {
  const percentages = calculateQuotaPercentages(used, allowance);
  const accessibleName =
    percentages === null
      ? `${projectName} ${label}`
      : `${projectName} ${label}: ${formatQuotaPercent(percentages.usedPercent)}% used, ${formatQuotaPercent(percentages.remainingPercent)}% remaining`;
  const unitLabel = unit === 'cu_seconds' ? 'CU-seconds' : 'bytes';

  return (
    <div className="rounded-lg bg-secondary p-4">
      <h4 className="font-semibold text-ink">{label === 'compute' ? 'Compute' : 'Storage'}</h4>
      <p className="mt-2 text-sm text-ink-soft">
        {neonUsageNumber.format(used)} {unitLabel} used
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        {neonUsageNumber.format(allowance)} {unitLabel} published reference
      </p>
      {percentages && (
        <QuotaProgress accessibleName={accessibleName} allowance={allowance} used={used} />
      )}
    </div>
  );
}

function NeonUsageProjectCard({ project }: { project: NeonUsageProject }) {
  return (
    <article className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
      <h3 className="font-semibold text-ink">{project.name}</h3>
      <p className="mt-1 break-all text-xs text-ink-soft">{project.id}</p>
      <p className="mt-1 text-xs text-ink-soft">{project.effectivePermission}</p>

      {project.status === 'unknown' ? (
        <div className="mt-4 rounded-lg bg-secondary p-4 text-sm text-ink-soft">
          <p className="font-semibold text-ink">Project usage unavailable.</p>
          <p className="mt-1">{neonUsageProjectReasonCopy(project.reason)}</p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-xs text-ink-soft">
            Window <time dateTime={project.periodStart}>{project.periodStart}</time>
            {' to '}
            <time dateTime={project.periodEnd}>{project.periodEnd}</time>
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <NeonUsageMetricCard
              allowance={project.compute.allowance}
              label="compute"
              projectName={project.name}
              unit={project.compute.unit}
              used={project.compute.used}
            />
            <NeonUsageMetricCard
              allowance={project.storage.allowance}
              label="storage"
              projectName={project.name}
              unit={project.storage.unit}
              used={project.storage.used}
            />
          </div>
          <div className="mt-4 rounded-lg bg-secondary p-4">
            <h4 className="font-semibold text-ink">Public network transfer contribution</h4>
            <p className="mt-2 text-sm text-ink-soft">
              {neonUsageNumber.format(project.transferBytes)} bytes used
            </p>
          </div>
        </>
      )}
    </article>
  );
}

function NeonUsageDetails({ observation }: { observation: ActiveNeonUsageObservation }) {
  const transfer = observation.organizationTransfer;
  const transferPercentages =
    transfer.status === 'available'
      ? calculateQuotaPercentages(transfer.used, transfer.allowance)
      : null;
  const transferAccessibleName =
    transfer.status === 'available' && transferPercentages
      ? `Organization public network transfer: ${formatQuotaPercent(
          transferPercentages.usedPercent,
        )}% used, ${formatQuotaPercent(transferPercentages.remainingPercent)}% remaining`
      : null;

  return (
    <div className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink">
            {observation.projects.length} visible{' '}
            {observation.projects.length === 1 ? 'project' : 'projects'}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Observed <time dateTime={observation.observedAt}>{observation.observedAt}</time>
          </p>
        </div>
        <NeonUsageStatusBadge status={observation.status} />
      </div>

      {observation.projects.length === 0 ? (
        <div className="mt-4 rounded-lg bg-secondary p-4 text-sm text-ink-soft">
          {observation.status === 'partial' ? (
            <>
              <p>Project discovery is incomplete; no project usage rows were safely available.</p>
              {observation.unavailableProjectCount > 0 ? (
                <p className="mt-1">
                  {observation.unavailableProjectCount} provider-reported{' '}
                  {observation.unavailableProjectCount === 1
                    ? 'project is unavailable.'
                    : 'projects are unavailable.'}
                </p>
              ) : null}
              {observation.projectsTruncated ? (
                <p className="mt-1">Project discovery is truncated.</p>
              ) : null}
            </>
          ) : (
            'No Neon projects were returned.'
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {observation.projects.map((project) => (
            <NeonUsageProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      <div className="mt-5 border-t border-hairline pt-5">
        <h3 className="font-semibold text-ink">Organization transfer percentage</h3>
        {transfer.status === 'available' ? (
          transferPercentages && transferAccessibleName ? (
            <>
              <p className="mt-2 text-sm text-ink-soft">
                {neonUsageNumber.format(transfer.used)} bytes used
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {neonUsageNumber.format(transfer.allowance)} bytes published reference
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                Window <time dateTime={transfer.periodStart}>{transfer.periodStart}</time>
                {' to '}
                <time dateTime={transfer.periodEnd}>{transfer.periodEnd}</time>
              </p>
              <QuotaProgress
                accessibleName={transferAccessibleName}
                allowance={transfer.allowance}
                used={transfer.used}
              />
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink-soft">
                Organization transfer percentage: Unknown
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Project transfer totals could not be safely reconciled.
              </p>
            </>
          )
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-soft">Organization transfer percentage: Unknown</p>
            <p className="mt-1 text-sm text-ink-soft">
              {neonUsageTransferReasonCopy(transfer.reason)}
            </p>
          </>
        )}
      </div>

      <div className="mt-5 border-t border-hairline pt-5">
        <h3 className="font-semibold text-ink">Interpretation notes</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-soft">
          {observation.caveats.map((caveat) => (
            <li key={caveat}>{neonUsageCaveatCopy(caveat)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function NeonUsage({ state }: { state: NeonUsageState }) {
  if (state.status === 'idle') return null;

  return (
    <section className="mt-8" aria-labelledby="neon-usage-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink" id="neon-usage-title">
            Neon Free usage
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Read-only Free-tier percentages derived from Neon usage and published references.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <a
            className="text-accent-ink underline underline-offset-4 ring-focus"
            href="https://neon.com/pricing"
            rel="noreferrer"
            target="_blank"
          >
            Open Neon pricing ↗
          </a>
          <a
            className="text-ink-soft underline underline-offset-4 ring-focus"
            href={NEON_CONSOLE_URL}
            rel="noreferrer"
            target="_blank"
          >
            Open Neon console ↗
          </a>
        </div>
      </div>

      <div className="mt-4" aria-live="polite">
        {state.status === 'loading' ? (
          <div className="rounded-xl border border-hairline bg-card p-5 text-sm text-ink-soft shadow-sm">
            Loading Neon Free usage…
          </div>
        ) : state.observation.status === 'unknown' ? (
          <div className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-xs text-ink-soft">
                Observed{' '}
                <time dateTime={state.observation.observedAt}>{state.observation.observedAt}</time>
              </p>
              <NeonUsageStatusBadge status="unknown" />
            </div>
            <p className="mt-3 text-sm text-ink-soft">
              {neonUsageReasonCopy(state.observation.reason)}
            </p>
          </div>
        ) : (
          <NeonUsageDetails observation={state.observation} />
        )}
      </div>
    </section>
  );
}

function reportedCountLabel(count: number, singular: 'Machine' | 'Volume'): string {
  return `${count} ${count === 1 ? singular : `${singular}s`} reported`;
}

function detailCountLabel(count: number, singular: 'Machine' | 'Volume'): string {
  return `${count} ${singular} ${count === 1 ? 'detail' : 'details'} returned from a separate snapshot.`;
}

function FlyMachineList({ app }: { app: FlyApp }) {
  if (app.machines.status === 'unknown') {
    return (
      <div className="mt-4 rounded-lg bg-secondary p-4 text-sm text-ink-soft">
        <p className="font-semibold text-ink">Machine inventory unavailable.</p>
        <p className="mt-1">{flyReasonCopy(app.machines.reason)}</p>
      </div>
    );
  }

  const machines = app.machines;
  return (
    <div className="mt-4">
      <p className="text-sm text-ink-soft">{detailCountLabel(machines.items.length, 'Machine')}</p>
      {machines.truncated && (
        <p className="mt-1 text-sm font-medium text-amber-800">Machine detail list is truncated.</p>
      )}
      <div
        aria-label={`Machines for ${app.name}`}
        className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-hairline"
        role="region"
        tabIndex={0}
      >
        {machines.items.length === 0 ? (
          <p className="p-4 text-sm text-ink-soft">No Machine details returned.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {machines.items.map((machine) => (
              <li className="p-4" key={machine.id}>
                <p className="font-medium text-ink">{machine.name}</p>
                <p className="mt-1 break-all text-xs text-ink-soft">{machine.id}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {machine.state} · {machine.region}
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  Process group · {machine.processGroup ?? 'not reported'}
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  {machine.cpuKind} · {machine.cpus} {machine.cpus === 1 ? 'CPU' : 'CPUs'} ·{' '}
                  {machine.memoryMb} MB
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  Created <time dateTime={machine.createdAt}>{machine.createdAt}</time>
                  {' · '}updated <time dateTime={machine.updatedAt}>{machine.updatedAt}</time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function backupCopy(enabled: boolean | null): string {
  if (enabled === true) return 'Automatic backups enabled';
  if (enabled === false) return 'Automatic backups disabled';
  return 'Automatic backup setting unavailable';
}

function snapshotRetentionCopy(days: number | null): string {
  if (days === null) return 'Snapshot retention unavailable';
  return `Snapshots retained ${days} ${days === 1 ? 'day' : 'days'}`;
}

function FlyVolumeList({ app }: { app: FlyApp }) {
  if (app.volumes.status === 'unknown') {
    return (
      <div className="mt-4 rounded-lg bg-secondary p-4 text-sm text-ink-soft">
        <p className="font-semibold text-ink">Volume inventory unavailable.</p>
        <p className="mt-1">{flyReasonCopy(app.volumes.reason)}</p>
      </div>
    );
  }

  const volumes = app.volumes;
  return (
    <div className="mt-4">
      <p className="text-sm text-ink-soft">{detailCountLabel(volumes.items.length, 'Volume')}</p>
      <p className="mt-1 text-xs text-ink-soft">
        {volumes.returnedAllocatedGb} GB allocated across returned Volume details
        {volumes.truncated ? '; this is not an app-wide total.' : '.'}
      </p>
      {volumes.truncated && (
        <p className="mt-1 text-sm font-medium text-amber-800">Volume detail list is truncated.</p>
      )}
      <div
        aria-label={`Volumes for ${app.name}`}
        className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-hairline"
        role="region"
        tabIndex={0}
      >
        {volumes.items.length === 0 ? (
          <p className="p-4 text-sm text-ink-soft">No Volume details returned.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {volumes.items.map((volume) => (
              <li className="p-4" key={volume.id}>
                <p className="font-medium text-ink">{volume.name}</p>
                <p className="mt-1 break-all text-xs text-ink-soft">{volume.id}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {volume.state} · {volume.region} ·{' '}
                  {volume.encrypted ? 'Encrypted' : 'Unencrypted'}
                </p>
                <p className="mt-1 text-sm font-medium text-ink">{volume.sizeGb} GB allocated</p>
                <p className="mt-1 break-all text-xs text-ink-soft">
                  {volume.attachedMachineId
                    ? `Attached to ${volume.attachedMachineId}`
                    : 'Not attached to a Machine'}
                </p>
                <div className="mt-1 space-y-1 text-xs text-ink-soft">
                  <p>{snapshotRetentionCopy(volume.snapshotRetentionDays)}</p>
                  <p>{backupCopy(volume.autoBackupEnabled)}</p>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  Created <time dateTime={volume.createdAt}>{volume.createdAt}</time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FlyAppCard({ app }: { app: FlyApp }) {
  return (
    <article className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">{app.name}</h3>
          <p className="mt-1 break-all text-xs text-ink-soft">{app.id}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {app.status} · {app.network ? `network ${app.network}` : 'network unavailable'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-ink">
            {reportedCountLabel(app.reportedMachineCount, 'Machine')}
          </span>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-ink">
            {reportedCountLabel(app.reportedVolumeCount, 'Volume')}
          </span>
        </div>
      </div>

      <div className="mt-5 border-t border-hairline pt-5">
        <h4 className="font-semibold text-ink">Machines</h4>
        <FlyMachineList app={app} />
      </div>

      <div className="mt-5 border-t border-hairline pt-5">
        <h4 className="font-semibold text-ink">Volumes</h4>
        <FlyVolumeList app={app} />
      </div>
    </article>
  );
}

function FlyInventory({ state }: { state: FlyInventoryState }) {
  if (state.status === 'idle') return null;

  return (
    <section className="mt-8" aria-labelledby="fly-inventory-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink" id="fly-inventory-title">
            Fly inventory
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-soft">
            Read-only provider inventory for reviewed Harpa apps.
          </p>
        </div>
        <a
          className="inline-flex text-sm font-semibold text-accent-ink underline underline-offset-4 ring-focus"
          href={FLY_DASHBOARD_URL}
          rel="noreferrer"
          target="_blank"
        >
          Open Fly dashboard ↗
        </a>
      </div>

      <div className="mt-4 rounded-xl border border-hairline bg-card p-5 shadow-sm">
        <p className="text-sm font-semibold text-ink">Remaining Fly credit: Unknown</p>
        <p className="mt-1 text-sm text-ink-soft">
          Use the Fly dashboard for current billing information.
        </p>
      </div>

      <div className="mt-4" aria-live="polite">
        {state.status === 'loading' ? (
          <div className="rounded-xl border border-hairline bg-card p-5 text-sm text-ink-soft shadow-sm">
            Loading Fly inventory…
          </div>
        ) : state.observation.status === 'unknown' ? (
          <div className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
            <p className="font-semibold text-ink">Unknown</p>
            <p className="mt-2 text-sm text-ink-soft">{flyReasonCopy(state.observation.reason)}</p>
            <p className="mt-2 text-xs text-ink-soft">
              Observed{' '}
              <time dateTime={state.observation.observedAt}>{state.observation.observedAt}</time>
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
              {state.observation.status === 'partial' && (
                <p className="font-semibold text-amber-800">Partial Fly inventory</p>
              )}
              <p
                className={
                  state.observation.status === 'partial'
                    ? 'mt-2 text-sm text-ink'
                    : 'text-sm text-ink'
                }
              >
                {state.observation.apps.length} configured{' '}
                {state.observation.apps.length === 1 ? 'app' : 'apps'} observed
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Organization {state.observation.organizationSlug}.
              </p>
              {state.observation.unavailableConfiguredAppCount > 0 && (
                <p className="mt-1 text-sm text-ink-soft">
                  {state.observation.unavailableConfiguredAppCount} configured{' '}
                  {state.observation.unavailableConfiguredAppCount === 1
                    ? 'app unavailable.'
                    : 'apps unavailable.'}
                </p>
              )}
              <p className="mt-2 text-xs text-ink-soft">
                Observed{' '}
                <time dateTime={state.observation.observedAt}>{state.observation.observedAt}</time>
              </p>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {state.observation.apps.map((app) => (
                <FlyAppCard app={app} key={app.id} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-hairline bg-card p-5 shadow-sm">
        <h3 className="font-semibold text-ink">Interpretation notes</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-soft">
          <li>
            Machine state and process group are provider inventory, not Harpa readiness or
            Machine/worker liveness.
          </li>
          <li>Volume size is allocated capacity, not used or free storage.</li>
          <li>Provider-reported counts and returned details are separate snapshots.</li>
        </ul>
      </div>
    </section>
  );
}

const r2Number = new Intl.NumberFormat('en-US');
const r2IecUnits = [
  { label: 'PiB', bytes: 1024n ** 5n },
  { label: 'TiB', bytes: 1024n ** 4n },
  { label: 'GiB', bytes: 1024n ** 3n },
  { label: 'MiB', bytes: 1024n ** 2n },
  { label: 'KiB', bytes: 1024n },
] as const;

function publishedStoredBytes(
  standard: R2StorageClassSnapshot,
  infrequentAccess: R2StorageClassSnapshot,
): bigint {
  return (
    BigInt(standard.publishedPayloadBytes) +
    BigInt(standard.publishedMetadataBytes) +
    BigInt(infrequentAccess.publishedPayloadBytes) +
    BigInt(infrequentAccess.publishedMetadataBytes)
  );
}

function formatPublishedStoredBytes(totalBytes: bigint): string {
  const exactBytes = `${r2Number.format(totalBytes)} bytes`;
  const unitIndex = r2IecUnits.findIndex(({ bytes }) => totalBytes >= bytes);
  if (unitIndex === -1) return exactBytes;

  let unit = r2IecUnits[unitIndex]!;
  let roundedTenths = (totalBytes * 10n + unit.bytes / 2n) / unit.bytes;
  if (roundedTenths === 10_240n && unitIndex > 0) {
    unit = r2IecUnits[unitIndex - 1]!;
    roundedTenths = (totalBytes * 10n + unit.bytes / 2n) / unit.bytes;
  }

  return `${roundedTenths / 10n}.${roundedTenths % 10n} ${unit.label} (${exactBytes})`;
}

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
  const accessibleName = `Estimated R2 ${label} operations: ${formatQuotaPercent(
    (estimate.estimatedUsed / estimate.publishedAllowance) * 100,
  )}% used, ${formatQuotaPercent(
    Math.max(0, 100 - (estimate.estimatedUsed / estimate.publishedAllowance) * 100),
  )}% remaining`;

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
      <QuotaProgress
        accessibleName={accessibleName}
        allowance={estimate.publishedAllowance}
        used={estimate.estimatedUsed}
      />
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
  const publishedStoredNow =
    observation.storage.status === 'available'
      ? formatPublishedStoredBytes(
          publishedStoredBytes(observation.storage.standard, observation.storage.infrequentAccess),
        )
      : 'Unknown';

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
        <dl className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg bg-secondary p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Published stored now
            </dt>
            <dd className="mt-1 text-sm text-ink">{publishedStoredNow}</dd>
          </div>
          <div className="rounded-lg bg-secondary p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Ingress volume
            </dt>
            <dd className="mt-1 text-sm text-ink">Unknown</dd>
          </div>
          <div className="rounded-lg bg-secondary p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Egress volume
            </dt>
            <dd className="mt-1 text-sm text-ink">Unknown</dd>
          </div>
        </dl>
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
          <li>The documented R2 metrics do not expose ingress or egress bytes.</li>
          <li>Direct R2 egress is free, but this observer cannot measure bytes served.</li>
          <li>Harpa uploads and downloads use direct signed URLs.</li>
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

function SentryStatusBadge({ status }: { status: 'available' | 'partial' | 'unknown' }) {
  const className =
    status === 'available'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'partial'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-secondary text-ink-soft';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {status === 'available' ? 'Available' : status === 'partial' ? 'Partial' : 'Unknown'}
    </span>
  );
}

function SentryObservationCard({
  observation,
}: {
  observation: Exclude<SentryObservation, { status: 'unknown' }>;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs text-ink-soft">
          Observed <time dateTime={observation.observedAt}>{observation.observedAt}</time>
        </p>
        <SentryStatusBadge status={observation.status} />
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-4 md:grid-cols-2">
        <dt className="text-sm font-semibold text-ink">Unresolved error issue groups</dt>
        <dd className="text-sm text-ink-soft">
          {observation.unresolvedErrors.status === 'available' ? (
            <span className="text-2xl font-semibold text-ink">
              {r2Number.format(observation.unresolvedErrors.count)}
              {observation.unresolvedErrors.countKind === 'lower_bound' ? '+' : ''}
            </span>
          ) : (
            <>
              <span className="font-semibold text-ink">Unknown</span>
              <p className="mt-1">{sentryReasonCopy(observation.unresolvedErrors.reason)}</p>
            </>
          )}
        </dd>

        <dt className="text-sm font-semibold text-ink">Mobile sessions · last 24 hours</dt>
        <dd className="text-sm text-ink-soft">
          {observation.mobileSessions.status === 'available' ? (
            <span className="text-2xl font-semibold text-ink">
              {r2Number.format(observation.mobileSessions.totalSessions)}
            </span>
          ) : (
            <>
              <span className="font-semibold text-ink">Unknown</span>
              <p className="mt-1">{sentryReasonCopy(observation.mobileSessions.reason)}</p>
            </>
          )}
        </dd>

        {observation.mobileSessions.status === 'available' ? (
          <>
            <dt className="text-sm font-semibold text-ink">Healthy</dt>
            <dd className="text-sm text-ink-soft">
              {r2Number.format(observation.mobileSessions.healthySessions)}
            </dd>
            <dt className="text-sm font-semibold text-ink">Errored</dt>
            <dd className="text-sm text-ink-soft">
              {r2Number.format(observation.mobileSessions.erroredSessions)}
            </dd>
            <dt className="text-sm font-semibold text-ink">Abnormal</dt>
            <dd className="text-sm text-ink-soft">
              {r2Number.format(observation.mobileSessions.abnormalSessions)}
            </dd>
            <dt className="text-sm font-semibold text-ink">Crashed</dt>
            <dd className="text-sm text-ink-soft">
              {r2Number.format(observation.mobileSessions.crashedSessions)}
            </dd>
          </>
        ) : null}
      </dl>

      <div className="mt-5 space-y-2 text-sm text-ink-soft">
        {observation.unresolvedErrors.status === 'available' &&
        observation.unresolvedErrors.countKind === 'lower_bound' ? (
          <p>
            The unresolved issue-group count is a lower bound because Sentry reported another page.
          </p>
        ) : null}
        <p>One issue group can contain many error events. Issue details stay in Sentry.</p>
        <p>
          Mobile release health covers the configured mobile project only; it does not cover the API
          or browser applications.
        </p>
        <p>Zero unresolved groups is not proof that all systems have no errors.</p>
        <p>A crashed session is recent activity, not an unresolved issue.</p>
        <p>Missing or zero session data is Unknown, not zero crashes.</p>
      </div>
    </div>
  );
}

function Sentry({ state }: { state: SentryState }) {
  if (state.status === 'idle') return null;

  return (
    <section className="mt-8" aria-labelledby="sentry-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink" id="sentry-title">
            Sentry errors and mobile crashes
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Aggregate unresolved error groups and mobile session evidence.
          </p>
        </div>
        <a
          className="inline-flex text-sm font-semibold text-accent-ink underline underline-offset-4 ring-focus"
          href="https://sentry.io/issues/"
          rel="noreferrer"
          target="_blank"
        >
          Open Sentry issues ↗
        </a>
      </div>

      <div className="mt-4" aria-live="polite">
        {state.status === 'loading' ? (
          <div className="rounded-xl border border-hairline bg-card p-5 text-sm text-ink-soft shadow-sm">
            Loading Sentry observation…
          </div>
        ) : state.observation.status === 'unknown' ? (
          <div className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-xs text-ink-soft">
                Observed{' '}
                <time dateTime={state.observation.observedAt}>{state.observation.observedAt}</time>
              </p>
              <SentryStatusBadge status="unknown" />
            </div>
            <p className="mt-3 text-sm text-ink-soft">
              {sentryReasonCopy(state.observation.reason)}
            </p>
          </div>
        ) : (
          <SentryObservationCard observation={state.observation} />
        )}
      </div>
    </section>
  );
}

const storageLifecycleNumber = new Intl.NumberFormat('en-US');
const aiUsageNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

function AiUsageStatusBadge({ status }: { status: 'available' | 'unknown' }) {
  const available = status === 'available';
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        available ? 'bg-emerald-100 text-emerald-800' : 'bg-secondary text-ink-soft'
      }`}
    >
      {available ? 'Available' : 'Unknown'}
    </span>
  );
}

function AiCallOutcomeLine({
  label,
  outcome,
  fragmented = false,
}: {
  label: 'Live' | 'Record' | 'Replay';
  outcome: AiUsageWindow['calls']['live'];
  fragmented?: boolean;
}) {
  if (fragmented) {
    return (
      <li>
        <span>
          {label}: {aiUsageNumber.format(outcome.succeeded)} succeeded,{' '}
        </span>
        <span>{aiUsageNumber.format(outcome.failed)} failed, </span>
        <span>{aiUsageNumber.format(outcome.total)} total</span>
      </li>
    );
  }

  return (
    <li>
      {label}: {aiUsageNumber.format(outcome.succeeded)} succeeded,{' '}
      {aiUsageNumber.format(outcome.failed)} failed, {aiUsageNumber.format(outcome.total)} total
    </li>
  );
}

function AiOperationModeLines({ operation }: { operation: AiUsageOperation }) {
  return (
    <div className="mt-2 space-y-1 text-xs text-ink-soft">
      <p>
        Live: {aiUsageNumber.format(operation.liveSucceeded)} succeeded,{' '}
        {aiUsageNumber.format(operation.liveFailed)} failed
      </p>
      <p>
        Record: {aiUsageNumber.format(operation.recordSucceeded)} succeeded,{' '}
        {aiUsageNumber.format(operation.recordFailed)} failed
      </p>
      <p>
        Replay: {aiUsageNumber.format(operation.replaySucceeded)} succeeded,{' '}
        {aiUsageNumber.format(operation.replayFailed)} failed
      </p>
    </div>
  );
}

function AiUsageOperations({ window, ariaLabel }: { window: AiUsageWindow; ariaLabel: string }) {
  const operations = [
    { label: 'Chat', usage: window.operations.chat },
    { label: 'Report generation', usage: window.operations.generateReport },
    { label: 'Transcription', usage: window.operations.transcribe },
  ] as const;

  return (
    <div className="mt-5 border-t border-hairline pt-5">
      <h4 className="font-semibold text-ink">Operations</h4>
      <ul aria-label={ariaLabel} className="mt-3 grid gap-3 lg:grid-cols-3">
        {operations.map((operation) => (
          <li className="rounded-lg bg-secondary p-4" key={operation.label}>
            <p className="font-semibold text-ink">{operation.label}</p>
            <AiOperationModeLines operation={operation.usage} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function aiProviderLabel(provider: AiUsageProvider['provider']): string {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'groq') return 'Groq';
  if (provider === 'kimi') return 'Kimi';
  return 'Other';
}

function AiUsageProviderItem({ provider }: { provider: AiUsageProvider }) {
  return (
    <li className="rounded-lg border border-hairline p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-ink">{aiProviderLabel(provider.provider)}</p>
        <p className="text-xs font-medium text-ink-soft">
          {aiUsageNumber.format(provider.recordedEventCount)} recorded events
        </p>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-ink-soft">
        <AiCallOutcomeLine fragmented label="Live" outcome={provider.calls.live} />
        <AiCallOutcomeLine fragmented label="Record" outcome={provider.calls.record} />
        <AiCallOutcomeLine fragmented label="Replay" outcome={provider.calls.replay} />
      </ul>
      <ul className="mt-3 space-y-1 border-t border-hairline pt-3 text-xs text-ink-soft">
        <li>
          <span>{aiUsageNumber.format(provider.successfulProviderUsage.inputTokens)}</span>
          <span> input tokens</span>
        </li>
        <li>
          <span>{aiUsageNumber.format(provider.successfulProviderUsage.outputTokens)}</span>
          <span> output tokens</span>
        </li>
        <li>
          <span>{aiUsageNumber.format(provider.successfulProviderUsage.cachedTokens)}</span>
          <span> cached tokens</span>
        </li>
        <li>
          <span>{aiUsageNumber.format(provider.successfulProviderUsage.inputSeconds)}</span>
          <span> transcription input seconds</span>
        </li>
      </ul>
      <p className="mt-3 text-xs text-ink-soft">
        Last retained event{' '}
        <time dateTime={provider.lastRecordedAt}>{provider.lastRecordedAt}</time>
      </p>
    </li>
  );
}

function AiUsageProviders({ window, ariaLabel }: { window: AiUsageWindow; ariaLabel: string }) {
  return (
    <div className="mt-5 border-t border-hairline pt-5">
      <h4 className="font-semibold text-ink">Providers</h4>
      <ul aria-label={ariaLabel} className="mt-3 grid gap-3 lg:grid-cols-2">
        {window.providers.map((provider) => (
          <AiUsageProviderItem key={provider.provider} provider={provider} />
        ))}
      </ul>
    </div>
  );
}

function aiUsageWarningCopy(warning: AiUsageWarning, window: AiUsageWindow): string {
  if (warning === 'unclassified_vendor_events') {
    const count = window.unclassifiedVendorEventCount;
    return `${aiUsageNumber.format(count)} retained ${count === 1 ? 'event' : 'events'} used an unclassified vendor label and ${count === 1 ? 'is' : 'are'} grouped as Other.`;
  }

  const count = window.missingInputSecondsEventCount;
  return `${aiUsageNumber.format(count)} successful transcription ${count === 1 ? 'event has' : 'events have'} no recorded input duration; transcription seconds are incomplete.`;
}

function AiUsageWindowCard({
  label,
  ariaPrefix,
  window,
}: {
  label: 'Month to date' | 'Last 24 hours';
  ariaPrefix: 'Month-to-date' | 'Last-24-hours';
  window: AiUsageWindow;
}) {
  return (
    <article className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">{label}</h3>
          <p className="mt-1 text-xs text-ink-soft">
            <time dateTime={window.windowStart}>{window.windowStart}</time>
            {' to '}
            <time dateTime={window.windowEnd}>{window.windowEnd}</time>
          </p>
        </div>
        <p className="text-sm font-semibold text-ink">
          {aiUsageNumber.format(window.recordedEventCount)} recorded events
        </p>
      </div>

      {window.recordedEventCount === 0 ? (
        <p className="mt-5 rounded-lg bg-secondary p-4 text-sm text-ink-soft">
          No AI usage recorded in this window.
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-secondary p-4">
              <h4 className="font-semibold text-ink">Calls by mode</h4>
              <ul className="mt-3 space-y-1 text-sm text-ink-soft">
                <AiCallOutcomeLine label="Live" outcome={window.calls.live} />
                <AiCallOutcomeLine label="Record" outcome={window.calls.record} />
                <AiCallOutcomeLine label="Replay" outcome={window.calls.replay} />
              </ul>
              <p className="mt-3 text-xs text-ink-soft">
                Replay is separate from provider-attributable live and record calls.
              </p>
            </div>

            <div className="rounded-lg bg-secondary p-4">
              <h4 className="font-semibold text-ink">Successful provider usage</h4>
              <ul className="mt-3 space-y-1 text-sm text-ink-soft">
                <li>
                  {aiUsageNumber.format(window.successfulProviderUsage.inputTokens)} input tokens
                </li>
                <li>
                  {aiUsageNumber.format(window.successfulProviderUsage.outputTokens)} output tokens
                </li>
                <li>
                  {aiUsageNumber.format(window.successfulProviderUsage.cachedTokens)} cached tokens
                </li>
                <li>
                  {aiUsageNumber.format(window.successfulProviderUsage.inputSeconds)} transcription
                  input seconds
                </li>
              </ul>
            </div>
          </div>

          <AiUsageOperations window={window} ariaLabel={`${ariaPrefix} operations`} />
          <AiUsageProviders window={window} ariaLabel={`${ariaPrefix} providers`} />

          {window.warnings.length > 0 && (
            <div className="mt-5 border-t border-hairline pt-5">
              <h4 className="font-semibold text-amber-800">Warnings</h4>
              <ul
                aria-label={`${ariaPrefix} warnings`}
                className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-800"
              >
                {window.warnings.map((warning) => (
                  <li key={warning}>{aiUsageWarningCopy(warning, window)}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-5 border-t border-hairline pt-4 text-xs text-ink-soft">
            Last retained event{' '}
            {window.lastRecordedAt ? (
              <time dateTime={window.lastRecordedAt}>{window.lastRecordedAt}</time>
            ) : (
              'Unknown'
            )}
          </p>
        </>
      )}
    </article>
  );
}

function aiUsageCaveatCopy(caveat: AiUsageCaveat): string {
  switch (caveat) {
    case 'best_effort_ledger':
      return 'Accounting writes are best effort, so the retained ledger may be incomplete.';
    case 'not_provider_billing':
      return 'These values are not provider billing, spend, balance, or rate-limit evidence.';
    case 'replay_not_provider_usage':
      return 'Replay events are recorded separately and are not provider usage.';
    case 'record_mode_calls_provider':
      return 'Record-mode events call a provider and are provider-attributable.';
    case 'deleted_history_excluded':
      return 'Deleted-account history and events that were not recorded are excluded.';
  }
}

const AI_PROVIDER_DASHBOARDS = [
  { name: 'OpenAI', href: OPENAI_USAGE_URL },
  { name: 'Groq', href: GROQ_DASHBOARD_URL },
  { name: 'Kimi', href: KIMI_DASHBOARD_URL },
] as const;

function AiProviderCapacityLinks() {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      {AI_PROVIDER_DASHBOARDS.map((provider) => (
        <article
          className="rounded-xl border border-hairline bg-card p-5 shadow-sm"
          key={provider.name}
        >
          <p className="font-semibold text-ink">{provider.name}</p>
          <p className="mt-2 text-sm font-semibold text-ink">Remaining provider credit: Unknown</p>
          <p className="mt-1 text-xs text-ink-soft">
            This page does not use a provider-admin billing credential.
          </p>
          <a
            className="mt-3 inline-flex text-sm font-semibold text-accent-ink underline underline-offset-4 ring-focus"
            href={provider.href}
            rel="noreferrer"
            target="_blank"
          >
            Open {provider.name} dashboard ↗
          </a>
        </article>
      ))}
    </div>
  );
}

function AiUsage({ state }: { state: AiUsageState }) {
  if (state.status === 'idle') return null;

  return (
    <section className="mt-8" aria-labelledby="ai-usage-title">
      <div>
        <h2 className="text-xl font-semibold text-ink" id="ai-usage-title">
          Harpa-recorded AI usage
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Harpa-recorded metadata is a retained, best-effort ledger. It is not provider billing.
        </p>
      </div>

      <AiProviderCapacityLinks />

      <div className="mt-4" aria-live="polite">
        {state.status === 'loading' ? (
          <div className="rounded-xl border border-hairline bg-card p-5 text-sm text-ink-soft shadow-sm">
            Loading Harpa-recorded AI usage…
          </div>
        ) : state.observation.status === 'unknown' ? (
          <div className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-xs text-ink-soft">
                Observed{' '}
                <time dateTime={state.observation.observedAt}>{state.observation.observedAt}</time>
              </p>
              <AiUsageStatusBadge status="unknown" />
            </div>
            <p className="mt-3 text-sm text-ink-soft">
              {aiUsageReasonCopy(state.observation.reason)}
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-xs text-ink-soft">
                  Observed{' '}
                  <time dateTime={state.observation.observedAt}>
                    {state.observation.observedAt}
                  </time>
                </p>
                <AiUsageStatusBadge status="available" />
              </div>
              <h3 className="mt-5 font-semibold text-ink">Interpretation notes</h3>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                {state.observation.caveats.map((caveat) => (
                  <li key={caveat}>{aiUsageCaveatCopy(caveat)}</li>
                ))}
              </ul>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <AiUsageWindowCard
                label="Month to date"
                ariaPrefix="Month-to-date"
                window={state.observation.monthToDate}
              />
              <AiUsageWindowCard
                label="Last 24 hours"
                ariaPrefix="Last-24-hours"
                window={state.observation.last24Hours}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function storageLifecycleCaveatCopy(
  caveat: AvailableStorageLifecycleObservation['caveats'][number],
): string {
  switch (caveat) {
    case 'db_state_not_worker_liveness':
      return 'Database state is not worker liveness.';
    case 'queue_counts_not_provider_health':
      return 'Queue counts do not prove provider health.';
    case 'empty_queue_not_execution_proof':
      return 'An empty queue does not prove execution.';
  }
}

function LifecycleTimestamp({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg bg-secondary p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-2 break-all text-sm font-medium text-ink">
        {value ? <time dateTime={value}>{value}</time> : 'Not recorded'}
      </dd>
    </div>
  );
}

function LifecycleCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-secondary p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-2 text-lg font-semibold text-ink">
        {storageLifecycleNumber.format(value)}
      </dd>
    </div>
  );
}

function StorageLifecycleDetails({
  observation,
}: {
  observation: AvailableStorageLifecycleObservation;
}) {
  const { rollout, jobs } = observation;

  return (
    <div className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs text-ink-soft">
          Observed <time dateTime={observation.observedAt}>{observation.observedAt}</time>
        </p>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-ink-soft">
          Database snapshot
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg bg-secondary p-4">
          <h3 className="text-sm font-semibold text-ink">Rollout marker</h3>
          <p className="mt-2 text-lg font-semibold text-ink">
            {rollout.armedAt ? 'Recorded' : 'Missing'}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Recorded means the rollout row contains its deployment arming marker.
          </p>
        </div>
        <div className="rounded-lg bg-secondary p-4">
          <h3 className="text-sm font-semibold text-ink">Lease enforcement</h3>
          <p className="mt-2 text-lg font-semibold text-ink">
            {rollout.leaseEnforcementActive ? 'Active' : 'Inactive'}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Active means the enforcement threshold has passed according to the database clock.
          </p>
        </div>
        <div className="rounded-lg bg-secondary p-4">
          <h3 className="text-sm font-semibold text-ink">Account deletion</h3>
          <p className="mt-2 text-lg font-semibold text-ink">
            {rollout.accountDeletionAvailable ? 'Available' : 'Blocked'}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Available means lease enforcement and the independent account-delete flag are active.
          </p>
          <p className="mt-2 text-xs font-medium text-ink">
            Independent flag: {rollout.accountDeleteEnabled ? 'Enabled' : 'Disabled'}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 md:grid-cols-3">
        <LifecycleTimestamp label="Armed at" value={rollout.armedAt} />
        <LifecycleTimestamp label="Enforce after" value={rollout.enforceAfter} />
        <LifecycleTimestamp label="Rollout updated" value={rollout.updatedAt} />
      </dl>

      <div className="mt-5 border-t border-hairline pt-5">
        <h3 className="font-semibold text-ink">Durable cleanup queue</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Due now means work is currently eligible to be claimed from the queue. Stale claims have
          outlived the worker&apos;s five-minute claim lease.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <LifecycleCount label="Total" value={jobs.total} />
          <LifecycleCount label="Initial" value={jobs.initial} />
          <LifecycleCount label="Final" value={jobs.final} />
          <LifecycleCount label="Due now" value={jobs.dueNow} />
          <LifecycleCount label="Scheduled" value={jobs.scheduled} />
          <LifecycleCount label="Active claims" value={jobs.activeClaims} />
          <LifecycleCount label="Stale claims" value={jobs.staleClaims} />
          <LifecycleCount label="Retrying" value={jobs.retrying} />
          <LifecycleCount label="Maximum attempts" value={jobs.maxAttemptCount} />
        </dl>
        <dl className="mt-3 grid gap-3 md:grid-cols-2">
          <LifecycleTimestamp label="Oldest due" value={jobs.oldestDueAt} />
          <LifecycleTimestamp label="Next scheduled" value={jobs.nextRunAfter} />
        </dl>
      </div>

      <div className="mt-5 border-t border-hairline pt-5">
        <h3 className="font-semibold text-ink">Interpretation notes</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-soft">
          {observation.caveats.map((caveat) => (
            <li key={caveat}>{storageLifecycleCaveatCopy(caveat)}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm font-medium text-ink">
          This database state does not prove a storage worker is running now. Use Fly worker
          verification and deployment evidence for executor proof.
        </p>
      </div>
    </div>
  );
}

function StorageLifecycle({ state }: { state: StorageLifecycleState }) {
  if (state.status === 'idle') return null;

  return (
    <section className="mt-8" aria-labelledby="storage-lifecycle-title">
      <div>
        <h2 className="text-xl font-semibold text-ink" id="storage-lifecycle-title">
          Storage lifecycle
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Read-only rollout and durable queue state from the application database.
        </p>
      </div>

      <div className="mt-4" aria-live="polite">
        {state.status === 'loading' ? (
          <div className="rounded-xl border border-hairline bg-card p-5 text-sm text-ink-soft shadow-sm">
            Loading storage lifecycle…
          </div>
        ) : state.observation.status === 'unknown' ? (
          <div className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-xs text-ink-soft">
                Observed{' '}
                <time dateTime={state.observation.observedAt}>{state.observation.observedAt}</time>
              </p>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-ink-soft">
                Unknown
              </span>
            </div>
            <p className="mt-3 text-sm text-ink-soft">
              {storageLifecycleReasonCopy(state.observation.reason)}
            </p>
          </div>
        ) : (
          <StorageLifecycleDetails observation={state.observation} />
        )}
      </div>
    </section>
  );
}

const canaryNumber = new Intl.NumberFormat('en-US');

function CanaryBadge({
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

const CANARY_WARNING_COPY: Readonly<Record<string, string>> = {
  limits_unavailable: 'Effective usage limits were unavailable.',
  sign_out_failed: 'Application sign-out could not be confirmed.',
};

function warningCopy(warning: ReportCanaryWarning): string {
  return CANARY_WARNING_COPY[warning] ?? 'The live canary returned an invalid warning.';
}

const CANARY_FAILURE_REASON_COPY: Readonly<Record<string, string>> = {
  sign_in_failed: 'The synthetic account could not sign in.',
  target_not_found: 'The configured synthetic report was not found.',
  target_not_draft: 'The configured synthetic report is not a draft.',
  conflict: 'The synthetic report changed during the live canary.',
  live_mode_required: 'Live provider mode was required but not proven.',
  live_proof_failed:
    'The generation and usage evidence did not prove one fresh live provider call.',
  usage_proof_missing: 'No matching live usage row was recorded.',
  usage_proof_ambiguous: 'More than one matching live usage row was recorded.',
  preview_invalid: 'The live report response could not be safely previewed.',
  usage_limit_exceeded: 'The synthetic account has reached its report-generation limit.',
  rate_limited: 'Rate limiting prevented report generation.',
  provider_error: 'The AI provider could not generate the report.',
  timeout: 'The live canary timed out.',
  invalid_response: 'An upstream API returned an invalid response.',
  upstream_unavailable: 'An upstream API was unavailable.',
};

function failureReasonCopy(reason: ReportCanaryFailure['reason']): string {
  return CANARY_FAILURE_REASON_COPY[reason] ?? 'The live canary failed for an unknown reason.';
}

const CANARY_FAILURE_PHASE_LABEL: Readonly<Record<string, string>> = {
  sign_in: 'Sign in',
  target_read: 'Target read',
  mode_gate: 'Mode gate',
  generate: 'Generate',
  proof_read: 'Proof read',
  usage_window: 'Usage window',
  usage_proof: 'Usage proof',
  preview: 'Preview',
  limits: 'Limits',
  sign_out: 'Sign out',
};

function failurePhaseLabel(phase: ReportCanaryFailure['phase']): string {
  return CANARY_FAILURE_PHASE_LABEL[phase] ?? 'Unknown phase';
}

function CleanupResult({ cleanup }: { cleanup: ReportCanaryFailure['cleanup'] }) {
  if (cleanup === 'succeeded') return <p>Sign-out confirmed.</p>;
  if (cleanup === 'failed') return <p>Sign-out could not be confirmed.</p>;
  return <p>No synthetic session was created.</p>;
}

function CanaryLimits({ limits }: { limits: NonNullable<ReportCanarySuccess['limits']> }) {
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
              {canaryNumber.format(bucket.used)} used
              {' · '}
              {bucket.remaining === null
                ? 'Unlimited'
                : `${canaryNumber.format(bucket.remaining)} remaining`}
              {bucket.limit === null ? '' : ` · ${canaryNumber.format(bucket.limit)} limit`}
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

function OptionalPreviewField({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null;
  return (
    <>
      <dt className="text-ink-soft">{label}</dt>
      <dd className="break-words text-ink">{value}</dd>
    </>
  );
}

function CanaryPreview({ preview }: { preview: ReportCanarySuccess['preview'] }) {
  const { sample } = preview;
  return (
    <section
      aria-labelledby="report-live-canary-preview-title"
      className="mt-5 max-h-[42rem] overflow-y-auto rounded-lg border border-hairline bg-secondary p-4"
      role="region"
    >
      <h3 className="font-semibold text-ink" id="report-live-canary-preview-title">
        Synthetic report response preview
      </h3>
      <p className="mt-1 text-xs text-ink-soft">
        Validated synthetic report fields rendered as text.
      </p>

      <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-sm">
        {[
          ['Workers', preview.counts.workers],
          ['Materials', preview.counts.materials],
          ['Issues', preview.counts.issues],
          ['Next steps', preview.counts.nextSteps],
          ['Summary sections', preview.counts.summarySections],
          ['Image attachments', preview.counts.imageAttachments],
          ['Document attachments', preview.counts.documentAttachments],
        ].map(([label, count]) => (
          <Fragment key={label}>
            <dt className="text-ink-soft">{label}</dt>
            <dd className="text-ink">{canaryNumber.format(count as number)}</dd>
          </Fragment>
        ))}
        <dt className="text-ink-soft">Report body SHA-256</dt>
        <dd className="break-all font-mono text-xs text-ink">{preview.bodySha256}</dd>
      </dl>
      <p className="mt-3 text-xs font-medium text-ink-soft">
        {preview.truncated ? 'Preview truncated' : 'Preview complete'}
      </p>

      <div className="mt-5 border-t border-hairline pt-4">
        <h4 className="text-sm font-semibold text-ink">Report fields</h4>
        {sample.title === null && sample.summary === null ? (
          <p className="mt-2 text-sm text-ink-soft">No title or summary text returned.</p>
        ) : (
          <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-sm">
            <OptionalPreviewField label="Title" value={sample.title} />
            <OptionalPreviewField label="Summary" value={sample.summary} />
          </dl>
        )}
      </div>

      <div className="mt-5 border-t border-hairline pt-4">
        <h4 className="text-sm font-semibold text-ink">Weather</h4>
        {sample.weather === null ? (
          <p className="mt-2 text-sm text-ink-soft">No weather sample returned.</p>
        ) : (
          <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-sm">
            <OptionalPreviewField label="Condition" value={sample.weather.condition} />
            <OptionalPreviewField label="Temperature" value={sample.weather.temperature} />
            <OptionalPreviewField label="Wind" value={sample.weather.wind} />
            <OptionalPreviewField label="Impact" value={sample.weather.impact} />
          </dl>
        )}
      </div>

      <div className="mt-5 border-t border-hairline pt-4">
        <h4 className="text-sm font-semibold text-ink">Sampled workers</h4>
        {sample.workers.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No sampled workers.</p>
        ) : (
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            {sample.workers.map((worker, index) => (
              <article className="rounded-lg bg-card p-3" key={`worker-${index + 1}`}>
                <h5 className="text-sm font-semibold text-ink">Worker {index + 1}</h5>
                <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-sm">
                  <OptionalPreviewField label="Role" value={worker.role} />
                  <OptionalPreviewField label="Count" value={worker.count} />
                  <OptionalPreviewField label="Hours" value={worker.hours} />
                  <OptionalPreviewField label="Notes" value={worker.notes} />
                </dl>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-hairline pt-4">
        <h4 className="text-sm font-semibold text-ink">Sampled materials</h4>
        {sample.materials.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No sampled materials.</p>
        ) : (
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            {sample.materials.map((material, index) => (
              <article className="rounded-lg bg-card p-3" key={`material-${index + 1}`}>
                <h5 className="text-sm font-semibold text-ink">Material {index + 1}</h5>
                <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-sm">
                  <OptionalPreviewField label="Name" value={material.name} />
                  <OptionalPreviewField label="Quantity" value={material.quantity} />
                  <OptionalPreviewField label="Unit" value={material.unit} />
                  <OptionalPreviewField label="Status" value={material.status} />
                  <OptionalPreviewField label="Condition" value={material.condition} />
                  <OptionalPreviewField label="Notes" value={material.notes} />
                </dl>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-hairline pt-4">
        <h4 className="text-sm font-semibold text-ink">Sampled issues</h4>
        {sample.issues.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No sampled issues.</p>
        ) : (
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            {sample.issues.map((issue, index) => (
              <article className="rounded-lg bg-card p-3" key={`issue-${index + 1}`}>
                <h5 className="text-sm font-semibold text-ink">Issue {index + 1}</h5>
                <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-sm">
                  <OptionalPreviewField label="Title" value={issue.title} />
                  <OptionalPreviewField label="Severity" value={issue.severity} />
                  <OptionalPreviewField label="Description" value={issue.description} />
                  <OptionalPreviewField label="Action" value={issue.action} />
                </dl>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-5 border-t border-hairline pt-4 lg:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold text-ink">Sampled next steps</h4>
          {sample.nextSteps.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No sampled next steps.</p>
          ) : (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink">
              {sample.nextSteps.map((nextStep, index) => (
                <li key={`next-step-${index + 1}`}>{nextStep}</li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h4 className="text-sm font-semibold text-ink">Sampled summary sections</h4>
          {sample.summarySections.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No sampled summary sections.</p>
          ) : (
            <div className="mt-2 space-y-3">
              {sample.summarySections.map((summarySection, index) => (
                <article className="rounded-lg bg-card p-3" key={`summary-${index + 1}`}>
                  <h5 className="text-sm font-semibold text-ink">{summarySection.title}</h5>
                  <p className="mt-1 text-sm text-ink">{summarySection.body}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SuccessfulCanary({ observation }: { observation: ReportCanarySuccess }) {
  const isWarning = observation.status === 'warning';
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">
            Observed <time dateTime={observation.observedAt}>{observation.observedAt}</time>
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Completed in {canaryNumber.format(observation.durationMs)} ms.
          </p>
        </div>
        <CanaryBadge label={isWarning ? 'Warning' : 'Pass'} tone={isWarning ? 'warning' : 'pass'} />
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
              {canaryNumber.format(observation.generation.durationMs)} ms
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

      <div className="mt-5 border-t border-hairline pt-5">
        <h3 className="font-semibold text-ink">Live usage proof</h3>
        <p className="mt-2 text-sm text-ink">Usage row matched.</p>
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-ink-soft">Input tokens</dt>
          <dd className="text-ink">{canaryNumber.format(observation.usage.inputTokens)}</dd>
          <dt className="text-ink-soft">Output tokens</dt>
          <dd className="text-ink">{canaryNumber.format(observation.usage.outputTokens)}</dd>
          <dt className="text-ink-soft">Cached tokens</dt>
          <dd className="text-ink">{canaryNumber.format(observation.usage.cachedTokens)}</dd>
          <dt className="text-ink-soft">Latency</dt>
          <dd className="text-ink">{canaryNumber.format(observation.usage.latencyMs)} ms</dd>
        </dl>
      </div>

      <CanaryPreview preview={observation.preview} />

      {observation.limits && <CanaryLimits limits={observation.limits} />}

      <div className="mt-5 border-t border-hairline pt-5 text-sm text-ink">
        {observation.cleanup === 'succeeded' ? (
          <p>Sign-out confirmed.</p>
        ) : (
          <p>Cleanup: application sign-out not confirmed.</p>
        )}
      </div>
    </div>
  );
}

function FailedCanary({ observation }: { observation: ReportCanaryFailure }) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">
            Observed <time dateTime={observation.observedAt}>{observation.observedAt}</time>
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Stopped after {canaryNumber.format(observation.durationMs)} ms.
          </p>
        </div>
        <CanaryBadge label="Failed" tone="fail" />
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

function CanaryResult({ state }: { state: ReportCanaryState }) {
  if (state.status === 'idle') return <p>Not run yet in this browser session.</p>;
  if (state.status === 'running') return <p>Running live canary…</p>;
  if (state.status === 'invalid-response') {
    return (
      <div>
        <CanaryBadge label="Unknown" tone="unknown" />
        <p className="mt-3 text-sm text-ink-soft">The live canary returned an invalid response.</p>
      </div>
    );
  }
  if (state.status === 'request-rejected') {
    return (
      <div>
        <CanaryBadge label="Request rejected" tone="fail" />
        <p className="mt-3 text-sm text-ink-soft">
          The admin origin or CSRF check rejected this live canary request.
        </p>
      </div>
    );
  }
  if (state.status === 'rate-limited') {
    return (
      <div>
        <CanaryBadge label="Rate limited" tone="warning" />
        <p className="mt-3 text-sm text-ink-soft">
          Live canary run limit reached. Try again later.
        </p>
      </div>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <div>
        <CanaryBadge label="Unknown" tone="unknown" />
        <p className="mt-3 text-sm text-ink-soft">The live canary could not be reached.</p>
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
          <CanaryBadge label="Unknown" tone="unknown" />
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          {state.observation.reason === 'not_enabled'
            ? 'Report-generation live canary is disabled. No provider call occurred.'
            : 'Report-generation live canary is not configured. No provider call occurred.'}
        </p>
      </div>
    );
  }
  if (state.observation.status === 'fail') {
    return <FailedCanary observation={state.observation} />;
  }
  return <SuccessfulCanary observation={state.observation} />;
}

function ReportCanary({ state, onRun }: { state: ReportCanaryState; onRun: () => void }) {
  const running = state.status === 'running';
  return (
    <section className="mt-8" aria-labelledby="report-live-canary-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink" id="report-live-canary-title">
            Report generation live canary
          </h2>
          <p className="mt-1 text-sm text-ink-soft">Each click updates one synthetic report.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Each click spends a small amount of real AI quota.
          </p>
        </div>
        <button className={buttonClass} disabled={running} type="button" onClick={onRun}>
          Run live canary
        </button>
      </div>
      <div
        aria-live="polite"
        className="mt-4 rounded-xl border border-hairline bg-card p-5 text-ink shadow-sm"
      >
        <CanaryResult state={state} />
      </div>
    </section>
  );
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

function GitHubRateLimitSummary({ rateLimit }: { rateLimit: GitHubRateLimit | null }) {
  if (!rateLimit) {
    return <p className="text-xs text-ink-soft">Request budget: Unknown</p>;
  }

  const accessibleName = `Primary public REST request budget for this browser/IP: ${formatQuotaPercent(
    ((rateLimit.limit - rateLimit.remaining) / rateLimit.limit) * 100,
  )}% used, ${formatQuotaPercent((rateLimit.remaining / rateLimit.limit) * 100)}% remaining`;

  return (
    <div>
      <GitHubRateLimitLine rateLimit={rateLimit} />
      <QuotaProgress
        accessibleName={accessibleName}
        allowance={rateLimit.limit}
        used={rateLimit.limit - rateLimit.remaining}
      />
    </div>
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
          <div className="mt-2">
            <GitHubRateLimitSummary rateLimit={state.rateLimit} />
          </div>
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
              <GitHubRateLimitSummary rateLimit={state.rateLimit} />
              <p className="text-xs text-ink-soft">
                Observed{' '}
                <time dateTime={state.observedAt}>{formatTimestamp(state.observedAt)}</time>.
              </p>
            </div>
          </article>
        </div>
      )}
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
  const { apiBaseUrl, siteBaseUrl, dashboardUrl } = getPublicEnv();
  const [deployment, setDeployment] = useState<DeploymentState>(INITIAL_DEPLOYMENT_STATE);
  const [storageLifecycle, setStorageLifecycle] = useState<StorageLifecycleState>({
    status: 'idle',
  });
  const [neonInventory, setNeonInventory] = useState<NeonInventoryState>({ status: 'idle' });
  const [neonUsage, setNeonUsage] = useState<NeonUsageState>({ status: 'idle' });
  const [r2Capacity, setR2Capacity] = useState<R2CapacityState>({ status: 'idle' });
  const [sentryObservation, setSentryObservation] = useState<SentryState>({ status: 'idle' });
  const [flyInventory, setFlyInventory] = useState<FlyInventoryState>({ status: 'idle' });
  const [aiUsage, setAiUsage] = useState<AiUsageState>({ status: 'idle' });
  const [reportCanary, setReportCanary] = useState<ReportCanaryState>({
    status: 'idle',
  });
  const reportCanaryRunning = useRef(false);
  const [github, setGitHub] = useState<GitHubState>({ status: 'checking' });
  const refreshGeneration = useRef(0);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const generation = refreshGeneration.current + 1;
    refreshGeneration.current = generation;
    const isCurrent = () => refreshGeneration.current === generation;
    let sessionExpired = false;
    const expireSession = () => {
      if (!isCurrent() || sessionExpired) return;
      sessionExpired = true;
      onSessionExpired();
    };
    setRefreshing(true);
    setStorageLifecycle({ status: 'loading' });
    setNeonInventory({ status: 'loading' });
    setNeonUsage({ status: 'loading' });
    setR2Capacity({ status: 'loading' });
    setSentryObservation({ status: 'loading' });
    setFlyInventory({ status: 'loading' });
    setAiUsage({ status: 'loading' });
    setGitHub({ status: 'checking' });
    try {
      await Promise.allSettled([
        loadApiIdentity().then((api) => {
          if (isCurrent() && !sessionExpired) {
            setDeployment((current) => ({ ...current, api }));
          }
        }),
        loadReadiness('/readyz').then((product) => {
          if (isCurrent() && !sessionExpired) {
            setDeployment((current) => ({ ...current, product }));
          }
        }),
        loadReadiness('/admin/readyz').then((admin) => {
          if (isCurrent() && !sessionExpired) {
            setDeployment((current) => ({ ...current, admin }));
          }
        }),
        loadPagesMarker(`${siteBaseUrl}/_cf-pages-deployment.json`, 'omit').then((publicPages) => {
          if (isCurrent() && !sessionExpired) {
            setDeployment((current) => ({ ...current, publicPages }));
          }
        }),
        loadPagesMarker('/_cf-pages-deployment.json', 'same-origin').then((adminPages) => {
          if (isCurrent() && !sessionExpired) {
            setDeployment((current) => ({ ...current, adminPages }));
          }
        }),
        loadPagesMarker(`${dashboardUrl}/_cf-pages-deployment.json`, 'omit').then(
          (dashboardPages) => {
            if (isCurrent() && !sessionExpired) {
              setDeployment((current) => ({ ...current, dashboardPages }));
            }
          },
        ),
        loadStorageLifecycle().then((result) => {
          if (!isCurrent()) return;
          if (result.status === 'unauthorized') {
            expireSession();
          } else if (!sessionExpired) {
            setStorageLifecycle(result);
          }
        }),
        loadNeonInventory().then((result) => {
          if (!isCurrent()) return;
          if (result.status === 'unauthorized') {
            expireSession();
          } else if (!sessionExpired) {
            setNeonInventory(result);
          }
        }),
        loadNeonUsage().then((result) => {
          if (!isCurrent()) return;
          if (result.status === 'unauthorized') {
            expireSession();
          } else if (!sessionExpired) {
            setNeonUsage(result);
          }
        }),
        loadR2Capacity().then((result) => {
          if (!isCurrent()) return;
          if (result.status === 'unauthorized') {
            expireSession();
          } else if (!sessionExpired) {
            setR2Capacity(result);
          }
        }),
        loadSentryObservation().then((result) => {
          if (!isCurrent()) return;
          if (result.status === 'unauthorized') {
            expireSession();
          } else if (!sessionExpired) {
            setSentryObservation(result);
          }
        }),
        loadFlyInventory().then((result) => {
          if (!isCurrent()) return;
          if (result.status === 'unauthorized') {
            expireSession();
          } else if (!sessionExpired) {
            setFlyInventory(result);
          }
        }),
        loadAiUsage().then((result) => {
          if (!isCurrent()) return;
          if (result.status === 'unauthorized') {
            expireSession();
          } else if (!sessionExpired) {
            setAiUsage(result);
          }
        }),
        loadGitHubStatus().then((githubStatus) => {
          if (isCurrent() && !sessionExpired) setGitHub(githubStatus);
        }),
      ]);
    } finally {
      if (isCurrent()) setRefreshing(false);
    }
  }, [dashboardUrl, onSessionExpired, siteBaseUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRunCanary = useCallback(async () => {
    if (reportCanaryRunning.current) return;
    reportCanaryRunning.current = true;
    setReportCanary({ status: 'running' });
    try {
      const result = await runReportCanary(session.csrfToken);
      if (result.status === 'unauthorized') {
        onSessionExpired();
        return;
      }
      setReportCanary(result);
    } finally {
      reportCanaryRunning.current = false;
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
          <PagesIdentityCard
            name="Public site Pages identity"
            source="public-site"
            state={deployment.publicPages}
          />
          <PagesIdentityCard
            name="Administrator Pages identity"
            source="same-origin administrator"
            state={deployment.adminPages}
          />
          <PagesIdentityCard
            name="Office dashboard Pages identity"
            source="office-dashboard"
            state={deployment.dashboardPages}
          />
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

      <StorageLifecycle state={storageLifecycle} />

      <ReportCanary state={reportCanary} onRun={() => void handleRunCanary()} />

      <NeonUsage state={neonUsage} />

      <AiUsage state={aiUsage} />

      <NeonInventory state={neonInventory} />

      <Sentry state={sentryObservation} />

      <FlyInventory state={flyInventory} />

      <GitHubRepositoryStatus state={github} />

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
