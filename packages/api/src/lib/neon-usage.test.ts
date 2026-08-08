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

import { observeAdminNeonUsage } from './neon-usage.js';

const NOW = new Date('2026-08-08T08:00:00.000Z');
const API_ORIGIN = 'https://console.neon.tech';
const API_ROOT = '/api/v2';
const ORGANIZATION_ID = 'org-harpa-pro';
const API_KEY = 'explicit-viewer-key';
const PERIOD_START = '2026-08-01T00:00:00.000Z';
const PERIOD_END = '2026-09-01T00:00:00.000Z';
const CAVEATS = [
  'provider_values_may_lag',
  'free_plan_published_reference',
  'storage_uses_published_reference',
  'transfer_requires_complete_project_coverage',
  'not_invoice_or_credit_balance',
  'published_allowances_can_change',
] as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function malformedJson(status = 200): Response {
  return new Response('{not-json', {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function urlOf(input: string | URL | Request): URL {
  return new URL(input instanceof Request ? input.url : input.toString());
}

function fetchMock(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn<typeof fetch>((input, init) => Promise.resolve(handler(urlOf(input), init)));
}

function options(fetchImpl: typeof fetch) {
  return {
    apiKey: API_KEY,
    orgId: ORGANIZATION_ID,
    fetchImpl,
    now: () => NOW,
  };
}

function organization(plan: unknown = 'free', id = ORGANIZATION_ID) {
  return {
    id,
    name: 'Private organization name',
    handle: 'private-organization-handle',
    plan,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-08-08T07:59:00.000Z',
    managed_by: 'console',
    members: [{ email: 'private-member@example.com' }],
  };
}

function projectSummary(
  index = 0,
  permission: unknown = 'VIEWER',
  organizationId = ORGANIZATION_ID,
) {
  return {
    id: `project-${index}`,
    name: `Project ${index}`,
    org_id: organizationId,
    effective_project_permission: permission,
    active_time: 1,
    platform_id: 'aws',
    region_id: 'aws-eu-central-1',
    pg_version: 17,
    proxy_host: `private-project-${index}.neon.tech`,
    branch_logical_size_limit: 512,
    branch_logical_size_limit_bytes: 536_870_912,
    provisioner: 'k8s-neonvm',
    store_passwords: true,
    cpu_used_sec: 1,
    creation_source: 'console',
    created_at: '2026-07-01T09:00:00.000Z',
    updated_at: '2026-08-08T07:59:00.000Z',
    owner_id: `private-owner-${index}`,
    settings: { allowed_ips: ['private-ip'] },
  };
}

function projectDetail(index = 0, overrides: Record<string, unknown> = {}) {
  return {
    project: {
      ...projectSummary(index),
      active_time_seconds: 2,
      compute_time_seconds: 90_000,
      written_data_bytes: 3,
      data_transfer_bytes: 1_250_000_000,
      data_storage_bytes_hour: 4,
      synthetic_storage_size: 125_000_000,
      consumption_period_start: PERIOD_START,
      consumption_period_end: PERIOD_END,
      owner: {
        name: 'Private owner',
        email: `private-owner-${index}@example.com`,
      },
      connection_uri: `postgres://private:password@project-${index}.neon.tech/database`,
      endpoints: [{ host: `private-endpoint-${index}.neon.tech` }],
      ...overrides,
    },
  };
}

function projectList(
  projects: unknown[],
  {
    unavailableProjectIds = [],
    pagination = {},
  }: { unavailableProjectIds?: string[]; pagination?: Record<string, unknown> } = {},
) {
  return {
    projects,
    unavailable_project_ids: unavailableProjectIds,
    pagination,
    applications: { 'project-0': ['private-application'] },
    integrations: { 'project-0': ['private-integration'] },
  };
}

function providerFetch(projectCount = 1) {
  return fetchMock((url) => {
    if (url.pathname === `${API_ROOT}/organizations/${ORGANIZATION_ID}`) {
      return json(organization());
    }
    if (url.pathname === `${API_ROOT}/projects`) {
      return json(
        projectList(Array.from({ length: projectCount }, (_, index) => projectSummary(index))),
      );
    }

    const projectId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
    const index = Number(projectId.replace('project-', ''));
    return json(projectDetail(index));
  });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('observeAdminNeonUsage', () => {
  it('returns not_configured without making a provider request when either credential is absent', async () => {
    for (const configuration of [
      { apiKey: '', orgId: ORGANIZATION_ID },
      { apiKey: API_KEY, orgId: '' },
      { apiKey: '   ', orgId: ORGANIZATION_ID },
      { apiKey: API_KEY, orgId: '   ' },
    ]) {
      const fetchImpl = vi.fn<typeof fetch>();

      await expect(
        observeAdminNeonUsage({ ...configuration, fetchImpl, now: () => NOW }),
      ).resolves.toEqual({
        observedAt: NOW.toISOString(),
        status: 'unknown',
        reason: 'not_configured',
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('uses env and global-fetch defaults for the exact serial GET plan and redacts provider-only fields', async () => {
    const fetchImpl = providerFetch(2);
    vi.stubGlobal('fetch', fetchImpl);

    const result = await observeAdminNeonUsage({ now: () => NOW });

    expect(result).toEqual({
      observedAt: NOW.toISOString(),
      status: 'available',
      organizationId: ORGANIZATION_ID,
      plan: 'free',
      projectsTruncated: false,
      unavailableProjectCount: 0,
      projects: [
        {
          id: 'project-0',
          name: 'Project 0',
          status: 'available',
          effectivePermission: 'VIEWER',
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          compute: {
            used: 90_000,
            allowance: 360_000,
            unit: 'cu_seconds',
          },
          storage: {
            used: 125_000_000,
            allowance: 500_000_000,
            unit: 'bytes',
          },
          transferBytes: 1_250_000_000,
        },
        {
          id: 'project-1',
          name: 'Project 1',
          status: 'available',
          effectivePermission: 'VIEWER',
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          compute: {
            used: 90_000,
            allowance: 360_000,
            unit: 'cu_seconds',
          },
          storage: {
            used: 125_000_000,
            allowance: 500_000_000,
            unit: 'bytes',
          },
          transferBytes: 1_250_000_000,
        },
      ],
      organizationTransfer: {
        status: 'available',
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        used: 2_500_000_000,
        allowance: 5_000_000_000,
        unit: 'bytes',
      },
      caveats: CAVEATS,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const calls = fetchImpl.mock.calls.map(([input, init]) => ({ url: urlOf(input), init }));
    expect(calls.map(({ url }) => url.toString())).toEqual([
      `${API_ORIGIN}${API_ROOT}/organizations/${ORGANIZATION_ID}`,
      `${API_ORIGIN}${API_ROOT}/projects?org_id=${ORGANIZATION_ID}&limit=20&timeout=5000`,
      `${API_ORIGIN}${API_ROOT}/projects/project-0`,
      `${API_ORIGIN}${API_ROOT}/projects/project-1`,
    ]);
    const sharedSignal = calls[0]?.init?.signal;
    expect(sharedSignal).toBeInstanceOf(AbortSignal);
    for (const { url, init } of calls) {
      expect(url.origin).toBe(API_ORIGIN);
      expect(init?.method).toBe('GET');
      expect(init?.redirect).toBe('error');
      expect(init?.body).toBeUndefined();
      expect(init?.signal).toBe(sharedSignal);
      expect(new Headers(init?.headers).get('accept')).toBe('application/json');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer default-viewer-key');
    }
    expect(JSON.stringify(result)).not.toMatch(
      /default-viewer-key|Private organization|private-organization|private-member|private-owner|private-project|private-ip|private-application|private-integration|private-endpoint|postgres:/,
    );
  });

  it('keeps a complete empty discovery available without fabricating a transfer period', async () => {
    const fetchImpl = providerFetch(0);

    await expect(observeAdminNeonUsage(options(fetchImpl))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'available',
      organizationId: ORGANIZATION_ID,
      plan: 'free',
      projectsTruncated: false,
      unavailableProjectCount: 0,
      projects: [],
      organizationTransfer: { status: 'unknown', reason: 'no_projects' },
      caveats: CAVEATS,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['launch', 'unsupported_plan'],
    ['scale', 'unsupported_plan'],
    ['FREE', 'unsupported_plan'],
    [undefined, 'invalid_response'],
    [7, 'invalid_response'],
  ] as const)(
    'fails closed on organization plan %s before project discovery',
    async (plan, reason) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(organization(plan)));

      await expect(observeAdminNeonUsage(options(fetchImpl))).resolves.toEqual({
        observedAt: NOW.toISOString(),
        status: 'unknown',
        reason,
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
    },
  );

  it('rejects a mismatched organization response before project discovery', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(organization('free', 'org-different')));

    await expect(observeAdminNeonUsage(options(fetchImpl))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'invalid_response',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    ['EDITOR', ORGANIZATION_ID],
    ['ADMIN', ORGANIZATION_ID],
    [undefined, ORGANIZATION_ID],
    ['VIEWER', 'org-different'],
  ] as const)(
    'fails closed on project permission %s and organization %s before any detail call',
    async (permission, organizationId) => {
      const summaries = [projectSummary(0), projectSummary(1, permission, organizationId)];
      const fetchImpl = fetchMock((url) => {
        if (url.pathname.includes('/organizations/')) return json(organization());
        return json(projectList(summaries));
      });

      await expect(observeAdminNeonUsage(options(fetchImpl))).resolves.toEqual({
        observedAt: NOW.toISOString(),
        status: 'unknown',
        reason: 'unsafe_permissions',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(fetchImpl.mock.calls.map(([input]) => urlOf(input).pathname)).toEqual([
        `${API_ROOT}/organizations/${ORGANIZATION_ID}`,
        `${API_ROOT}/projects`,
      ]);
    },
  );

  it('processes project details serially in provider order', async () => {
    const firstDetail = deferredResponse();
    const paths: string[] = [];
    const fetchImpl = fetchMock((url) => {
      paths.push(url.pathname);
      if (url.pathname.includes('/organizations/')) return json(organization());
      if (url.pathname === `${API_ROOT}/projects`) {
        return json(projectList([projectSummary(0), projectSummary(1)]));
      }
      if (url.pathname.endsWith('/project-0')) return firstDetail.promise;
      return json(projectDetail(1));
    });

    const observation = observeAdminNeonUsage(options(fetchImpl));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3));
    expect(paths).toEqual([
      `${API_ROOT}/organizations/${ORGANIZATION_ID}`,
      `${API_ROOT}/projects`,
      `${API_ROOT}/projects/project-0`,
    ]);

    firstDetail.resolve(json(projectDetail(0)));

    await expect(observation).resolves.toMatchObject({
      status: 'available',
      projects: [{ id: 'project-0' }, { id: 'project-1' }],
    });
    expect(paths).toEqual([
      `${API_ROOT}/organizations/${ORGANIZATION_ID}`,
      `${API_ROOT}/projects`,
      `${API_ROOT}/projects/project-0`,
      `${API_ROOT}/projects/project-1`,
    ]);
  });

  it('caps an observation at 22 requests and does not follow a project cursor', async () => {
    const summaries = Array.from({ length: 20 }, (_, index) => projectSummary(index));
    const fetchImpl = fetchMock((url) => {
      if (url.pathname.includes('/organizations/')) return json(organization());
      if (url.pathname === `${API_ROOT}/projects`) {
        return json(projectList(summaries, { pagination: { cursor: 'private-next-page' } }));
      }
      const index = Number(url.pathname.split('/').at(-1)?.replace('project-', ''));
      return json(projectDetail(index, { data_transfer_bytes: index }));
    });

    const result = await observeAdminNeonUsage(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'partial',
      projectsTruncated: true,
      unavailableProjectCount: 0,
      organizationTransfer: { status: 'unknown', reason: 'incomplete_project_coverage' },
    });
    if (result.status === 'unknown') throw new Error('expected bounded project usage');
    expect(result.projects).toHaveLength(20);
    expect(fetchImpl).toHaveBeenCalledTimes(22);
    expect(
      fetchImpl.mock.calls.filter(([input]) => urlOf(input).pathname === `${API_ROOT}/projects`),
    ).toHaveLength(1);
    expect(fetchImpl.mock.calls.some(([input]) => urlOf(input).searchParams.has('cursor'))).toBe(
      false,
    );
    expect(JSON.stringify(result)).not.toContain('private-next-page');
  });

  it.each([
    [401, 'forbidden'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [408, 'timeout'],
    [504, 'timeout'],
    [429, 'rate_limited'],
    [500, 'provider_unavailable'],
  ] as const)(
    'maps organization HTTP %i to %s, redacts the body, and does not retry',
    async (status, reason) => {
      const providerSecret = `private-provider-body-${status}-${API_KEY}`;
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ message: providerSecret }, status));

      const result = await observeAdminNeonUsage(options(fetchImpl));

      expect(result).toEqual({ observedAt: NOW.toISOString(), status: 'unknown', reason });
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(JSON.stringify(result)).not.toContain(providerSecret);
      expect(JSON.stringify(result)).not.toContain(API_KEY);
    },
  );

  it.each([
    [401, 'forbidden'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [408, 'timeout'],
    [504, 'timeout'],
    [429, 'rate_limited'],
    [500, 'provider_unavailable'],
  ] as const)(
    'maps project-list HTTP %i to %s after exactly two calls without retrying',
    async (status, reason) => {
      const providerSecret = `private-project-list-body-${status}-${API_KEY}`;
      const fetchImpl = fetchMock((url) => {
        if (url.pathname.includes('/organizations/')) return json(organization());
        return json({ message: providerSecret }, status);
      });

      const result = await observeAdminNeonUsage(options(fetchImpl));

      expect(result).toEqual({ observedAt: NOW.toISOString(), status: 'unknown', reason });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(fetchImpl.mock.calls.map(([input]) => urlOf(input).pathname)).toEqual([
        `${API_ROOT}/organizations/${ORGANIZATION_ID}`,
        `${API_ROOT}/projects`,
      ]);
      expect(JSON.stringify(result)).not.toContain(providerSecret);
      expect(JSON.stringify(result)).not.toContain(API_KEY);
    },
  );

  it('maps malformed, network, and aborted project-list failures without retry or disclosure', async () => {
    const failures = [
      {
        label: 'malformed JSON',
        reason: 'invalid_response',
        response: (secret: string) =>
          Promise.resolve(
            new Response(`{not-json-${secret}`, {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          ),
      },
      {
        label: 'network rejection',
        reason: 'provider_unavailable',
        response: (secret: string) => Promise.reject(new Error(secret)),
      },
      {
        label: 'abort rejection',
        reason: 'timeout',
        response: (secret: string) =>
          Promise.reject(Object.assign(new Error(secret), { name: 'AbortError' })),
      },
    ] as const;

    for (const failure of failures) {
      const providerSecret = `private-${failure.label}-${API_KEY}`;
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json(organization()))
        .mockImplementationOnce(() => failure.response(providerSecret));

      const result = await observeAdminNeonUsage(options(fetchImpl));

      expect(result).toEqual({
        observedAt: NOW.toISOString(),
        status: 'unknown',
        reason: failure.reason,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(fetchImpl.mock.calls.map(([input]) => urlOf(input).pathname)).toEqual([
        `${API_ROOT}/organizations/${ORGANIZATION_ID}`,
        `${API_ROOT}/projects`,
      ]);
      expect(JSON.stringify(result)).not.toContain(providerSecret);
      expect(JSON.stringify(result)).not.toContain(API_KEY);
    }
  });

  it('maps malformed JSON and network failures without exposing errors or retrying', async () => {
    const malformedFetch = vi.fn<typeof fetch>().mockResolvedValue(malformedJson());
    await expect(observeAdminNeonUsage(options(malformedFetch))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'invalid_response',
    });
    expect(malformedFetch).toHaveBeenCalledOnce();

    const networkFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(`private provider error ${API_KEY}`));
    const networkResult = await observeAdminNeonUsage(options(networkFetch));
    expect(networkResult).toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'provider_unavailable',
    });
    expect(networkFetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(networkResult)).not.toContain(API_KEY);
  });

  it.each([
    ['malformed projects', { projects: 'not-an-array' }],
    [
      'more than the fixed project limit',
      projectList(Array.from({ length: 21 }, (_, index) => projectSummary(index))),
    ],
    ['duplicate project IDs', projectList([projectSummary(0), projectSummary(0)])],
  ] as const)('rejects %s before any detail call', async (_label, discovery) => {
    const fetchImpl = fetchMock((url) => {
      if (url.pathname.includes('/organizations/')) return json(organization());
      return json(discovery);
    });

    await expect(observeAdminNeonUsage(options(fetchImpl))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'invalid_response',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a mismatched project ID', { id: 'project-different' }],
    ['a mismatched organization ID', { org_id: 'org-different' }],
    ['negative compute usage', { compute_time_seconds: -1 }],
    ['unsafe storage usage', { synthetic_storage_size: Number.MAX_SAFE_INTEGER + 1 }],
    ['fractional transfer usage', { data_transfer_bytes: 0.5 }],
    ['missing storage usage', { synthetic_storage_size: undefined }],
    ['an invalid period timestamp', { consumption_period_start: 'not-a-date' }],
    [
      'a reversed consumption period',
      { consumption_period_start: PERIOD_END, consumption_period_end: PERIOD_START },
    ],
  ] as const)(
    'marks project detail with %s invalid and redacts its raw fields',
    async (_label, bad) => {
      const providerSecret = `private-detail-${API_KEY}`;
      const fetchImpl = fetchMock((url) => {
        if (url.pathname.includes('/organizations/')) return json(organization());
        if (url.pathname === `${API_ROOT}/projects`) {
          return json(projectList([projectSummary()]));
        }
        return json(projectDetail(0, { ...bad, provider_secret: providerSecret }));
      });

      const result = await observeAdminNeonUsage(options(fetchImpl));

      expect(result).toMatchObject({
        status: 'partial',
        projectsTruncated: false,
        unavailableProjectCount: 0,
        projects: [
          {
            id: 'project-0',
            name: 'Project 0',
            status: 'unknown',
            effectivePermission: 'VIEWER',
            reason: 'invalid_response',
          },
        ],
        organizationTransfer: { status: 'unknown', reason: 'incomplete_project_coverage' },
        caveats: CAVEATS,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(JSON.stringify(result)).not.toContain(providerSecret);
      expect(JSON.stringify(result)).not.toContain(API_KEY);
    },
  );

  it.each([
    [401, 'forbidden'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [408, 'timeout'],
    [504, 'timeout'],
    [429, 'rate_limited'],
    [500, 'provider_unavailable'],
  ] as const)(
    'keeps the project row but maps detail HTTP %i to %s without retrying',
    async (status, reason) => {
      const providerSecret = `private-detail-body-${status}-${API_KEY}`;
      const fetchImpl = fetchMock((url) => {
        if (url.pathname.includes('/organizations/')) return json(organization());
        if (url.pathname === `${API_ROOT}/projects`) {
          return json(projectList([projectSummary()]));
        }
        return json({ message: providerSecret }, status);
      });

      const result = await observeAdminNeonUsage(options(fetchImpl));

      expect(result).toMatchObject({
        status: 'partial',
        projects: [
          {
            id: 'project-0',
            name: 'Project 0',
            status: 'unknown',
            effectivePermission: 'VIEWER',
            reason,
          },
        ],
        organizationTransfer: { status: 'unknown', reason: 'incomplete_project_coverage' },
      });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(JSON.stringify(result)).not.toContain(providerSecret);
      expect(JSON.stringify(result)).not.toContain(API_KEY);
    },
  );

  it('maps malformed and rejected project details to finite redacted reasons', async () => {
    const responses: Array<Response | Error> = [
      malformedJson(),
      new Error(`private detail network failure ${API_KEY}`),
    ];

    for (const response of responses) {
      const fetchImpl = fetchMock((url) => {
        if (url.pathname.includes('/organizations/')) return json(organization());
        if (url.pathname === `${API_ROOT}/projects`) {
          return json(projectList([projectSummary()]));
        }
        if (response instanceof Error) throw response;
        return response;
      });

      const result = await observeAdminNeonUsage(options(fetchImpl));
      const reason = response instanceof Error ? 'provider_unavailable' : 'invalid_response';
      expect(result).toMatchObject({
        status: 'partial',
        projects: [{ id: 'project-0', status: 'unknown', effectivePermission: 'VIEWER', reason }],
        organizationTransfer: { status: 'unknown', reason: 'incomplete_project_coverage' },
      });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(JSON.stringify(result)).not.toContain(API_KEY);
    }
  });

  it('marks transfer incomplete on pagination and unavailable projects without exposing their IDs', async () => {
    const unavailableId = 'unavailable-private-project';
    const fetchImpl = fetchMock((url) => {
      if (url.pathname.includes('/organizations/')) return json(organization());
      if (url.pathname === `${API_ROOT}/projects`) {
        return json(
          projectList([projectSummary()], {
            unavailableProjectIds: [unavailableId],
            pagination: { cursor: 'private-cursor' },
          }),
        );
      }
      return json(projectDetail());
    });

    const result = await observeAdminNeonUsage(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'partial',
      projectsTruncated: true,
      unavailableProjectCount: 1,
      projects: [{ id: 'project-0', status: 'available', effectivePermission: 'VIEWER' }],
      organizationTransfer: { status: 'unknown', reason: 'incomplete_project_coverage' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result)).not.toContain(unavailableId);
    expect(JSON.stringify(result)).not.toContain('private-cursor');
  });

  it('keeps valid per-project usage but withholds an organization sum when periods differ', async () => {
    const fetchImpl = fetchMock((url) => {
      if (url.pathname.includes('/organizations/')) return json(organization());
      if (url.pathname === `${API_ROOT}/projects`) {
        return json(projectList([projectSummary(0), projectSummary(1)]));
      }
      if (url.pathname.endsWith('/project-0')) return json(projectDetail(0));
      return json(
        projectDetail(1, {
          consumption_period_start: '2026-07-01T00:00:00.000Z',
          consumption_period_end: PERIOD_START,
        }),
      );
    });

    const result = await observeAdminNeonUsage(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'partial',
      projects: [
        {
          id: 'project-0',
          status: 'available',
          effectivePermission: 'VIEWER',
          periodStart: PERIOD_START,
        },
        {
          id: 'project-1',
          status: 'available',
          effectivePermission: 'VIEWER',
          periodStart: '2026-07-01T00:00:00.000Z',
        },
      ],
      organizationTransfer: { status: 'unknown', reason: 'period_mismatch' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it.each([
    {
      label: 'incomplete coverage over period mismatch and overflow',
      pagination: { cursor: 'private-priority-cursor' },
      secondPeriod: {
        consumption_period_start: '2026-07-01T00:00:00.000Z',
        consumption_period_end: PERIOD_START,
      },
      reason: 'incomplete_project_coverage',
    },
    {
      label: 'period mismatch over overflow when coverage is complete',
      pagination: {},
      secondPeriod: {
        consumption_period_start: '2026-07-01T00:00:00.000Z',
        consumption_period_end: PERIOD_START,
      },
      reason: 'period_mismatch',
    },
  ] as const)('prioritizes $label', async ({ pagination, secondPeriod, reason }) => {
    const fetchImpl = fetchMock((url) => {
      if (url.pathname.includes('/organizations/')) return json(organization());
      if (url.pathname === `${API_ROOT}/projects`) {
        return json(
          projectList([projectSummary(0), projectSummary(1)], {
            pagination,
          }),
        );
      }
      if (url.pathname.endsWith('/project-0')) {
        return json(projectDetail(0, { data_transfer_bytes: Number.MAX_SAFE_INTEGER }));
      }
      return json(projectDetail(1, { ...secondPeriod, data_transfer_bytes: 1 }));
    });

    const result = await observeAdminNeonUsage(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'partial',
      projects: [
        { id: 'project-0', status: 'available', effectivePermission: 'VIEWER' },
        { id: 'project-1', status: 'available', effectivePermission: 'VIEWER' },
      ],
      organizationTransfer: { status: 'unknown', reason },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(result)).not.toContain('private-priority-cursor');
  });

  it('accepts an exact safe transfer sum and rejects only an overflowing organization sum', async () => {
    function transferFetch(first: number, second: number) {
      return fetchMock((url) => {
        if (url.pathname.includes('/organizations/')) return json(organization());
        if (url.pathname === `${API_ROOT}/projects`) {
          return json(projectList([projectSummary(0), projectSummary(1)]));
        }
        const index = url.pathname.endsWith('/project-0') ? 0 : 1;
        return json(
          projectDetail(index, {
            data_transfer_bytes: index === 0 ? first : second,
          }),
        );
      });
    }

    const safeFetch = transferFetch(Number.MAX_SAFE_INTEGER - 1, 1);
    const safeResult = await observeAdminNeonUsage(options(safeFetch));
    expect(safeResult).toMatchObject({
      status: 'available',
      organizationTransfer: {
        status: 'available',
        used: Number.MAX_SAFE_INTEGER,
        allowance: 5_000_000_000,
        unit: 'bytes',
      },
    });

    const overflowFetch = transferFetch(Number.MAX_SAFE_INTEGER, 1);
    const overflowResult = await observeAdminNeonUsage(options(overflowFetch));
    expect(overflowResult).toMatchObject({
      status: 'partial',
      projects: [
        { id: 'project-0', status: 'available', effectivePermission: 'VIEWER' },
        { id: 'project-1', status: 'available', effectivePermission: 'VIEWER' },
      ],
      organizationTransfer: { status: 'unknown', reason: 'invalid_response' },
    });
    expect(safeFetch).toHaveBeenCalledTimes(4);
    expect(overflowFetch).toHaveBeenCalledTimes(4);
  });

  it('preserves zero and over-reference raw usage without clamping published allowances', async () => {
    const fetchImpl = fetchMock((url) => {
      if (url.pathname.includes('/organizations/')) return json(organization());
      if (url.pathname === `${API_ROOT}/projects`) {
        return json(projectList([projectSummary(0), projectSummary(1)]));
      }
      if (url.pathname.endsWith('/project-0')) {
        return json(
          projectDetail(0, {
            compute_time_seconds: 0,
            synthetic_storage_size: 0,
            data_transfer_bytes: 0,
          }),
        );
      }
      return json(
        projectDetail(1, {
          compute_time_seconds: 720_001,
          synthetic_storage_size: 1_000_000_001,
          data_transfer_bytes: 6_000_000_001,
        }),
      );
    });

    const result = await observeAdminNeonUsage(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'available',
      projects: [
        {
          status: 'available',
          effectivePermission: 'VIEWER',
          compute: { used: 0, allowance: 360_000, unit: 'cu_seconds' },
          storage: { used: 0, allowance: 500_000_000, unit: 'bytes' },
          transferBytes: 0,
        },
        {
          status: 'available',
          effectivePermission: 'VIEWER',
          compute: { used: 720_001, allowance: 360_000, unit: 'cu_seconds' },
          storage: {
            used: 1_000_000_001,
            allowance: 500_000_000,
            unit: 'bytes',
          },
          transferBytes: 6_000_000_001,
        },
      ],
      organizationTransfer: {
        status: 'available',
        used: 6_000_000_001,
        allowance: 5_000_000_000,
        unit: 'bytes',
      },
    });
  });

  it('uses one ten-second abort budget and does not start later details after exhaustion', async () => {
    vi.useFakeTimers();
    const fetchImpl = fetchMock((url, init) => {
      if (url.pathname.includes('/organizations/')) return json(organization());
      if (url.pathname === `${API_ROOT}/projects`) {
        return json(projectList([projectSummary(0), projectSummary(1), projectSummary(2)]));
      }
      if (url.pathname.endsWith('/project-0')) return json(projectDetail(0));
      return new Promise<Response>((_resolve, reject) => {
        const rejectAbort = () =>
          reject(Object.assign(new Error(`private abort ${API_KEY}`), { name: 'AbortError' }));
        if (init?.signal?.aborted) rejectAbort();
        else init?.signal?.addEventListener('abort', rejectAbort, { once: true });
      });
    });
    const settled = vi.fn();
    const observation = observeAdminNeonUsage(options(fetchImpl));
    void observation.then(settled);
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const sharedSignal = fetchImpl.mock.calls[0]?.[1]?.signal;
    expect(sharedSignal).toBeInstanceOf(AbortSignal);
    for (const [, init] of fetchImpl.mock.calls) expect(init?.signal).toBe(sharedSignal);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(observation).resolves.toMatchObject({
      status: 'partial',
      projects: [
        { id: 'project-0', status: 'available', effectivePermission: 'VIEWER' },
        {
          id: 'project-1',
          status: 'unknown',
          effectivePermission: 'VIEWER',
          reason: 'timeout',
        },
        {
          id: 'project-2',
          status: 'unknown',
          effectivePermission: 'VIEWER',
          reason: 'timeout',
        },
      ],
      organizationTransfer: { status: 'unknown', reason: 'incomplete_project_coverage' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls.map(([input]) => urlOf(input).pathname)).not.toContain(
      `${API_ROOT}/projects/project-2`,
    );
    expect(JSON.stringify(await observation)).not.toContain(API_KEY);
  });
});
