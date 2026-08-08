import { operations, type SentryObservation } from '@harpa/api-contract';
import { z } from 'zod';
import { env } from '../env.js';

const ISSUES_LIMIT = 100;
const ISSUE_BODY_LIMIT_BYTES = 1_048_576;
const SESSION_BODY_LIMIT_BYTES = 262_144;
const OBSERVATION_TIMEOUT_MS = 10_000;
const MIN_SESSION_WINDOW_MS = 23 * 60 * 60 * 1_000;
const MAX_SESSION_WINDOW_MS = 25 * 60 * 60 * 1_000;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const SENTRY_ORIGINS = {
  global: 'https://sentry.io',
  us: 'https://us.sentry.io',
  de: 'https://de.sentry.io',
} as const;

const BASE_CAVEATS = [
  'issue_groups_not_events',
  'mobile_sessions_only',
  'telemetry_coverage_applies',
] as const;

const issueCategory = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim().length > 0);

const issuesResponse = z
  .array(
    z
      .object({
        issueCategory,
      })
      .passthrough(),
  )
  .max(ISSUES_LIMIT);

const sessionStatus = z.enum(['healthy', 'errored', 'abnormal', 'crashed']);
const safeCount = z.number().int().nonnegative().safe();

const sessionsResponse = z
  .object({
    groups: z
      .array(
        z
          .object({
            by: z.object({ 'session.status': sessionStatus }).passthrough(),
            totals: z.object({ 'sum(session)': safeCount }).passthrough(),
          })
          .passthrough(),
      )
      .max(4),
    intervals: z
      .array(z.string().datetime({ offset: true }))
      .min(1)
      .max(25),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
  })
  .passthrough();

type SentryRegion = keyof typeof SENTRY_ORIGINS;
type SentryEnvironment = 'production' | 'preview' | 'development';
type SentryReason =
  | 'not_configured'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'timeout'
  | 'invalid_response'
  | 'provider_unavailable'
  | 'no_session_data';

type AvailableIssueObservation = {
  status: 'available';
  count: number;
  countKind: 'exact' | 'lower_bound';
  cap: 100;
};

type AvailableSessionObservation = {
  status: 'available';
  window: 'last_24_hours';
  windowStart: string;
  windowEnd: string;
  totalSessions: number;
  healthySessions: number;
  erroredSessions: number;
  abnormalSessions: number;
  crashedSessions: number;
};

type ProviderResult<T> = { ok: true; value: T } | { ok: false; reason: SentryReason };

type ObserverConfig = {
  orgSlug: string;
  readToken: string;
  projectSlugs: string[];
  mobileProjectSlug: string;
  environment: SentryEnvironment;
  region: SentryRegion;
};

export interface ObserveAdminSentryOptions {
  orgSlug?: string;
  readToken?: string;
  projectSlugs?: string[];
  mobileProjectSlug?: string;
  environment?: string;
  region?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export async function observeAdminSentry(
  options: ObserveAdminSentryOptions = {},
): Promise<SentryObservation> {
  const observedAt = (options.now ?? (() => new Date()))().toISOString();
  const config = resolveConfig(options);
  if (!config) {
    return validateObservation({ observedAt, status: 'unknown', reason: 'not_configured' });
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), OBSERVATION_TIMEOUT_MS);
  deadline.unref?.();

  try {
    const origin = SENTRY_ORIGINS[config.region];
    const [issuesResult, sessionsResult] = await Promise.all([
      observeIssues({ config, origin, signal: controller.signal, fetchImpl }),
      observeSessions({ config, origin, signal: controller.signal, fetchImpl }),
    ]);

    if (!issuesResult.ok && !sessionsResult.ok) {
      return validateObservation({
        observedAt,
        status: 'unknown',
        reason: highestPriorityReason([issuesResult.reason, sessionsResult.reason]),
      });
    }

    const unresolvedErrors = issuesResult.ok
      ? issuesResult.value
      : { status: 'unknown' as const, reason: issuesResult.reason };
    const mobileSessions = sessionsResult.ok
      ? sessionsResult.value
      : { status: 'unknown' as const, reason: sessionsResult.reason };
    const truncated = issuesResult.ok && issuesResult.value.countKind === 'lower_bound';

    return validateObservation({
      observedAt,
      status: issuesResult.ok && sessionsResult.ok && !truncated ? 'available' : 'partial',
      unresolvedErrors,
      mobileSessions,
      caveats: truncated ? [...BASE_CAVEATS, 'issue_count_truncated'] : [...BASE_CAVEATS],
    });
  } finally {
    clearTimeout(deadline);
  }
}

function resolveConfig(options: ObserveAdminSentryOptions): ObserverConfig | null {
  const orgSlug = (options.orgSlug ?? env.ADMIN_SENTRY_ORG_SLUG)?.trim();
  const readToken = (options.readToken ?? env.ADMIN_SENTRY_READ_TOKEN)?.trim();
  const projectSlugs = (options.projectSlugs ?? splitCsv(env.ADMIN_SENTRY_PROJECT_SLUGS)).map(
    (slug) => slug.trim(),
  );
  const mobileProjectSlug = (
    options.mobileProjectSlug ?? env.ADMIN_SENTRY_MOBILE_PROJECT_SLUG
  )?.trim();
  const environment = options.environment ?? env.ADMIN_SENTRY_ENVIRONMENT;
  const region = options.region ?? env.ADMIN_SENTRY_REGION ?? 'global';

  if (
    !orgSlug ||
    !DNS_LABEL.test(orgSlug) ||
    !readToken ||
    projectSlugs.length < 1 ||
    projectSlugs.length > 3 ||
    projectSlugs.some((slug) => !DNS_LABEL.test(slug)) ||
    new Set(projectSlugs).size !== projectSlugs.length ||
    !mobileProjectSlug ||
    !DNS_LABEL.test(mobileProjectSlug) ||
    !projectSlugs.includes(mobileProjectSlug) ||
    !isSentryEnvironment(environment) ||
    !isSentryRegion(region)
  ) {
    return null;
  }

  return {
    orgSlug,
    readToken,
    projectSlugs,
    mobileProjectSlug,
    environment,
    region,
  };
}

async function observeIssues(options: {
  config: ObserverConfig;
  origin: string;
  signal: AbortSignal;
  fetchImpl: typeof fetch;
}): Promise<ProviderResult<AvailableIssueObservation>> {
  const url = new URL(`/api/0/organizations/${options.config.orgSlug}/issues/`, options.origin);
  for (const projectSlug of options.config.projectSlugs) {
    url.searchParams.append('project', projectSlug);
  }
  url.searchParams.set('environment', options.config.environment);
  url.searchParams.set('query', 'is:unresolved');
  url.searchParams.set('sort', 'date');
  url.searchParams.set('limit', String(ISSUES_LIMIT));
  url.searchParams.set('shortIdLookup', '0');
  for (const collapse of ['filtered', 'lifetime', 'stats', 'unhandled']) {
    url.searchParams.append('collapse', collapse);
  }

  const response = await getJson(url, {
    apiToken: options.config.readToken,
    signal: options.signal,
    fetchImpl: options.fetchImpl,
    bodyLimitBytes: ISSUE_BODY_LIMIT_BYTES,
  });
  if (!response.ok) return response;

  const parsed = issuesResponse.safeParse(response.value.body);
  if (!parsed.success) return { ok: false, reason: 'invalid_response' };

  const pagination = parseIssuesPagination(response.value.linkHeader);
  if (!pagination.ok) return pagination;

  return {
    ok: true,
    value: {
      status: 'available',
      count: parsed.data.filter((issue) => issue.issueCategory === 'error').length,
      countKind: pagination.truncated ? 'lower_bound' : 'exact',
      cap: ISSUES_LIMIT,
    },
  };
}

async function observeSessions(options: {
  config: ObserverConfig;
  origin: string;
  signal: AbortSignal;
  fetchImpl: typeof fetch;
}): Promise<ProviderResult<AvailableSessionObservation>> {
  const url = new URL(`/api/0/organizations/${options.config.orgSlug}/sessions/`, options.origin);
  url.searchParams.set('project', options.config.mobileProjectSlug);
  url.searchParams.set('environment', options.config.environment);
  url.searchParams.set('statsPeriod', '24h');
  url.searchParams.set('interval', '1h');
  url.searchParams.set('field', 'sum(session)');
  url.searchParams.set('groupBy', 'session.status');
  url.searchParams.set('includeTotals', '1');
  url.searchParams.set('includeSeries', '0');

  const response = await getJson(url, {
    apiToken: options.config.readToken,
    signal: options.signal,
    fetchImpl: options.fetchImpl,
    bodyLimitBytes: SESSION_BODY_LIMIT_BYTES,
  });
  if (!response.ok) return response;

  const parsed = sessionsResponse.safeParse(response.value.body);
  if (!parsed.success) return { ok: false, reason: 'invalid_response' };

  const startMs = Date.parse(parsed.data.start);
  const endMs = Date.parse(parsed.data.end);
  const durationMs = endMs - startMs;
  if (durationMs < MIN_SESSION_WINDOW_MS || durationMs > MAX_SESSION_WINDOW_MS) {
    return { ok: false, reason: 'invalid_response' };
  }

  const counts = {
    healthy: 0,
    errored: 0,
    abnormal: 0,
    crashed: 0,
  };
  const seen = new Set<keyof typeof counts>();
  let totalSessions = 0;

  for (const group of parsed.data.groups) {
    const status = group.by['session.status'];
    if (seen.has(status)) return { ok: false, reason: 'invalid_response' };
    seen.add(status);

    const count = group.totals['sum(session)'];
    if (totalSessions > Number.MAX_SAFE_INTEGER - count) {
      return { ok: false, reason: 'invalid_response' };
    }
    counts[status] = count;
    totalSessions += count;
  }

  if (totalSessions === 0) return { ok: false, reason: 'no_session_data' };

  return {
    ok: true,
    value: {
      status: 'available',
      window: 'last_24_hours',
      windowStart: parsed.data.start,
      windowEnd: parsed.data.end,
      totalSessions,
      healthySessions: counts.healthy,
      erroredSessions: counts.errored,
      abnormalSessions: counts.abnormal,
      crashedSessions: counts.crashed,
    },
  };
}

async function getJson(
  url: URL,
  options: {
    apiToken: string;
    signal: AbortSignal;
    fetchImpl: typeof fetch;
    bodyLimitBytes: number;
  },
): Promise<ProviderResult<{ body: unknown; linkHeader: string | null }>> {
  let response: Response;
  try {
    response = await options.fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${options.apiToken}`,
      },
      redirect: 'error',
      signal: options.signal,
    });
  } catch (error) {
    return {
      ok: false,
      reason: isAbort(error, options.signal) ? 'timeout' : 'provider_unavailable',
    };
  }

  if (!response.ok) return { ok: false, reason: reasonForStatus(response.status) };

  const body = await readBoundedJson(response, options.bodyLimitBytes, options.signal);
  if (!body.ok) return body;

  return {
    ok: true,
    value: {
      body: body.value,
      linkHeader: response.headers.get('link'),
    },
  };
}

async function readBoundedJson(
  response: Response,
  limitBytes: number,
  signal: AbortSignal,
): Promise<ProviderResult<unknown>> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const normalizedLength = declaredLength.trim();
    if (!/^(0|[1-9][0-9]*)$/.test(normalizedLength)) {
      return { ok: false, reason: 'invalid_response' };
    }
    const parsedLength = Number(normalizedLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength > limitBytes) {
      return { ok: false, reason: 'invalid_response' };
    }
  }

  const reader = response.body?.getReader();
  if (!reader) return { ok: false, reason: 'invalid_response' };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value) continue;

      totalBytes += chunk.value.byteLength;
      if (totalBytes > limitBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'invalid_response' };
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    return {
      ok: false,
      reason: isAbort(error, signal) ? 'timeout' : 'provider_unavailable',
    };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: 'invalid_response' };
  }
}

function parseIssuesPagination(
  linkHeader: string | null,
): { ok: true; truncated: boolean } | { ok: false; reason: SentryReason } {
  if (!linkHeader?.trim()) return { ok: false, reason: 'invalid_response' };

  let nextResults: string | null = null;
  for (const rawEntry of linkHeader.split(',')) {
    const entry = parseLinkEntry(rawEntry.trim());
    if (!entry) return { ok: false, reason: 'invalid_response' };
    if (entry.rel !== 'next') continue;
    if (nextResults !== null || (entry.results !== 'true' && entry.results !== 'false')) {
      return { ok: false, reason: 'invalid_response' };
    }
    nextResults = entry.results;
  }

  if (nextResults === null) return { ok: false, reason: 'invalid_response' };
  return { ok: true, truncated: nextResults === 'true' };
}

function parseLinkEntry(rawEntry: string): { rel: string; results?: string } | null {
  const target = /^<([^<>]+)>(.*)$/.exec(rawEntry);
  if (!target) return null;

  try {
    const url = new URL(target[1]!);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  } catch {
    return null;
  }

  const parameters = new Map<string, string>();
  let remainder = target[2]!;
  while (remainder.length > 0) {
    const parameter = /^;\s*([A-Za-z][A-Za-z0-9_-]*)="([^"]*)"/.exec(remainder);
    if (!parameter || parameters.has(parameter[1]!)) return null;
    parameters.set(parameter[1]!, parameter[2]!);
    remainder = remainder.slice(parameter[0].length);
  }

  const rel = parameters.get('rel');
  if (!rel) return null;
  const results = parameters.get('results');
  return results === undefined ? { rel } : { rel, results };
}

function reasonForStatus(status: number): SentryReason {
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status === 400) return 'invalid_response';
  return 'provider_unavailable';
}

function highestPriorityReason(reasons: SentryReason[]): SentryReason {
  for (const reason of [
    'timeout',
    'rate_limited',
    'forbidden',
    'not_found',
    'invalid_response',
    'provider_unavailable',
    'no_session_data',
    'not_configured',
  ] as const) {
    if (reasons.includes(reason)) return reason;
  }
  return 'provider_unavailable';
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === 'AbortError');
}

function isSentryEnvironment(value: unknown): value is SentryEnvironment {
  return value === 'production' || value === 'preview' || value === 'development';
}

function isSentryRegion(value: unknown): value is SentryRegion {
  return value === 'global' || value === 'us' || value === 'de';
}

function splitCsv(value?: string): string[] {
  return (
    value
      ?.split(',')
      .map((candidate) => candidate.trim())
      .filter(Boolean) ?? []
  );
}

function validateObservation(observation: unknown): SentryObservation {
  operations.sentryObservation.parse(observation);
  return observation as SentryObservation;
}
