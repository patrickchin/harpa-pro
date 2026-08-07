import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../env.js')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      ADMIN_NEON_VIEWER_API_KEY: 'default-viewer-key',
      ADMIN_NEON_ORG_ID: 'org-harpa-pro',
    },
  };
});

import { observeAdminNeonInventory } from './neon-operations.js';

const NOW = new Date('2026-08-08T08:00:00Z');
const ROOT = '/api/v2';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function urlOf(input: string | URL | Request): URL {
  return new URL(input instanceof Request ? input.url : input.toString());
}

function project(index = 0, permission: unknown = 'VIEWER') {
  return {
    id: `project-${index}`,
    name: `Project ${index}`,
    region_id: 'aws-eu-central-1',
    pg_version: 17,
    created_at: '2026-07-01T09:00:00Z',
    updated_at: '2026-08-08T07:59:00Z',
    org_id: 'org-harpa-pro',
    effective_project_permission: permission,
    owner_id: `secret-owner-${index}`,
    proxy_host: `secret-project-${index}.neon.tech`,
    connection_uri: `postgres://secret:password@project-${index}.neon.tech/db`,
  };
}

function branch(index = 0) {
  return {
    id: `branch-${index}`,
    project_id: 'project-0',
    name: index === 0 ? 'main' : `branch-${index}`,
    current_state: 'ready',
    default: index === 0,
    protected: index === 0,
    created_at: '2026-07-02T09:00:00Z',
    updated_at: '2026-08-08T07:58:00Z',
    endpoint_host: `secret-endpoint-${index}.neon.tech`,
    annotations: { secret: true },
  };
}

function fetchMock(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn<typeof fetch>((input, init) => Promise.resolve(handler(urlOf(input), init)));
}

function options(fetchImpl: typeof fetch) {
  return {
    apiKey: 'explicit-viewer-key',
    orgId: 'org-harpa-pro',
    fetchImpl,
    now: () => NOW,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('observeAdminNeonInventory', () => {
  it('returns not_configured without calling Neon when the observer is absent', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      observeAdminNeonInventory({
        apiKey: '',
        orgId: '',
        fetchImpl,
        now: () => NOW,
      }),
    ).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'not_configured',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses env/global-fetch defaults for bounded GETs and returns only allowlisted fields', async () => {
    const fetchImpl = fetchMock((url) => {
      if (url.pathname === `${ROOT}/projects`) {
        return json({ projects: [project()], unavailable_project_ids: [], pagination: {} });
      }
      if (url.pathname.endsWith('/branches/count')) return json({ count: 1 });
      return json({
        branches: [branch()],
        pagination: {},
        annotations: { 'branch-0': { secret: 'provider-annotation' } },
      });
    });
    vi.stubGlobal('fetch', fetchImpl);

    const result = await observeAdminNeonInventory({ now: () => NOW });

    expect(result).toMatchObject({
      observedAt: NOW.toISOString(),
      status: 'available',
      projectsTruncated: false,
      unavailableProjectCount: 0,
      projects: [
        {
          id: 'project-0',
          effectivePermission: 'VIEWER',
          branchCount: { status: 'available', count: 1 },
          branchDetails: {
            status: 'available',
            truncated: false,
            branches: [{ id: 'branch-0', parentId: null }],
          },
        },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const calls = fetchImpl.mock.calls.map(([input, init]) => ({ url: urlOf(input), init }));
    const projects = calls.find(({ url }) => url.pathname === `${ROOT}/projects`)!;
    expect(projects.url.origin).toBe('https://console.neon.tech');
    expect(Object.fromEntries(projects.url.searchParams)).toMatchObject({
      org_id: 'org-harpa-pro',
      limit: '20',
      timeout: '5000',
    });
    const branches = calls.find(({ url }) => url.pathname.endsWith('/branches'))!;
    expect(Object.fromEntries(branches.url.searchParams)).toMatchObject({
      limit: '100',
      include_deleted: 'false',
    });
    for (const { init } of calls) {
      expect(init?.method).toBe('GET');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer default-viewer-key');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(JSON.stringify(result)).not.toMatch(
      /default-viewer-key|secret-owner|secret-project|secret-endpoint|provider-annotation/,
    );
  });

  it.each(['EDITOR', 'ADMIN', undefined] as const)(
    'fails closed on effective permission %s before branch discovery',
    async (permission) => {
      const unsafeProject = project(0, permission);
      if (permission === undefined) delete unsafeProject.effective_project_permission;
      const fetchImpl = fetchMock(() =>
        json({ projects: [unsafeProject], unavailable_project_ids: [], pagination: {} }),
      );

      await expect(observeAdminNeonInventory(options(fetchImpl))).resolves.toEqual({
        observedAt: NOW.toISOString(),
        status: 'unknown',
        reason: 'unsafe_permissions',
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(urlOf(fetchImpl.mock.calls[0]![0]).pathname).toBe(`${ROOT}/projects`);
    },
  );

  it('fails closed when a returned project belongs to another organization', async () => {
    const otherOrganization = { ...project(), org_id: 'org-other' };
    const fetchImpl = fetchMock(() =>
      json({ projects: [otherOrganization], unavailable_project_ids: [], pagination: {} }),
    );

    await expect(observeAdminNeonInventory(options(fetchImpl))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'unsafe_permissions',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('keeps verified project data when one branch call fails, without leaking or retrying', async () => {
    const providerSecret = 'postgres://secret:password@private.neon.tech/database';
    const fetchImpl = fetchMock((url) => {
      if (url.pathname === `${ROOT}/projects`) {
        return json({
          projects: [project()],
          unavailable_project_ids: ['timed-out-project'],
          pagination: {},
        });
      }
      if (url.pathname.endsWith('/branches/count')) {
        return json({ message: providerSecret }, 503);
      }
      return json({ branches: [branch()], pagination: {} });
    });

    const result = await observeAdminNeonInventory(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'partial',
      unavailableProjectCount: 1,
      projects: [
        {
          id: 'project-0',
          branchCount: { status: 'unknown', reason: 'provider_unavailable' },
          branchDetails: { status: 'available', branches: [{ id: 'branch-0' }] },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(providerSecret);
    expect(
      fetchImpl.mock.calls.filter(([input]) => urlOf(input).pathname.endsWith('/branches/count')),
    ).toHaveLength(1);
  });

  it('maps an aborted provider request to timeout without retrying', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(
        Object.assign(new Error('provider request aborted'), { name: 'AbortError' }),
      );

    await expect(observeAdminNeonInventory(options(fetchImpl))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'timeout',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps a top-level provider rate limit without returning its response body', async () => {
    const providerSecret = 'raw provider detail with explicit-viewer-key';
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ message: providerSecret }, 429));

    const result = await observeAdminNeonInventory(options(fetchImpl));

    expect(result).toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'rate_limited',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain(providerSecret);
  });

  it('caps one observation at 20 projects and 100 branch details', async () => {
    const projects = Array.from({ length: 20 }, (_, index) => project(index));
    const hundredBranches = Array.from({ length: 100 }, (_, index) => branch(index));
    const fetchImpl = fetchMock((url) => {
      if (url.pathname === `${ROOT}/projects`) {
        return json({
          projects,
          unavailable_project_ids: [],
          pagination: { cursor: 'more-projects' },
        });
      }
      if (url.pathname.endsWith('/branches/count')) return json({ count: 137 });
      const firstProject = url.pathname.includes('/project-0/');
      return json({
        branches: firstProject ? hundredBranches : [],
        pagination: firstProject ? { next: 'more-branches' } : {},
      });
    });

    const result = await observeAdminNeonInventory(options(fetchImpl));

    expect(result).toMatchObject({ status: 'partial', projectsTruncated: true });
    if (result.status === 'unknown') throw new Error('expected project inventory');
    expect(result.projects).toHaveLength(20);
    expect(result.projects[0]?.branchCount).toEqual({ status: 'available', count: 137 });
    const details = result.projects[0]?.branchDetails;
    if (details?.status !== 'available') throw new Error('expected branch details');
    expect(details).toMatchObject({ truncated: true });
    expect(details.branches).toHaveLength(100);
    expect(fetchImpl).toHaveBeenCalledTimes(41);
  });
});
