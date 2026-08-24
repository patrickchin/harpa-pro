import { operations, type NeonInventoryObservation } from '@harpa/api-contract';
import { z } from 'zod';
import { env } from '../env.js';
import {
  createProviderObservationDeadline,
  requestProviderJson,
} from './provider-observer-http.js';

const NEON_API_ORIGIN = 'https://console.neon.tech';
const NEON_API_ROOT = `${NEON_API_ORIGIN}/api/v2`;
const PROJECT_LIMIT = 20;
const BRANCH_LIMIT = 100;
const PROJECT_QUERY_TIMEOUT_MS = 5_000;

const providerId = z.string().regex(/^[a-z0-9-]{1,60}$/);
const providerTimestamp = z.string().datetime({ offset: true });
const pagination = z.object({
  cursor: z.string().optional(),
  next: z.string().optional(),
});

const providerProject = z.object({
  id: providerId,
  name: z.string().min(1),
  region_id: z.string().min(1),
  pg_version: z.number().int().positive(),
  created_at: providerTimestamp,
  updated_at: providerTimestamp,
  org_id: providerId,
  effective_project_permission: z.unknown().optional(),
});

const projectListResponse = z.object({
  projects: z.array(providerProject).max(PROJECT_LIMIT),
  unavailable_project_ids: z.array(providerId).max(PROJECT_LIMIT).optional().default([]),
  pagination: pagination.optional().default({}),
});

const branchCountResponse = z.object({
  count: z.number().int().nonnegative(),
});

const providerBranch = z.object({
  id: providerId,
  project_id: providerId,
  name: z.string().min(1),
  parent_id: providerId.nullable().optional(),
  current_state: z.string().min(1),
  default: z.boolean(),
  protected: z.boolean(),
  created_at: providerTimestamp,
  updated_at: providerTimestamp,
});

const branchListResponse = z.object({
  branches: z.array(providerBranch).max(BRANCH_LIMIT),
  pagination: pagination.optional().default({}),
});

type InventoryWithProjects = Exclude<NeonInventoryObservation, { status: 'unknown' }>;
type InventoryProject = InventoryWithProjects['projects'][number];
type InventoryReason = Extract<NeonInventoryObservation, { status: 'unknown' }>['reason'];
type BranchCount = InventoryProject['branchCount'];
type BranchDetails = InventoryProject['branchDetails'];

type ProviderResult<T> = { ok: true; value: T } | { ok: false; reason: InventoryReason };

export interface ObserveAdminNeonInventoryOptions {
  apiKey?: string;
  orgId?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/**
 * Read a bounded, redacted Neon inventory for the dedicated browser-admin
 * surface. The observer intentionally has no retry, cache, write, or
 * pagination-following path.
 */
export async function observeAdminNeonInventory(
  options: ObserveAdminNeonInventoryOptions = {},
): Promise<NeonInventoryObservation> {
  const observedAt = (options.now ?? (() => new Date()))().toISOString();
  const apiKey = options.apiKey ?? env.ADMIN_NEON_VIEWER_API_KEY;
  const orgId = options.orgId ?? env.ADMIN_NEON_ORG_ID;

  if (!apiKey?.trim() || !orgId?.trim()) {
    return validateObservation({ observedAt, status: 'unknown', reason: 'not_configured' });
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  return createProviderObservationDeadline().run(async (signal) => {
    const projectUrl = new URL(`${NEON_API_ROOT}/projects`);
    projectUrl.searchParams.set('org_id', orgId);
    projectUrl.searchParams.set('limit', String(PROJECT_LIMIT));
    projectUrl.searchParams.set('timeout', String(PROJECT_QUERY_TIMEOUT_MS));

    const projectRequest = await getJson(projectUrl, apiKey, signal, fetchImpl);
    if (!projectRequest.ok) {
      return validateObservation({
        observedAt,
        status: 'unknown',
        reason: projectRequest.reason,
      });
    }

    const parsedProjects = projectListResponse.safeParse(projectRequest.value);
    if (!parsedProjects.success) {
      return validateObservation({
        observedAt,
        status: 'unknown',
        reason: 'invalid_response',
      });
    }

    const discovery = parsedProjects.data;
    const viewerOnly = discovery.projects.every(
      (project) => project.org_id === orgId && project.effective_project_permission === 'VIEWER',
    );
    if (!viewerOnly) {
      return validateObservation({
        observedAt,
        status: 'unknown',
        reason: 'unsafe_permissions',
      });
    }

    const projects: InventoryProject[] = [];
    for (const project of discovery.projects) {
      let branchCount: BranchCount;
      let branchDetails: BranchDetails;

      if (signal.aborted) {
        branchCount = { status: 'unknown', reason: 'timeout' };
        branchDetails = { status: 'unknown', reason: 'timeout' };
      } else {
        // Projects are deliberately serial. Only the two bounded reads for one
        // project may overlap, and both share the observation-wide deadline.
        [branchCount, branchDetails] = await Promise.all([
          observeBranchCount(project.id, apiKey, signal, fetchImpl),
          observeBranchDetails(project.id, apiKey, signal, fetchImpl),
        ]);
      }

      projects.push({
        id: project.id,
        name: project.name,
        regionId: project.region_id,
        pgVersion: project.pg_version,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        effectivePermission: 'VIEWER',
        branchCount,
        branchDetails,
      });
    }

    const projectsTruncated = hasNextPage(discovery.pagination);
    const unavailableProjectCount = discovery.unavailable_project_ids.length;
    const partial =
      projectsTruncated ||
      unavailableProjectCount > 0 ||
      projects.some(
        (project) =>
          project.branchCount.status === 'unknown' ||
          project.branchDetails.status === 'unknown' ||
          project.branchDetails.truncated,
      );

    if (partial) {
      return validateObservation({
        observedAt,
        status: 'partial',
        projectsTruncated,
        unavailableProjectCount,
        projects,
      });
    }

    return validateObservation({
      observedAt,
      status: 'available',
      projectsTruncated,
      unavailableProjectCount,
      projects,
    });
  });
}

async function observeBranchCount(
  projectId: string,
  apiKey: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<BranchCount> {
  const url = projectUrl(projectId, '/branches/count');
  const response = await getJson(url, apiKey, signal, fetchImpl);
  if (!response.ok) return { status: 'unknown', reason: response.reason };

  const parsed = branchCountResponse.safeParse(response.value);
  if (!parsed.success) return { status: 'unknown', reason: 'invalid_response' };
  return { status: 'available', count: parsed.data.count };
}

async function observeBranchDetails(
  projectId: string,
  apiKey: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<BranchDetails> {
  const url = projectUrl(projectId, '/branches');
  url.searchParams.set('sort_by', 'updated_at');
  url.searchParams.set('sort_order', 'desc');
  url.searchParams.set('include_deleted', 'false');
  url.searchParams.set('limit', String(BRANCH_LIMIT));

  const response = await getJson(url, apiKey, signal, fetchImpl);
  if (!response.ok) return { status: 'unknown', reason: response.reason };

  const parsed = branchListResponse.safeParse(response.value);
  if (!parsed.success) return { status: 'unknown', reason: 'invalid_response' };
  if (parsed.data.branches.some((branch) => branch.project_id !== projectId)) {
    return { status: 'unknown', reason: 'invalid_response' };
  }

  return {
    status: 'available',
    truncated: hasNextPage(parsed.data.pagination),
    branches: parsed.data.branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      parentId: branch.parent_id ?? null,
      currentState: branch.current_state,
      default: branch.default,
      protected: branch.protected,
      createdAt: branch.created_at,
      updatedAt: branch.updated_at,
    })),
  };
}

function projectUrl(projectId: string, suffix: string): URL {
  return new URL(`${NEON_API_ROOT}/projects/${encodeURIComponent(projectId)}${suffix}`);
}

async function getJson(
  url: URL,
  apiKey: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<ProviderResult<unknown>> {
  const response = await requestProviderJson(url, {
    method: 'GET',
    apiToken: apiKey,
    signal,
    fetchImpl,
    reasonForStatus,
  });
  return response.ok ? { ok: true, value: response.body } : response;
}

function reasonForStatus(status: number): InventoryReason {
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  return 'provider_unavailable';
}

function hasNextPage(value: z.infer<typeof pagination>): boolean {
  return Boolean(value.cursor?.trim() || value.next?.trim());
}

function validateObservation(observation: unknown): NeonInventoryObservation {
  return operations.neonInventoryObservation.parse(observation);
}
