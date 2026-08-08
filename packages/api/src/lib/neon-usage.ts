import { operations, type NeonUsageObservation, type NeonUsageProject } from '@harpa/api-contract';
import { z } from 'zod';
import { env } from '../env.js';

const NEON_API_ORIGIN = 'https://console.neon.tech';
const NEON_API_ROOT = `${NEON_API_ORIGIN}/api/v2`;
const PROJECT_LIMIT = 20;
const PROJECT_QUERY_TIMEOUT_MS = 5_000;
const OBSERVATION_TIMEOUT_MS = 10_000;
const COMPUTE_ALLOWANCE = 360_000;
const STORAGE_ALLOWANCE = 500_000_000;
const TRANSFER_ALLOWANCE = 5_000_000_000;
const CAVEATS = [
  'provider_values_may_lag',
  'free_plan_published_reference',
  'storage_uses_published_reference',
  'transfer_requires_complete_project_coverage',
  'not_invoice_or_credit_balance',
  'published_allowances_can_change',
] as const;

const providerId = z.string().regex(/^[a-z0-9-]{1,60}$/);
const nonBlank = z.string().trim().min(1);
const safeCount = z.number().int().nonnegative().safe();
const providerTimestamp = z.string().datetime({ offset: true });
const pagination = z
  .object({
    cursor: z.string().optional(),
    next: z.string().optional(),
  })
  .strict();

const organizationResponse = z
  .object({
    id: providerId,
    plan: z.unknown(),
  })
  .passthrough();

const projectSummary = z
  .object({
    id: providerId,
    name: nonBlank,
    org_id: providerId,
    effective_project_permission: z.unknown().optional(),
  })
  .passthrough();

const projectListResponse = z
  .object({
    projects: z.array(projectSummary).max(PROJECT_LIMIT),
    unavailable_project_ids: z.array(providerId).max(PROJECT_LIMIT).optional().default([]),
    pagination: pagination.optional().default({}),
  })
  .passthrough();

const projectDetail = z
  .object({
    project: z
      .object({
        id: providerId,
        name: nonBlank,
        org_id: providerId,
        effective_project_permission: z.literal('VIEWER'),
        active_time: z.unknown().optional(),
        platform_id: z.unknown().optional(),
        region_id: z.unknown().optional(),
        pg_version: z.unknown().optional(),
        proxy_host: z.unknown().optional(),
        branch_logical_size_limit: z.unknown().optional(),
        branch_logical_size_limit_bytes: z.unknown().optional(),
        provisioner: z.unknown().optional(),
        store_passwords: z.unknown().optional(),
        cpu_used_sec: z.unknown().optional(),
        creation_source: z.unknown().optional(),
        created_at: z.unknown().optional(),
        updated_at: z.unknown().optional(),
        owner_id: z.unknown().optional(),
        settings: z.unknown().optional(),
        compute_time_seconds: safeCount,
        synthetic_storage_size: safeCount,
        data_transfer_bytes: safeCount,
        consumption_period_start: providerTimestamp,
        consumption_period_end: providerTimestamp,
        active_time_seconds: z.unknown().optional(),
        written_data_bytes: z.unknown().optional(),
        data_storage_bytes_hour: z.unknown().optional(),
        owner: z.unknown().optional(),
        connection_uri: z.unknown().optional(),
        endpoints: z.unknown().optional(),
      })
      .passthrough(),
  })
  .passthrough();

type UsageWithProjects = Exclude<NeonUsageObservation, { status: 'unknown' }>;
type AvailableProject = Extract<UsageWithProjects['projects'][number], { status: 'available' }>;
type UnknownProject = Extract<UsageWithProjects['projects'][number], { status: 'unknown' }>;
type TopReason = Extract<NeonUsageObservation, { status: 'unknown' }>['reason'];
type ProjectReason = UnknownProject['reason'];

type ProviderResult<T> = { ok: true; value: T } | { ok: false; reason: TopReason };

export interface ObserveAdminNeonUsageOptions {
  apiKey?: string;
  orgId?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export async function observeAdminNeonUsage(
  options: ObserveAdminNeonUsageOptions = {},
): Promise<NeonUsageObservation> {
  const observedAt = (options.now ?? (() => new Date()))().toISOString();
  const apiKey = options.apiKey ?? env.ADMIN_NEON_VIEWER_API_KEY;
  const orgId = options.orgId ?? env.ADMIN_NEON_ORG_ID;

  if (!apiKey?.trim() || !orgId?.trim()) {
    return validateObservation({ observedAt, status: 'unknown', reason: 'not_configured' });
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), OBSERVATION_TIMEOUT_MS);
  deadline.unref?.();

  try {
    const organizationRequest = await getJson(
      new URL(`${NEON_API_ROOT}/organizations/${encodeURIComponent(orgId)}`),
      apiKey,
      controller.signal,
      fetchImpl,
    );
    if (!organizationRequest.ok) {
      return validateObservation({
        observedAt,
        status: 'unknown',
        reason: organizationRequest.reason,
      });
    }

    const parsedOrganization = organizationResponse.safeParse(organizationRequest.value);
    if (!parsedOrganization.success || parsedOrganization.data.id !== orgId) {
      return validateObservation({ observedAt, status: 'unknown', reason: 'invalid_response' });
    }

    if (parsedOrganization.data.plan !== 'free') {
      return validateObservation({
        observedAt,
        status: 'unknown',
        reason:
          typeof parsedOrganization.data.plan === 'string'
            ? 'unsupported_plan'
            : 'invalid_response',
      });
    }

    const projectListUrl = new URL(`${NEON_API_ROOT}/projects`);
    projectListUrl.searchParams.set('org_id', orgId);
    projectListUrl.searchParams.set('limit', String(PROJECT_LIMIT));
    projectListUrl.searchParams.set('timeout', String(PROJECT_QUERY_TIMEOUT_MS));

    const projectListRequest = await getJson(projectListUrl, apiKey, controller.signal, fetchImpl);
    if (!projectListRequest.ok) {
      return validateObservation({
        observedAt,
        status: 'unknown',
        reason: projectListRequest.reason,
      });
    }

    const parsedProjects = projectListResponse.safeParse(projectListRequest.value);
    if (!parsedProjects.success) {
      return validateObservation({ observedAt, status: 'unknown', reason: 'invalid_response' });
    }

    const discovery = parsedProjects.data;
    const projectIds = discovery.projects.map((project) => project.id);
    if (new Set(projectIds).size !== projectIds.length) {
      return validateObservation({ observedAt, status: 'unknown', reason: 'invalid_response' });
    }
    const viewerOnly = discovery.projects.every(
      (project) => project.org_id === orgId && project.effective_project_permission === 'VIEWER',
    );
    if (!viewerOnly) {
      return validateObservation({ observedAt, status: 'unknown', reason: 'unsafe_permissions' });
    }

    const projectsTruncated = hasNextPage(discovery.pagination);
    const unavailableProjectCount = discovery.unavailable_project_ids.length;
    if (discovery.projects.length === 0) {
      return validateObservation({
        observedAt,
        status:
          projectsTruncated || unavailableProjectCount > 0
            ? ('partial' as const)
            : ('available' as const),
        organizationId: orgId,
        plan: 'free',
        projectsTruncated,
        unavailableProjectCount,
        projects: [],
        organizationTransfer: {
          status: 'unknown',
          reason:
            projectsTruncated || unavailableProjectCount > 0
              ? 'incomplete_project_coverage'
              : 'no_projects',
        },
        caveats: CAVEATS,
      });
    }

    const projects: NeonUsageProject[] = [];
    for (const summary of discovery.projects) {
      if (controller.signal.aborted) {
        projects.push(unknownProjectFromSummary(summary, 'timeout'));
        continue;
      }

      const detailRequest = await getJson(
        new URL(`${NEON_API_ROOT}/projects/${encodeURIComponent(summary.id)}`),
        apiKey,
        controller.signal,
        fetchImpl,
      );
      if (!detailRequest.ok) {
        projects.push(unknownProjectFromSummary(summary, projectReason(detailRequest.reason)));
        continue;
      }

      const parsedDetail = projectDetail.safeParse(detailRequest.value);
      if (!parsedDetail.success) {
        projects.push(unknownProjectFromSummary(summary, 'invalid_response'));
        continue;
      }

      const detail = parsedDetail.data.project;
      if (detail.id !== summary.id || detail.org_id !== orgId) {
        projects.push(unknownProjectFromSummary(summary, 'invalid_response'));
        continue;
      }
      if (Date.parse(detail.consumption_period_start) > Date.parse(detail.consumption_period_end)) {
        projects.push(unknownProjectFromSummary(summary, 'invalid_response'));
        continue;
      }

      projects.push({
        status: 'available',
        id: detail.id,
        name: detail.name,
        effectivePermission: 'VIEWER',
        periodStart: detail.consumption_period_start,
        periodEnd: detail.consumption_period_end,
        compute: {
          used: detail.compute_time_seconds,
          allowance: COMPUTE_ALLOWANCE,
          unit: 'cu_seconds',
        },
        storage: {
          used: detail.synthetic_storage_size,
          allowance: STORAGE_ALLOWANCE,
          unit: 'bytes',
        },
        transferBytes: detail.data_transfer_bytes,
      });
    }

    const availableProjects = projects.filter(
      (project): project is AvailableProject => project.status === 'available',
    );
    const incompleteCoverage =
      projectsTruncated ||
      unavailableProjectCount > 0 ||
      projects.some((project) => project.status === 'unknown');
    const distinctPeriods = new Set(
      availableProjects.map((project) => `${project.periodStart}::${project.periodEnd}`),
    );
    const periodMismatch = availableProjects.length >= 2 && distinctPeriods.size > 1;
    const summedTransfer = availableProjects.reduce(
      (sum, project) => sum + project.transferBytes,
      0,
    );
    const transferOverflow = !Number.isSafeInteger(summedTransfer);

    if (!incompleteCoverage && !periodMismatch && !transferOverflow) {
      return validateObservation({
        observedAt,
        status: 'available',
        organizationId: orgId,
        plan: 'free',
        projectsTruncated,
        unavailableProjectCount,
        projects,
        organizationTransfer: {
          status: 'available',
          periodStart: availableProjects[0]!.periodStart,
          periodEnd: availableProjects[0]!.periodEnd,
          used: summedTransfer,
          allowance: TRANSFER_ALLOWANCE,
          unit: 'bytes',
        },
        caveats: CAVEATS,
      });
    }

    return validateObservation({
      observedAt,
      status: 'partial',
      organizationId: orgId,
      plan: 'free',
      projectsTruncated,
      unavailableProjectCount,
      projects,
      organizationTransfer: {
        status: 'unknown',
        reason: incompleteCoverage
          ? 'incomplete_project_coverage'
          : periodMismatch
            ? 'period_mismatch'
            : 'invalid_response',
      },
      caveats: CAVEATS,
    });
  } finally {
    clearTimeout(deadline);
  }
}

function unknownProjectFromSummary(
  summary: z.infer<typeof projectSummary>,
  reason: ProjectReason,
): UnknownProject {
  return {
    status: 'unknown',
    id: summary.id,
    name: summary.name,
    effectivePermission: 'VIEWER',
    reason,
  };
}

async function getJson(
  url: URL,
  apiKey: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<ProviderResult<unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      redirect: 'error',
      signal,
    });
  } catch (error) {
    return {
      ok: false,
      reason: isAbort(error, signal) ? 'timeout' : 'provider_unavailable',
    };
  }

  if (!response.ok) {
    return { ok: false, reason: topReasonForStatus(response.status) };
  }

  try {
    return { ok: true, value: await response.json() };
  } catch (error) {
    if (isAbort(error, signal)) return { ok: false, reason: 'timeout' };
    return {
      ok: false,
      reason: error instanceof SyntaxError ? 'invalid_response' : 'provider_unavailable',
    };
  }
}

function topReasonForStatus(status: number): TopReason {
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  return 'provider_unavailable';
}

function projectReason(reason: TopReason): ProjectReason {
  if (reason === 'timeout') return 'timeout';
  if (reason === 'rate_limited') return 'rate_limited';
  if (reason === 'forbidden') return 'forbidden';
  if (reason === 'not_found') return 'not_found';
  if (reason === 'invalid_response') return 'invalid_response';
  return 'provider_unavailable';
}

function hasNextPage(value: z.infer<typeof pagination>): boolean {
  return Boolean(value.cursor?.trim() || value.next?.trim());
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === 'AbortError');
}

function validateObservation(observation: unknown): NeonUsageObservation {
  return operations.neonUsageObservation.parse(observation);
}
