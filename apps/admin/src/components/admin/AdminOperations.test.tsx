// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../../lib/admin-auth', () => ({
  adminAuthClient: authMock,
}));

vi.mock('../../lib/env', () => ({
  getPublicEnv: () => ({ apiBaseUrl: 'https://api.example.test' }),
}));

import AdminOperations from './AdminOperations';

const adminSession = {
  authenticated: true as const,
  email: 'admin@harpapro.com',
  csrfToken: 'csrf-current-admin-session-token',
};

const observedAt = '2026-08-08T05:30:00.000Z';
const resetAt = '2026-09-01T00:00:00.000Z';
const apiGitCommit = '1111111111111111111111111111111111111111';
const adminPagesCommit = '2222222222222222222222222222222222222222';
const productMigrationHead = '0028_report_version_monotonic.sql';
const adminMigrationHead = '0002_admin_rate_limit_buckets.sql';

const apiIdentity = {
  ok: true as const,
  service: 'api' as const,
  version: '0.1.65',
  gitCommit: apiGitCommit,
  buildTime: '2026-08-08T04:45:00.000Z',
};

const productReadiness = {
  ok: true as const,
  db: 'up' as const,
  head: productMigrationHead,
};

const adminReadiness = {
  ok: true as const,
  db: 'up' as const,
  head: adminMigrationHead,
};

const adminPagesMarker = {
  commit: adminPagesCommit,
  branch: 'codex/admin-deployment-identity',
};

const passDiagnostic = {
  observedAt,
  status: 'pass' as const,
  durationMs: 1_842,
  target: {
    accountEmail: 'report-canary@e2e.harpapro.com',
    projectId: 'prj_01234567',
    reportId: 'rpt_01234567',
    reportNumber: 42,
  },
  generation: {
    httpStatus: 200,
    requestId: 'req-report-canary-1',
    durationMs: 1_300,
    requestedAt: '2026-08-08T05:29:58.000Z',
    finishedAt: '2026-08-08T05:29:59.300Z',
    reportUpdatedAt: '2026-08-08T05:29:59.500Z',
    generatedAt: '2026-08-08T05:29:59.300Z',
    vendor: 'openai',
    model: 'gpt-5.1',
    fixtureMode: 'live' as const,
    idempotentReplay: false,
  },
  limits: {
    plan: 'free' as const,
    reportGenerate: {
      limit: 10,
      used: 2,
      remaining: 8,
      resetAt,
      overridden: false,
    },
    aiInputTokens: {
      limit: 1_000_000,
      used: 125_000,
      remaining: 875_000,
      resetAt,
      overridden: true,
    },
    aiOutputTokens: {
      limit: null,
      used: 4_200,
      remaining: null,
      resetAt,
      overridden: false,
    },
  },
  cleanup: 'succeeded' as const,
};

const unknownDiagnostic = {
  observedAt,
  status: 'unknown' as const,
  reason: 'not_configured' as const,
};

const applicationProject = {
  id: 'prj_application',
  name: 'Application database',
  regionId: 'aws-ap-southeast-1',
  pgVersion: 17,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-08-08T04:00:00.000Z',
  effectivePermission: 'VIEWER' as const,
  branchCount: { status: 'available' as const, count: 147 },
  branchDetails: {
    status: 'available' as const,
    truncated: false,
    branches: [
      {
        id: 'br_main',
        name: 'main',
        parentId: null,
        currentState: 'ready',
        default: true,
        protected: true,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-08-08T04:00:00.000Z',
      },
      {
        id: 'br_dev',
        name: 'dev',
        parentId: 'br_main',
        currentState: 'ready',
        default: false,
        protected: false,
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-08-08T03:00:00.000Z',
      },
    ],
  },
};

const availableInventory = {
  observedAt,
  status: 'available' as const,
  projectsTruncated: false,
  unavailableProjectCount: 0,
  projects: [applicationProject],
};

const emptyInventory = {
  observedAt,
  status: 'available' as const,
  projectsTruncated: false,
  unavailableProjectCount: 0,
  projects: [],
};

const neonUsageCaveats = [
  'provider_values_may_lag',
  'free_plan_published_reference',
  'storage_uses_published_reference',
  'transfer_requires_complete_project_coverage',
  'not_invoice_or_credit_balance',
  'published_allowances_can_change',
] as const;

const availableNeonUsageProject = {
  id: 'tiny-tree-06262558',
  name: 'Application database',
  status: 'available' as const,
  effectivePermission: 'VIEWER' as const,
  periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: resetAt,
  compute: {
    used: 90_000,
    allowance: 360_000 as const,
    unit: 'cu_seconds' as const,
  },
  storage: {
    used: 125_000_000,
    allowance: 500_000_000 as const,
    unit: 'bytes' as const,
  },
  transferBytes: 1_250_000_000,
};

const availableNeonUsage = {
  observedAt,
  status: 'available' as const,
  organizationId: 'org-harpa-pro-12345678',
  plan: 'free' as const,
  projectsTruncated: false,
  unavailableProjectCount: 0,
  projects: [availableNeonUsageProject],
  organizationTransfer: {
    status: 'available' as const,
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: resetAt,
    used: availableNeonUsageProject.transferBytes,
    allowance: 5_000_000_000 as const,
    unit: 'bytes' as const,
  },
  caveats: neonUsageCaveats,
};

const overAllowanceNeonUsage = {
  ...availableNeonUsage,
  projects: [
    {
      ...availableNeonUsageProject,
      compute: {
        ...availableNeonUsageProject.compute,
        used: 400_000,
      },
      storage: {
        ...availableNeonUsageProject.storage,
        used: 600_000_000,
      },
      transferBytes: 6_000_000_000,
    },
  ],
  organizationTransfer: {
    ...availableNeonUsage.organizationTransfer,
    used: 6_000_000_000,
  },
};

const unknownNeonUsage = {
  observedAt,
  status: 'unknown' as const,
  reason: 'not_configured' as const,
};

const emptyNeonUsage = {
  ...availableNeonUsage,
  projects: [],
  organizationTransfer: {
    status: 'unknown' as const,
    reason: 'no_projects' as const,
  },
};

const partialEmptyNeonUsage = {
  ...emptyNeonUsage,
  status: 'partial' as const,
  projectsTruncated: true,
  unavailableProjectCount: 1,
  organizationTransfer: {
    status: 'unknown' as const,
    reason: 'incomplete_project_coverage' as const,
  },
};

const partialNeonUsage = {
  ...availableNeonUsage,
  status: 'partial' as const,
  projects: [
    availableNeonUsageProject,
    {
      id: 'floral-brook-39718990',
      name: 'Admin database',
      status: 'unknown' as const,
      effectivePermission: 'VIEWER' as const,
      reason: 'timeout' as const,
    },
  ],
  organizationTransfer: {
    status: 'unknown' as const,
    reason: 'incomplete_project_coverage' as const,
  },
};

const availableR2Capacity = {
  observedAt,
  status: 'available' as const,
  freeTierReference: {
    storageGbMonth: 10 as const,
    classAOperations: 1_000_000 as const,
    classBOperations: 10_000_000 as const,
    appliesTo: 'standard_only' as const,
  },
  buckets: {
    status: 'available' as const,
    truncated: false,
    items: [
      {
        name: 'harpa-pro',
        jurisdiction: 'default' as const,
        location: 'apac' as const,
        defaultStorageClass: 'standard' as const,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
      {
        name: 'harpa-pro-archive',
        jurisdiction: 'eu' as const,
        location: 'weur' as const,
        defaultStorageClass: 'infrequent_access' as const,
        createdAt: null,
      },
    ],
  },
  storage: {
    status: 'available' as const,
    standard: {
      publishedPayloadBytes: 61_000_000,
      publishedMetadataBytes: 596_713,
      publishedObjects: 138,
      uploadingPayloadBytes: 1_024,
      uploadingMetadataBytes: 128,
      uploadingObjects: 1,
    },
    infrequentAccess: {
      publishedPayloadBytes: 12_000_000,
      publishedMetadataBytes: 120_000,
      publishedObjects: 7,
      uploadingPayloadBytes: 0,
      uploadingMetadataBytes: 0,
      uploadingObjects: 0,
    },
  },
  operations: {
    status: 'available' as const,
    windowStart: '2026-08-01T00:00:00.000Z',
    windowEnd: observedAt,
    classA: {
      estimatedUsed: 125_000,
      publishedAllowance: 1_000_000 as const,
      estimatedRemaining: 875_000,
    },
    classB: {
      estimatedUsed: 4_200_000,
      publishedAllowance: 10_000_000 as const,
      estimatedRemaining: 5_800_000,
    },
    freeRequests: 32_000,
    unclassifiedRequests: 0,
  },
  caveats: [
    'storage_snapshot_not_gb_month',
    'storage_metrics_may_lag',
    'infrequent_access_not_covered_by_free_tier',
    'operations_estimated_from_analytics',
  ] as const,
};

const unknownR2Capacity = {
  observedAt,
  status: 'unknown' as const,
  reason: 'not_configured' as const,
};

const githubCommits = {
  dev: [
    {
      sha: '0d0a841fed2fe44a2233ccf2eb58052672f54932',
      commit: {
        message: 'Merge pull request #305 from patrickchin/codex/rebuild-wrangler-4',
        committer: { date: '2026-08-07T20:00:01Z' },
      },
    },
  ],
  main: [
    {
      sha: '1ca389ac8f28c6cf8fbf0c7f5eca072f8670c129',
      commit: {
        message: 'chore(release): v0.1.65',
        committer: { date: '2026-08-02T03:27:22Z' },
      },
    },
  ],
};

const githubPulls = [
  {
    number: 304,
    title: 'fix(site): fit screenshot dialog in Firefox',
    draft: true,
    updated_at: '2026-08-07T13:21:37Z',
    head: {
      ref: 'codex/fix-firefox-screenshot-dialog',
      sha: '430b00c745173929727666e13d1190de76e433f5',
    },
    base: { ref: 'dev' },
  },
  {
    number: 299,
    title: 'chore(deps): bump the npm_and_yarn group',
    draft: false,
    updated_at: '2026-08-06T22:31:00Z',
    head: {
      ref: 'dependabot/npm_and_yarn/npm_and_yarn-39a367a8a6',
      sha: 'b97f6885e869549568b3a24fa8bff1bdbfaf5042',
    },
    base: { ref: 'main' },
  },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function githubJson(body: unknown, remaining: number): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': '60',
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': '1786140366',
    },
  });
}

function defaultDeploymentResponse(url: string): Response | null {
  if (url === 'https://api.example.test/healthz') return jsonResponse(apiIdentity);
  if (url === 'https://api.example.test/readyz') return jsonResponse(productReadiness);
  if (url === 'https://api.example.test/admin/readyz') return jsonResponse(adminReadiness);
  if (url === '/_cf-pages-deployment.json') return jsonResponse(adminPagesMarker);
  if (url === 'https://api.example.test/admin/operations/neon-usage') {
    return jsonResponse(unknownNeonUsage);
  }
  if (url.includes('/commits?sha=dev&per_page=1')) return githubJson(githubCommits.dev, 59);
  if (url.includes('/commits?sha=main&per_page=1')) return githubJson(githubCommits.main, 58);
  if (url.includes('/pulls?state=open&sort=updated&direction=desc&per_page=30')) {
    return githubJson(githubPulls, 57);
  }
  return null;
}

function mockOperationsFetch(
  inventory: unknown = availableInventory,
  r2Capacity: unknown = availableR2Capacity,
  neonUsage: unknown = availableNeonUsage,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === 'https://api.example.test/admin/operations/neon') {
      return jsonResponse(inventory);
    }
    if (url === 'https://api.example.test/admin/operations/r2-capacity') {
      return jsonResponse(r2Capacity);
    }
    if (url === 'https://api.example.test/admin/operations/neon-usage') {
      return jsonResponse(neonUsage);
    }
    const deploymentResponse = defaultDeploymentResponse(url);
    if (deploymentResponse) return deploymentResponse;
    throw new Error(`Unexpected request: ${url}`);
  });
}

function mockDiagnosticFetch(
  diagnostic: () => Response | Promise<Response>,
  inventory: unknown = availableInventory,
  r2Capacity: unknown = availableR2Capacity,
  neonUsage: unknown = availableNeonUsage,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === 'https://api.example.test/admin/operations/report-generate') {
      return diagnostic();
    }
    if (url === 'https://api.example.test/admin/operations/neon') {
      return jsonResponse(inventory);
    }
    if (url === 'https://api.example.test/admin/operations/r2-capacity') {
      return jsonResponse(r2Capacity);
    }
    if (url === 'https://api.example.test/admin/operations/neon-usage') {
      return jsonResponse(neonUsage);
    }
    const deploymentResponse = defaultDeploymentResponse(url);
    if (deploymentResponse) return deploymentResponse;
    throw new Error(`Unexpected request: ${url}`);
  });
}

function deploymentRequests(fetchMock: MockInstance<typeof globalThis.fetch>, url: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input) === url);
}

function diagnosticRequests(fetchMock: MockInstance<typeof globalThis.fetch>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === 'https://api.example.test/admin/operations/report-generate',
  );
}

function r2CapacityRequests(fetchMock: MockInstance<typeof globalThis.fetch>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === 'https://api.example.test/admin/operations/r2-capacity',
  );
}

function neonUsageRequests(fetchMock: MockInstance<typeof globalThis.fetch>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === 'https://api.example.test/admin/operations/neon-usage',
  );
}
async function getR2CapacitySection() {
  const heading = await screen.findByRole('heading', {
    level: 2,
    name: 'R2 capacity',
  });
  const section = heading.closest('section');
  expect(section).toBeTruthy();
  return section!;
}

async function getNeonUsageSection() {
  const heading = await screen.findByRole('heading', {
    level: 2,
    name: 'Neon Free usage',
  });
  const section = heading.closest('section');
  expect(section).toBeTruthy();
  return section!;
}

function expectPaintedProgressbar(
  container: HTMLElement,
  accessibleName: string,
  clampedPercent: number,
) {
  const progressbar = within(container).getByRole('progressbar', { name: accessibleName });
  expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
  expect(progressbar.getAttribute('aria-valuemax')).toBe('100');
  expect(progressbar.getAttribute('aria-valuenow')).toBe(String(clampedPercent));
  expect(progressbar.getAttribute('aria-valuetext')).toBe(
    accessibleName.slice(accessibleName.indexOf(': ') + 2),
  );
  expect(progressbar.style.width).toBe(`${clampedPercent}%`);
  return progressbar;
}
async function getDiagnosticSection() {
  const heading = await screen.findByRole('heading', {
    level: 2,
    name: 'Report generation diagnostic',
  });
  const section = heading.closest('section');
  expect(section).toBeTruthy();
  return section!;
}

async function getDeploymentCard(name: string) {
  const heading = await screen.findByRole('heading', { level: 3, name });
  const card = heading.closest('article');
  expect(card).toBeTruthy();
  return card!;
}

async function renderAndRunDiagnostic(body: unknown, status = 200) {
  const fetchMock = mockDiagnosticFetch(() => jsonResponse(body, status));
  const user = userEvent.setup();
  render(<AdminOperations />);
  const section = await getDiagnosticSection();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));
  await user.click(within(section).getByRole('button', { name: 'Run diagnostic' }));
  return { fetchMock, section };
}

beforeEach(() => {
  vi.restoreAllMocks();
  authMock.getSession.mockReset();
  authMock.getSession.mockResolvedValue(adminSession);
  authMock.logout.mockReset();
  authMock.logout.mockResolvedValue(undefined);
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('AdminOperations', () => {
  it('checks Harpa deployments, GitHub, Neon inventory and usage, and R2 and links every provider console', async () => {
    const fetchMock = mockOperationsFetch();

    render(<AdminOperations />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Service monitoring' }),
    ).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        'https://api.example.test/healthz',
        'https://api.example.test/readyz',
        'https://api.example.test/admin/readyz',
        '/_cf-pages-deployment.json',
        'https://api.example.test/admin/operations/neon',
        'https://api.example.test/admin/operations/neon-usage',
        'https://api.example.test/admin/operations/r2-capacity',
        'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=dev&per_page=1',
        'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=main&per_page=1',
        'https://api.github.com/repos/patrickchin/harpa-pro/pulls?state=open&sort=updated&direction=desc&per_page=30',
      ]),
    );

    const githubCalls = fetchMock.mock.calls.filter(
      ([url]) =>
        new URL(String(url), 'https://admin.example.test').origin === 'https://api.github.com',
    );
    expect(githubCalls.map(([url]) => String(url))).toEqual([
      'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=dev&per_page=1',
      'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=main&per_page=1',
      'https://api.github.com/repos/patrickchin/harpa-pro/pulls?state=open&sort=updated&direction=desc&per_page=30',
    ]);
    for (const [, init] of githubCalls) {
      expect(init).toMatchObject({
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' },
      });
      expect(new Headers(init?.headers).has('authorization')).toBe(false);
    }
    expect(
      screen.getByRole('heading', { level: 2, name: 'GitHub public repository' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'dev' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'main' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /0d0a841f/ }).getAttribute('href')).toBe(
      'https://github.com/patrickchin/harpa-pro/commit/0d0a841fed2fe44a2233ccf2eb58052672f54932',
    );
    expect(screen.getByRole('link', { name: /1ca389ac/ }).getAttribute('href')).toBe(
      'https://github.com/patrickchin/harpa-pro/commit/1ca389ac8f28c6cf8fbf0c7f5eca072f8670c129',
    );
    const pullRequests = screen.getByRole('list', { name: 'Open pull requests' });
    expect(within(pullRequests).getByRole('link', { name: /#304/ }).getAttribute('href')).toBe(
      'https://github.com/patrickchin/harpa-pro/pull/304',
    );
    expect(within(pullRequests).getByRole('link', { name: /#299/ })).toBeTruthy();
    expect(screen.getByText('57 of 60 requests remain')).toBeTruthy();
    const githubSection = screen
      .getByRole('heading', { level: 2, name: 'GitHub public repository' })
      .closest('section')!;
    expectPaintedProgressbar(
      githubSection,
      'Primary public REST request budget for this browser/IP: 5.0% used, 95.0% remaining',
      5,
    );
    expect(githubSection.textContent).toContain('95.0% remaining');
    expect(githubSection.textContent).toContain('5.0% used');
    expect(githubSection.querySelector('time[datetime="2026-08-07T22:06:06.000Z"]')).toBeTruthy();
    expect(
      within(githubSection).queryByText(/plan usage|billing credit|account-wide quota/i),
    ).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/rate_limit'))).toBe(false);
    expect(screen.getByTestId('github-pr-scroller').className).toContain('overflow-y-auto');

    for (const service of [
      'Fly.io',
      'Neon',
      'Cloudflare',
      'Sentry',
      'Better Stack',
      'GitHub Actions',
      'Doppler',
      'Expo / EAS',
      'Resend',
      'Zoho Mail',
      'App Store Connect',
      'Google Play Console',
      'OpenAI',
      'Groq',
      'Kimi / Moonshot',
      'Firecrawl',
    ]) {
      expect(screen.getByRole('heading', { level: 3, name: service })).toBeTruthy();
    }
    expect(screen.getAllByRole('link', { name: 'Open dashboard ↗' })).toHaveLength(16);
  });

  it('uses ten fixed reads on load and twenty after shared Refresh without polling', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = mockOperationsFetch();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const expectedRequests = [
      {
        url: 'https://api.example.test/healthz',
        credentials: 'omit',
      },
      {
        url: 'https://api.example.test/readyz',
        credentials: 'include',
      },
      {
        url: 'https://api.example.test/admin/readyz',
        credentials: 'include',
      },
      {
        url: '/_cf-pages-deployment.json',
        credentials: 'same-origin',
      },
      {
        url: 'https://api.example.test/admin/operations/neon-usage',
        credentials: 'include',
      },
    ] as const;

    render(<AdminOperations />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));
    await waitFor(() => {
      for (const { url } of expectedRequests) {
        expect(deploymentRequests(fetchMock, url)).toHaveLength(1);
      }
    });
    for (const { url, credentials } of expectedRequests) {
      const [, requestInit] = deploymentRequests(fetchMock, url)[0]!;
      expect(requestInit).toMatchObject({ credentials, cache: 'no-store' });
      expect(requestInit?.method ?? 'GET').toBe('GET');
      expect(requestInit).not.toHaveProperty('body');
      expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
    }
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(10);
    for (const { url } of expectedRequests) {
      expect(deploymentRequests(fetchMock, url)).toHaveLength(1);
    }
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(20));
    await waitFor(() => {
      for (const { url } of expectedRequests) {
        expect(deploymentRequests(fetchMock, url)).toHaveLength(2);
      }
    });
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);
  });

  it('keeps repository data but marks a contradictory GitHub request budget Unknown', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/commits?sha=dev&per_page=1')) {
        return new Response(JSON.stringify(githubCommits.dev), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': '61',
            'X-RateLimit-Reset': '1786140366',
          },
        });
      }
      if (url.includes('/commits?sha=main&per_page=1')) {
        return new Response(JSON.stringify(githubCommits.main), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': '61',
            'X-RateLimit-Reset': '1786140366',
          },
        });
      }
      if (url.includes('/pulls?state=open&sort=updated&direction=desc&per_page=30')) {
        return new Response(JSON.stringify(githubPulls), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': '61',
            'X-RateLimit-Reset': '1786140366',
          },
        });
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const githubSection = (
      await screen.findByRole('heading', { level: 2, name: 'GitHub public repository' })
    ).closest('section')!;
    expect(
      await within(githubSection).findByRole('heading', { level: 3, name: 'dev' }),
    ).toBeTruthy();
    expect(within(githubSection).getByRole('heading', { level: 3, name: 'main' })).toBeTruthy();
    expect(within(githubSection).getByRole('list', { name: 'Open pull requests' })).toBeTruthy();
    expect(await within(githubSection).findByText('Request budget: Unknown')).toBeTruthy();
    expect(within(githubSection).queryByRole('progressbar')).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/rate_limit'))).toBe(false);
  });

  it.each([
    ['missing headers', {}],
    [
      'malformed integer headers',
      {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '57.5',
        'X-RateLimit-Reset': '1786140366',
      },
    ],
    [
      'a missing reset header',
      {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '57',
      },
    ],
    [
      'a non-positive reset timestamp',
      {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '57',
        'X-RateLimit-Reset': '0',
      },
    ],
    [
      'a malformed reset timestamp',
      {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '57',
        'X-RateLimit-Reset': 'not-a-timestamp',
      },
    ],
  ] as const)(
    'keeps valid repository data but marks the GitHub request budget Unknown for %s',
    async (_caseName, rateLimitHeaders) => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (new URL(url, 'https://admin.example.test').origin === 'https://api.github.com') {
          const body = url.includes('/commits?sha=dev&per_page=1')
            ? githubCommits.dev
            : url.includes('/commits?sha=main&per_page=1')
              ? githubCommits.main
              : githubPulls;
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...rateLimitHeaders,
            },
          });
        }
        if (url === 'https://api.example.test/admin/operations/neon') {
          return jsonResponse(emptyInventory);
        }
        if (url === 'https://api.example.test/admin/operations/r2-capacity') {
          return jsonResponse(availableR2Capacity);
        }
        const deploymentResponse = defaultDeploymentResponse(url);
        if (deploymentResponse) return deploymentResponse;
        throw new Error(`Unexpected request: ${url}`);
      });

      render(<AdminOperations />);

      const githubSection = (
        await screen.findByRole('heading', { level: 2, name: 'GitHub public repository' })
      ).closest('section')!;
      expect(
        await within(githubSection).findByRole('heading', { level: 3, name: 'dev' }),
      ).toBeTruthy();
      expect(within(githubSection).getByRole('heading', { level: 3, name: 'main' })).toBeTruthy();
      expect(within(githubSection).getByRole('list', { name: 'Open pull requests' })).toBeTruthy();
      expect(await within(githubSection).findByText('Request budget: Unknown')).toBeTruthy();
      expect(within(githubSection).queryByRole('progressbar')).toBeNull();
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/rate_limit'))).toBe(false);
    },
  );

  it('keeps repository links usable when the browser GitHub rate limit is exhausted', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (new URL(url, 'https://admin.example.test').origin === 'https://api.github.com') {
        return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
          status: 403,
          headers: {
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': '1786140366',
          },
        });
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(await screen.findByText('GitHub rate limit reached for this browser/IP.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open repository ↗' }).getAttribute('href')).toBe(
      'https://github.com/patrickchin/harpa-pro',
    );
    expect(screen.getByRole('link', { name: 'Open pull requests ↗' }).getAttribute('href')).toBe(
      'https://github.com/patrickchin/harpa-pro/pulls',
    );
    const githubSection = screen
      .getByRole('heading', { level: 2, name: 'GitHub public repository' })
      .closest('section')!;
    expect(within(githubSection).getByText('0 of 60 requests remain')).toBeTruthy();
    expectPaintedProgressbar(
      githubSection,
      'Primary public REST request budget for this browser/IP: 100.0% used, 0.0% remaining',
      100,
    );
    // The sequential GitHub loader stops after the first rate-limited request,
    // so the two remaining public GitHub reads are intentionally skipped.
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it('identifies GitHub secondary throttling and provides retry guidance', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (new URL(url, 'https://admin.example.test').origin === 'https://api.github.com') {
        return new Response(
          JSON.stringify({ message: 'You have exceeded a secondary rate limit.' }),
          {
            status: 429,
            headers: {
              'Retry-After': '60',
              'X-RateLimit-Limit': '60',
              'X-RateLimit-Remaining': '12',
              'X-RateLimit-Reset': '1786140366',
            },
          },
        );
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(
      await screen.findByText('GitHub temporarily throttled requests for this browser/IP.'),
    ).toBeTruthy();
    expect(screen.getByText('Retry after 60 seconds.')).toBeTruthy();
    expect(screen.getByText('12 of 60 requests remain')).toBeTruthy();
    const githubSection = screen
      .getByRole('heading', { level: 2, name: 'GitHub public repository' })
      .closest('section')!;
    expectPaintedProgressbar(
      githubSection,
      'Primary public REST request budget for this browser/IP: 80.0% used, 20.0% remaining',
      80,
    );
  });

  it('renders the full API identity, independent migration heads, and admin Pages marker', async () => {
    mockOperationsFetch();

    render(<AdminOperations />);

    const apiCard = await getDeploymentCard('API build identity');
    expect(await within(apiCard).findByText(apiGitCommit)).toBeTruthy();
    expect(within(apiCard).getByText('Version')).toBeTruthy();
    expect(apiCard.textContent).toContain(apiIdentity.version);
    expect(within(apiCard).getByText('Git commit')).toBeTruthy();
    expect(apiCard.textContent).toContain(apiGitCommit);
    expect(apiCard.querySelector(`time[datetime="${apiIdentity.buildTime}"]`)).toBeTruthy();

    const productCard = await getDeploymentCard('Product database readiness');
    expect(within(productCard).getByText('Healthy')).toBeTruthy();
    expect(within(productCard).getByText('Migration head')).toBeTruthy();
    expect(productCard.textContent).toContain(productMigrationHead);

    const adminCard = await getDeploymentCard('Administrator database readiness');
    expect(within(adminCard).getByText('Healthy')).toBeTruthy();
    expect(within(adminCard).getByText('Migration head')).toBeTruthy();
    expect(adminCard.textContent).toContain(adminMigrationHead);

    const pagesCard = await getDeploymentCard('Administrator Pages identity');
    expect(within(pagesCard).getByText('Commit')).toBeTruthy();
    expect(pagesCard.textContent).toContain(adminPagesCommit);
    expect(within(pagesCard).getByText('Branch')).toBeTruthy();
    expect(pagesCard.textContent).toContain(adminPagesMarker.branch);
    expect(
      screen.getByText(
        'Build identity, readiness, provider metadata, and exact promotion proof are different evidence classes.',
      ),
    ).toBeTruthy();
  });

  it('accepts bounded printable Pages branch labels used by scoped automation branches', async () => {
    const automationBranch = 'dependabot/npm_and_yarn/@types/node-24.x';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/_cf-pages-deployment.json') {
        return jsonResponse({ ...adminPagesMarker, branch: automationBranch });
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const pagesCard = await getDeploymentCard('Administrator Pages identity');
    expect(await within(pagesCard).findByText(automationBranch)).toBeTruthy();
    expect(within(pagesCard).queryByText('Unknown')).toBeNull();
  });

  it('does not let an older overlapping refresh overwrite newer deployment evidence', async () => {
    const olderCommit = '3333333333333333333333333333333333333333';
    const newerCommit = '4444444444444444444444444444444444444444';
    let healthAttempt = 0;
    let resolveOlderRefresh!: (response: Response) => void;
    let resolveNewerRefresh!: (response: Response) => void;
    const olderRefresh = new Promise<Response>((resolve) => {
      resolveOlderRefresh = resolve;
    });
    const newerRefresh = new Promise<Response>((resolve) => {
      resolveNewerRefresh = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/healthz') {
        healthAttempt += 1;
        if (healthAttempt === 2) return olderRefresh;
        if (healthAttempt === 3) return newerRefresh;
        return jsonResponse(apiIdentity);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);
    const refreshButton = await screen.findByRole('button', { name: 'Refresh' });
    expect(await screen.findByText(apiGitCommit)).toBeTruthy();

    act(() => {
      refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => {
      expect(deploymentRequests(fetchMock, 'https://api.example.test/healthz')).toHaveLength(3);
    });

    await act(async () => {
      resolveNewerRefresh(jsonResponse({ ...apiIdentity, gitCommit: newerCommit }));
      await newerRefresh;
    });
    expect(await screen.findByText(newerCommit)).toBeTruthy();

    await act(async () => {
      resolveOlderRefresh(jsonResponse({ ...apiIdentity, gitCommit: olderCommit }));
      await olderRefresh;
    });
    await waitFor(() => expect(screen.queryByText(olderCommit)).toBeNull());
    expect(screen.getByText(newerCommit)).toBeTruthy();
  });

  it.each([
    {
      surface: 'API identity',
      failedUrl: 'https://api.example.test/healthz',
      failedResponse: () => new Response(null, { status: 502 }),
      cardName: 'API build identity',
      status: 'Unknown',
      missing: apiGitCommit,
      preserved: [productMigrationHead, adminMigrationHead, adminPagesCommit],
    },
    {
      surface: 'product readiness',
      failedUrl: 'https://api.example.test/readyz',
      failedResponse: () => jsonResponse({ ok: false, db: 'down' }, 503),
      cardName: 'Product database readiness',
      status: 'Unavailable',
      missing: productMigrationHead,
      preserved: [apiGitCommit, adminMigrationHead, adminPagesCommit],
    },
    {
      surface: 'administrator readiness',
      failedUrl: 'https://api.example.test/admin/readyz',
      failedResponse: () => {
        throw new Error('administrator database offline');
      },
      cardName: 'Administrator database readiness',
      status: 'Unavailable',
      missing: adminMigrationHead,
      preserved: [apiGitCommit, productMigrationHead, adminPagesCommit],
    },
    {
      surface: 'administrator Pages marker',
      failedUrl: '/_cf-pages-deployment.json',
      failedResponse: () => new Response(null, { status: 404 }),
      cardName: 'Administrator Pages identity',
      status: 'Unknown',
      missing: adminPagesCommit,
      preserved: [apiGitCommit, productMigrationHead, adminMigrationHead],
    },
  ])('keeps a $surface failure independent from the other evidence', async (testCase) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === testCase.failedUrl) return testCase.failedResponse();
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const failedCard = await getDeploymentCard(testCase.cardName);
    expect(await within(failedCard).findByText(testCase.status)).toBeTruthy();
    expect(failedCard.textContent).not.toContain(testCase.missing);
    for (const preservedValue of testCase.preserved) {
      expect(await screen.findByText(preservedValue)).toBeTruthy();
    }
  });

  it('shows only bounded expected and actual identifiers for a readiness head mismatch', async () => {
    const expectedHead = '0029_next_schema.sql';
    const actualHead = '0028_current_schema.sql';
    const rawMessage = 'postgres://owner:password@example.test <script>secret()</script>';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/readyz') {
        return jsonResponse(
          {
            ok: false,
            db: 'head-mismatch',
            expected: expectedHead,
            actual: actualHead,
            message: rawMessage,
          },
          503,
        );
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const productCard = await getDeploymentCard('Product database readiness');
    expect(await within(productCard).findByText('Unavailable')).toBeTruthy();
    expect(within(productCard).getByText('Expected')).toBeTruthy();
    expect(productCard.textContent).toContain(expectedHead);
    expect(within(productCard).getByText('Actual')).toBeTruthy();
    expect(productCard.textContent).toContain(actualHead);
    expect(document.body.textContent).not.toContain(rawMessage);
    expect(document.body.textContent).not.toContain('owner:password');
    expect(document.querySelector('script')).toBeNull();
    expect(await screen.findByText(apiGitCommit)).toBeTruthy();
    expect(await screen.findByText(adminMigrationHead)).toBeTruthy();
    expect(await screen.findByText(adminPagesCommit)).toBeTruthy();
  });

  it('strictly rejects extra fields, secrets, shortened SHAs, and HTML-shaped values', async () => {
    const forbiddenValues = [
      'api-observer-token-must-never-render',
      'database-password-must-never-render',
      '<img src=x onerror=secret-must-never-run>',
      '<script>pages-secret-must-never-run</script>',
      'pages-cookie-must-never-render',
    ];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/healthz') {
        return jsonResponse({
          ...apiIdentity,
          gitCommit: 'deadbeef',
          buildTime: 'not-an-iso-timestamp',
          token: forbiddenValues[0],
        });
      }
      if (url === 'https://api.example.test/readyz') {
        return jsonResponse({ ...productReadiness, password: forbiddenValues[1] });
      }
      if (url === 'https://api.example.test/admin/readyz') {
        return jsonResponse({ ...adminReadiness, head: forbiddenValues[2] });
      }
      if (url === '/_cf-pages-deployment.json') {
        return jsonResponse({
          ...adminPagesMarker,
          branch: forbiddenValues[3],
          cookie: forbiddenValues[4],
        });
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(
      await within(await getDeploymentCard('API build identity')).findByText('Unknown'),
    ).toBeTruthy();
    expect(
      await within(await getDeploymentCard('Product database readiness')).findByText('Unavailable'),
    ).toBeTruthy();
    expect(
      await within(await getDeploymentCard('Administrator database readiness')).findByText(
        'Unavailable',
      ),
    ).toBeTruthy();
    expect(
      await within(await getDeploymentCard('Administrator Pages identity')).findByText('Unknown'),
    ).toBeTruthy();

    const renderedText = document.body.textContent ?? '';
    for (const value of [
      ...forbiddenValues,
      'deadbeef',
      productMigrationHead,
      adminMigrationHead,
      adminPagesCommit,
    ]) {
      expect(renderedText).not.toContain(value);
    }
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('reports individual readiness failures and refreshes only when asked', async () => {
    let productAttempt = 0;
    let adminAttempt = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/readyz') {
        productAttempt += 1;
        return productAttempt === 1
          ? jsonResponse({ ok: false, db: 'down' }, 503)
          : jsonResponse(productReadiness);
      }
      if (url === 'https://api.example.test/admin/readyz') {
        adminAttempt += 1;
        if (adminAttempt === 1) throw new Error('offline');
        return jsonResponse(adminReadiness);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();

    render(<AdminOperations />);

    const productCard = (
      await screen.findByRole('heading', {
        level: 3,
        name: 'Product database readiness',
      })
    ).closest('article')!;
    const adminCard = screen
      .getByRole('heading', { level: 3, name: 'Administrator database readiness' })
      .closest('article')!;
    expect(await within(productCard).findByText('Unavailable')).toBeTruthy();
    expect(await within(adminCard).findByText('Unavailable')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(10);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(20));
    expect(await within(productCard).findByText('Healthy')).toBeTruthy();
    expect(await within(adminCard).findByText('Healthy')).toBeTruthy();
  });

  it('does not request deployment identities or provider observations while signed out', async () => {
    authMock.getSession.mockResolvedValueOnce(null).mockResolvedValueOnce(adminSession);
    const fetchMock = mockOperationsFetch(emptyInventory);
    const user = userEvent.setup();
    const view = render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open dashboard ↗' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Neon inventory' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Neon Free usage' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'R2 capacity' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'API build identity' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Administrator Pages identity' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    view.unmount();
    render(<AdminOperations />);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(authMock.logout).toHaveBeenCalledOnce();
    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Neon inventory' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Neon Free usage' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'R2 capacity' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'API build identity' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Administrator Pages identity' })).toBeNull();
  });

  it('shows a distinct loading state until the Neon observation arrives', async () => {
    let resolveInventory!: (response: Response) => void;
    const inventoryResponse = new Promise<Response>((resolve) => {
      resolveInventory = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/neon') return inventoryResponse;
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const inventoryHeading = await screen.findByRole('heading', { name: 'Neon inventory' });
    const inventorySection = inventoryHeading.closest('section')!;
    expect(within(inventorySection).getByText('Loading Neon inventory…')).toBeTruthy();

    await act(async () => {
      resolveInventory(jsonResponse(emptyInventory));
      await inventoryResponse;
    });
    expect(await within(inventorySection).findByText('No accessible Neon projects.')).toBeTruthy();
  });

  it('renders available projects with the exact count and a bounded branch scroller', async () => {
    mockOperationsFetch();

    render(<AdminOperations />);

    const inventoryHeading = await screen.findByRole('heading', { name: 'Neon inventory' });
    const inventorySection = inventoryHeading.closest('section')!;
    expect(within(inventorySection).getByText('1 visible project')).toBeTruthy();
    expect(inventorySection.querySelector(`time[datetime="${observedAt}"]`)).toBeTruthy();

    const projectCard = within(inventorySection)
      .getByRole('heading', { level: 3, name: 'Application database' })
      .closest('article')!;
    expect(within(projectCard).getByText('prj_application')).toBeTruthy();
    expect(projectCard.querySelector('time[datetime="2026-05-01T00:00:00.000Z"]')).toBeTruthy();
    expect(within(projectCard).getByText('147 branches')).toBeTruthy();
    expect(within(projectCard).queryByText('2 branches')).toBeNull();
    expect(within(projectCard).getByText('main')).toBeTruthy();
    expect(within(projectCard).getByText('dev')).toBeTruthy();
    expect(within(projectCard).getByText('br_main')).toBeTruthy();
    expect(within(projectCard).getByText('br_dev')).toBeTruthy();
    expect(within(projectCard).getByText('2 active branch details returned.')).toBeTruthy();

    const branchScroller = within(projectCard).getByRole('region', {
      name: 'Branches for Application database',
    });
    expect(branchScroller.className).toContain('overflow-y-auto');
    expect(branchScroller.className).toMatch(/\bmax-h-/);
  });

  it('returns to the signed-out guard when the Neon observer rejects an expired session', async () => {
    authMock.getSession.mockResolvedValueOnce(adminSession).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } }, 401);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(authMock.getSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Neon inventory' })).toBeNull();
    expect(screen.queryByText('Neon inventory is temporarily unavailable.')).toBeNull();
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  it('preserves verified project facts when the Neon observation is partial', async () => {
    mockOperationsFetch({
      observedAt,
      status: 'partial',
      projectsTruncated: false,
      unavailableProjectCount: 1,
      projects: [
        {
          ...applicationProject,
          branchCount: { status: 'available', count: 12 },
          branchDetails: { status: 'unknown', reason: 'timeout' },
        },
      ],
    });

    render(<AdminOperations />);

    const inventoryHeading = await screen.findByRole('heading', { name: 'Neon inventory' });
    const inventorySection = inventoryHeading.closest('section')!;
    expect(within(inventorySection).getByText('Partial Neon inventory')).toBeTruthy();
    expect(within(inventorySection).getByText('1 project unavailable.')).toBeTruthy();

    const projectCard = within(inventorySection)
      .getByRole('heading', { level: 3, name: 'Application database' })
      .closest('article')!;
    expect(within(projectCard).getByText('12 branches')).toBeTruthy();
    expect(within(projectCard).getByText('Branch details unavailable.')).toBeTruthy();
    expect(within(projectCard).getByText('Provider request timed out.')).toBeTruthy();
  });

  it('labels truncated branch details without conflating their size with the exact count', async () => {
    mockOperationsFetch({
      ...availableInventory,
      status: 'partial',
      unavailableProjectCount: 1,
      projects: [
        {
          ...applicationProject,
          branchDetails: { ...applicationProject.branchDetails, truncated: true },
        },
      ],
    });

    render(<AdminOperations />);

    const inventoryHeading = await screen.findByRole('heading', { name: 'Neon inventory' });
    const inventorySection = inventoryHeading.closest('section')!;
    expect(within(inventorySection).getByText('Partial Neon inventory')).toBeTruthy();
    const projectCard = within(inventorySection)
      .getByRole('heading', { level: 3, name: 'Application database' })
      .closest('article')!;
    expect(within(projectCard).getByText('147 branches')).toBeTruthy();
    expect(within(projectCard).getByText('2 active branch details returned.')).toBeTruthy();
    expect(within(projectCard).getByText('Branch detail list is truncated.')).toBeTruthy();
  });

  it('renders an explicit empty state when the viewer has no accessible projects', async () => {
    mockOperationsFetch(emptyInventory);

    render(<AdminOperations />);

    const inventoryHeading = await screen.findByRole('heading', { name: 'Neon inventory' });
    const inventorySection = inventoryHeading.closest('section')!;
    expect(within(inventorySection).getByText('No accessible Neon projects.')).toBeTruthy();
    expect(within(inventorySection).queryByRole('article')).toBeNull();
  });

  it('renders missing configuration as Unknown without implying provider health', async () => {
    mockOperationsFetch({
      observedAt,
      status: 'unknown',
      reason: 'not_configured',
    });

    render(<AdminOperations />);

    const inventoryHeading = await screen.findByRole('heading', { name: 'Neon inventory' });
    const inventorySection = inventoryHeading.closest('section')!;
    expect(within(inventorySection).getByText('Unknown')).toBeTruthy();
    expect(within(inventorySection).getByText('Neon inventory is not configured.')).toBeTruthy();
    expect(within(inventorySection).queryByText(/healthy/i)).toBeNull();
    expect(
      within(inventorySection).getByRole('link', { name: 'Open Neon console ↗' }),
    ).toHaveProperty('href', 'https://console.neon.tech/app/projects');
  });

  it('manually refreshes the inventory together with both readiness probes', async () => {
    const inventoryResponses = [
      {
        ...availableInventory,
        projects: [
          {
            ...applicationProject,
            branchCount: { status: 'available', count: 1 },
            branchDetails: { status: 'available', truncated: false, branches: [] },
          },
        ],
      },
      availableInventory,
    ];
    let inventoryRequestCount = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/neon') {
        const response = inventoryResponses[inventoryRequestCount] ?? availableInventory;
        inventoryRequestCount += 1;
        return jsonResponse(response);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();

    render(<AdminOperations />);

    expect(await screen.findByText('1 branch')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('147 branches')).toBeTruthy();

    const inventoryCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url) === 'https://api.example.test/admin/operations/neon',
    );
    expect(inventoryCalls).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });

  it('uses only the admin cookie request and never renders credentials or raw provider data', async () => {
    const forbiddenValues = [
      'neon-viewer-key-must-never-leak',
      'postgresql://owner:password@ep-secret.example/db',
      'ep-secret-pooler.example',
      'raw Neon provider error body',
    ];
    const fetchMock = mockOperationsFetch({
      ...availableInventory,
      apiKey: forbiddenValues[0],
      rawProviderResponse: { error: forbiddenValues[3] },
      projects: [
        {
          ...applicationProject,
          connectionUri: forbiddenValues[1],
          proxyHost: forbiddenValues[2],
          ownerId: 'provider-owner-id',
          passwords: ['database-password'],
          endpoints: [{ host: forbiddenValues[2] }],
          roles: [{ name: 'owner' }],
          annotations: { hidden: 'raw-annotation' },
        },
      ],
    });

    render(<AdminOperations />);

    const inventoryHeading = await screen.findByRole('heading', { name: 'Neon inventory' });
    const inventorySection = inventoryHeading.closest('section')!;
    expect(await within(inventorySection).findByText('Unknown')).toBeTruthy();
    expect(
      within(inventorySection).queryByRole('heading', {
        level: 3,
        name: 'Application database',
      }),
    ).toBeNull();
    const inventoryCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === 'https://api.example.test/admin/operations/neon',
    );
    expect(inventoryCall).toBeDefined();
    const requestInit = inventoryCall?.[1];
    expect(requestInit).toMatchObject({ credentials: 'include', cache: 'no-store' });
    expect(requestInit?.method ?? 'GET').toBe('GET');
    expect(requestInit).not.toHaveProperty('body');
    expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
    expect(JSON.stringify(requestInit)).not.toContain('neon-viewer-key');

    const renderedText = document.body.textContent ?? '';
    for (const value of [
      ...forbiddenValues,
      'provider-owner-id',
      'database-password',
      'raw-annotation',
    ]) {
      expect(renderedText).not.toContain(value);
    }
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('shows a distinct loading state until the Neon Free usage observation arrives', async () => {
    let resolveNeonUsage!: (response: Response) => void;
    const neonUsageResponse = new Promise<Response>((resolve) => {
      resolveNeonUsage = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/neon-usage') {
        return neonUsageResponse;
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    expect(within(section).getByText('Loading Neon Free usage…')).toBeTruthy();

    await act(async () => {
      resolveNeonUsage(jsonResponse(availableNeonUsage));
      await neonUsageResponse;
    });
    expect(
      await within(section).findByRole('progressbar', {
        name: 'Application database compute: 25.0% used, 75.0% remaining',
      }),
    ).toBeTruthy();
  });

  it('loads Neon Free usage with the admin cookie and refreshes it only with the shared control', async () => {
    const observations = [unknownNeonUsage, availableNeonUsage];
    let observationIndex = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/neon-usage') {
        const observation = observations[observationIndex] ?? availableNeonUsage;
        observationIndex += 1;
        return jsonResponse(observation);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    expect(await within(section).findByText('Neon Free usage is not configured.')).toBeTruthy();
    expect(neonUsageRequests(fetchMock)).toHaveLength(1);
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(
      await within(section).findByRole('progressbar', {
        name: 'Application database compute: 25.0% used, 75.0% remaining',
      }),
    ).toBeTruthy();
    await waitFor(() => expect(neonUsageRequests(fetchMock)).toHaveLength(2));
    for (const [, requestInit] of neonUsageRequests(fetchMock)) {
      expect(requestInit).toMatchObject({
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      expect(requestInit).not.toHaveProperty('body');
      expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
    }
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('renders Neon Free project and organization percentages from raw published references', async () => {
    mockOperationsFetch(emptyInventory, availableR2Capacity, availableNeonUsage);

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    const project = within(section)
      .getByRole('heading', { level: 3, name: 'Application database' })
      .closest('article')!;
    expectPaintedProgressbar(
      project,
      'Application database compute: 25.0% used, 75.0% remaining',
      25,
    );
    expectPaintedProgressbar(
      project,
      'Application database storage: 25.0% used, 75.0% remaining',
      25,
    );
    expectPaintedProgressbar(
      section,
      'Organization public network transfer: 25.0% used, 75.0% remaining',
      25,
    );

    const renderedText = section.textContent ?? '';
    for (const rawEvidence of [
      '90,000 CU-seconds used',
      '360,000 CU-seconds published reference',
      '125,000,000 bytes used',
      '500,000,000 bytes published reference',
      '1,250,000,000 bytes used',
      '5,000,000,000 bytes published reference',
    ]) {
      expect(renderedText).toContain(rawEvidence);
    }
    expect(renderedText).toContain('25.0% used');
    expect(renderedText).toContain('75.0% remaining');
    expect(section.querySelector('time[datetime="2026-08-01T00:00:00.000Z"]')).toBeTruthy();
    expect(section.querySelector(`time[datetime="${resetAt}"]`)).toBeTruthy();
    expect(within(section).getByText('Not an invoice or credit balance.')).toBeTruthy();
    expect(within(section).queryByText(/credit remaining|cash credit/i)).toBeNull();
    expect(within(section).getByRole('link', { name: 'Open Neon pricing ↗' })).toHaveProperty(
      'href',
      'https://neon.com/pricing',
    );
    expect(within(section).getByRole('link', { name: 'Open Neon console ↗' })).toHaveProperty(
      'href',
      'https://console.neon.tech/app/projects',
    );
  });

  it('keeps complete empty Neon discovery available without fabricating a transfer period or percentage', async () => {
    mockOperationsFetch(emptyInventory, availableR2Capacity, emptyNeonUsage);

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    expect(await within(section).findByText('Available')).toBeTruthy();
    expect(within(section).getByText('0 visible projects')).toBeTruthy();
    expect(within(section).getByText('No Neon projects were returned.')).toBeTruthy();
    expect(within(section).getByText('Organization transfer percentage: Unknown')).toBeTruthy();
    expect(within(section).queryByRole('progressbar')).toBeNull();
    expect(within(section).queryByText(/% (?:used|remaining)/i)).toBeNull();
    expect(section.querySelector('time[datetime="2026-08-01T00:00:00.000Z"]')).toBeNull();
    expect(section.querySelector(`time[datetime="${resetAt}"]`)).toBeNull();
    expect(within(section).getByRole('link', { name: 'Open Neon pricing ↗' })).toHaveProperty(
      'href',
      'https://neon.com/pricing',
    );
    expect(within(section).getByRole('link', { name: 'Open Neon console ↗' })).toHaveProperty(
      'href',
      'https://console.neon.tech/app/projects',
    );
  });

  it('does not call a partial empty Neon discovery an organization with no projects', async () => {
    mockOperationsFetch(emptyInventory, availableR2Capacity, partialEmptyNeonUsage);

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    expect(await within(section).findByText('Partial')).toBeTruthy();
    expect(within(section).getByText('0 visible projects')).toBeTruthy();
    expect(
      within(section).getByText(
        'Project discovery is incomplete; no project usage rows were safely available.',
      ),
    ).toBeTruthy();
    expect(within(section).getByText('1 provider-reported project is unavailable.')).toBeTruthy();
    expect(within(section).getByText('Project discovery is truncated.')).toBeTruthy();
    expect(within(section).queryByText('No Neon projects were returned.')).toBeNull();
    expect(within(section).getByText('Organization transfer percentage: Unknown')).toBeTruthy();
    expect(within(section).queryByRole('progressbar')).toBeNull();
  });

  it('preserves available project percentages while explaining partial Neon usage evidence', async () => {
    mockOperationsFetch(emptyInventory, availableR2Capacity, partialNeonUsage);

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    expect(await within(section).findByText('Partial')).toBeTruthy();
    expectPaintedProgressbar(
      section,
      'Application database compute: 25.0% used, 75.0% remaining',
      25,
    );
    expectPaintedProgressbar(
      section,
      'Application database storage: 25.0% used, 75.0% remaining',
      25,
    );
    const unknownProject = within(section)
      .getByRole('heading', { level: 3, name: 'Admin database' })
      .closest('article')!;
    expect(within(unknownProject).getByText('Project usage unavailable.')).toBeTruthy();
    expect(within(unknownProject).getByText('Provider request timed out.')).toBeTruthy();
    expect(within(section).getByText('Organization transfer percentage: Unknown')).toBeTruthy();
    expect(within(section).getByText('Complete project coverage is unavailable.')).toBeTruthy();
    expect(
      within(section).queryByRole('progressbar', {
        name: /Organization public network transfer/i,
      }),
    ).toBeNull();
  });

  it.each([
    [unknownNeonUsage, 'Neon Free usage is not configured.'],
    [
      { ...unknownNeonUsage, reason: 'unsupported_plan' as const },
      'Neon plan is not the supported Free plan.',
    ],
  ] as const)(
    'renders an Unknown Neon Free usage reason without a fabricated percentage',
    async (observation, expectedCopy) => {
      mockOperationsFetch(emptyInventory, availableR2Capacity, observation);

      render(<AdminOperations />);

      const section = await getNeonUsageSection();
      expect(await within(section).findByText('Unknown')).toBeTruthy();
      expect(within(section).getByText(expectedCopy)).toBeTruthy();
      expect(within(section).queryByRole('progressbar')).toBeNull();
      expect(within(section).queryByText(/% (?:used|remaining)/i)).toBeNull();
    },
  );

  it('returns the whole page to sign-in when the Neon Free usage observer rejects the session', async () => {
    authMock.getSession.mockResolvedValueOnce(adminSession).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/neon-usage') {
        return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } }, 401);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(availableR2Capacity);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(authMock.getSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Neon Free usage' })).toBeNull();
    expect(screen.queryByText('Neon Free usage is temporarily unavailable.')).toBeNull();
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  it('strictly rejects and redacts Neon credentials, provider bodies, and project connection data', async () => {
    const forbiddenValues = [
      'neon-viewer-key-must-never-leak',
      'postgresql://owner:password@ep-secret.example/db',
      'raw Neon usage provider error for owner@example.com',
      'ep-secret-pooler.example',
    ];
    const poisonedNeonUsage = {
      ...availableNeonUsage,
      apiKey: forbiddenValues[0],
      rawProviderResponse: { error: forbiddenValues[2] },
      projects: [
        {
          ...availableNeonUsageProject,
          connectionUri: forbiddenValues[1],
          proxyHost: forbiddenValues[3],
          ownerId: 'provider-owner-id',
        },
      ],
    };
    mockOperationsFetch(emptyInventory, availableR2Capacity, poisonedNeonUsage);

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('Neon Free usage returned an invalid response.')).toBeTruthy();
    expect(within(section).queryByRole('progressbar')).toBeNull();
    const renderedText = document.body.textContent ?? '';
    const serializedDom = document.documentElement.outerHTML;
    for (const value of [...forbiddenValues, 'provider-owner-id']) {
      expect(renderedText).not.toContain(value);
      expect(serializedDom).not.toContain(value);
    }
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('retains over-reference percentages while clamping every painted Neon meter at 100%', async () => {
    mockOperationsFetch(emptyInventory, availableR2Capacity, overAllowanceNeonUsage);

    render(<AdminOperations />);

    const section = await getNeonUsageSection();
    expectPaintedProgressbar(
      section,
      'Application database compute: 111.1% used, 0.0% remaining',
      100,
    );
    expectPaintedProgressbar(
      section,
      'Application database storage: 120.0% used, 0.0% remaining',
      100,
    );
    expectPaintedProgressbar(
      section,
      'Organization public network transfer: 120.0% used, 0.0% remaining',
      100,
    );
    expect(section.textContent).toContain('111.1% used');
    expect(section.textContent).toContain('120.0% used');
    expect(section.textContent).toContain('0.0% remaining');
  });

  it('loads R2 capacity with the admin cookie and refreshes it only with the shared control', async () => {
    const observations = [unknownR2Capacity, availableR2Capacity];
    let observationIndex = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        const observation = observations[observationIndex] ?? availableR2Capacity;
        observationIndex += 1;
        return jsonResponse(observation);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expect(await within(section).findByText('R2 capacity is not configured.')).toBeTruthy();
    expect(r2CapacityRequests(fetchMock)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await within(section).findByText('2 visible buckets')).toBeTruthy();
    await waitFor(() => expect(r2CapacityRequests(fetchMock)).toHaveLength(2));
    for (const [, requestInit] of r2CapacityRequests(fetchMock)) {
      expect(requestInit).toMatchObject({
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      expect(requestInit).not.toHaveProperty('body');
      expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);
    }
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });

  it('shows a distinct loading state until the R2 observation arrives', async () => {
    let resolveR2Capacity!: (response: Response) => void;
    const r2CapacityResponse = new Promise<Response>((resolve) => {
      resolveR2Capacity = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return r2CapacityResponse;
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expect(within(section).getByText('Loading R2 capacity…')).toBeTruthy();

    await act(async () => {
      resolveR2Capacity(jsonResponse(availableR2Capacity));
      await r2CapacityResponse;
    });
    expect(await within(section).findByText('2 visible buckets')).toBeTruthy();
  });

  it('renders available R2 snapshots, free-tier references, caveats, and a bounded bucket list', async () => {
    mockOperationsFetch(emptyInventory, availableR2Capacity);

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expect(await within(section).findByText('Available')).toBeTruthy();
    expect(within(section).getByText('2 visible buckets')).toBeTruthy();
    expect(section.querySelector(`time[datetime="${observedAt}"]`)).toBeTruthy();

    const renderedText = section.textContent ?? '';
    for (const value of [
      '10 GB-month',
      '1,000,000 Class A operations',
      '10,000,000 Class B operations',
      'Standard storage',
      '61,000,000 payload bytes',
      '596,713 metadata bytes',
      '138 published objects',
      '1 uploading object',
      'Infrequent Access',
      '12,000,000 payload bytes',
      '7 published objects',
      '125,000 used',
      '875,000 estimated remaining',
      '4,200,000 used',
      '5,800,000 estimated remaining',
      '32,000 free operations',
    ]) {
      expect(renderedText).toContain(value);
    }
    expectPaintedProgressbar(
      section,
      'Estimated R2 Class A operations: 12.5% used, 87.5% remaining',
      12.5,
    );
    expectPaintedProgressbar(
      section,
      'Estimated R2 Class B operations: 42.0% used, 58.0% remaining',
      42,
    );
    expect(renderedText).toContain('12.5% used');
    expect(renderedText).toContain('87.5% remaining');
    expect(renderedText).toContain('42.0% used');
    expect(renderedText).toContain('58.0% remaining');
    expect(within(section).getAllByRole('progressbar')).toHaveLength(2);
    expect(within(section).queryByRole('progressbar', { name: /storage/i })).toBeNull();
    expect(renderedText).not.toMatch(/(?:standard|infrequent access|storage)[^.\n]*%/i);
    for (const caveat of [
      'Current storage is a snapshot, not remaining GB-month capacity.',
      'Storage metrics may lag.',
      'Operation headroom is a conservative account-wide estimate from analytics and published mappings; storage-class eligibility is unavailable, so this is not a provider billing balance.',
      'Infrequent Access storage is outside the Standard-storage free tier.',
    ]) {
      expect(within(section).getByText(caveat)).toBeTruthy();
    }

    const bucketScroller = within(section).getByRole('region', { name: 'R2 buckets' });
    expect(bucketScroller.className).toContain('overflow-y-auto');
    expect(bucketScroller.className).toMatch(/\bmax-h-/);
    expect(within(bucketScroller).getByText('harpa-pro')).toBeTruthy();
    expect(within(bucketScroller).getByText('harpa-pro-archive')).toBeTruthy();
    expect(bucketScroller.querySelector('time[datetime="2026-05-01T00:00:00.000Z"]')).toBeTruthy();
    expect(within(section).getByRole('link', { name: 'Open Cloudflare console ↗' })).toHaveProperty(
      'href',
      'https://dash.cloudflare.com/',
    );
  });

  it.each([
    ['zero', 0, 1_000_000, 0, 10_000_000, 0, 100, 0],
    ['full', 1_000_000, 0, 10_000_000, 0, 100, 0, 100],
    ['over-reference', 1_250_000, 0, 12_500_000, 0, 125, 0, 100],
  ] as const)(
    'renders %s R2 Class A and Class B operation percentages',
    async (
      _caseName,
      classAUsed,
      classARemaining,
      classBUsed,
      classBRemaining,
      usedPercent,
      remainingPercent,
      paintedPercent,
    ) => {
      const observation = {
        ...availableR2Capacity,
        operations: {
          ...availableR2Capacity.operations,
          classA: {
            ...availableR2Capacity.operations.classA,
            estimatedUsed: classAUsed,
            estimatedRemaining: classARemaining,
          },
          classB: {
            ...availableR2Capacity.operations.classB,
            estimatedUsed: classBUsed,
            estimatedRemaining: classBRemaining,
          },
        },
      };
      mockOperationsFetch(emptyInventory, observation);

      render(<AdminOperations />);

      const section = await getR2CapacitySection();
      expectPaintedProgressbar(
        section,
        `Estimated R2 Class A operations: ${usedPercent.toFixed(1)}% used, ${remainingPercent.toFixed(1)}% remaining`,
        paintedPercent,
      );
      expectPaintedProgressbar(
        section,
        `Estimated R2 Class B operations: ${usedPercent.toFixed(1)}% used, ${remainingPercent.toFixed(1)}% remaining`,
        paintedPercent,
      );
    },
  );

  it('preserves partial R2 facts and explains unknown storage, truncation, and exclusions', async () => {
    const partialR2Capacity = {
      ...availableR2Capacity,
      status: 'partial' as const,
      buckets: { ...availableR2Capacity.buckets, truncated: true },
      storage: { status: 'unknown' as const, reason: 'timeout' as const },
      operations: {
        ...availableR2Capacity.operations,
        unclassifiedRequests: 57,
      },
      caveats: [
        'storage_snapshot_not_gb_month',
        'storage_metrics_may_lag',
        'operations_estimated_from_analytics',
        'unclassified_operations_excluded',
        'bucket_inventory_truncated',
      ] as const,
    };
    mockOperationsFetch(emptyInventory, partialR2Capacity);

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expect(await within(section).findByText('Partial')).toBeTruthy();
    expect(within(section).getByText('2 visible buckets')).toBeTruthy();
    expect(within(section).getByText('Storage snapshot unavailable.')).toBeTruthy();
    expect(within(section).getByText('Cloudflare request timed out.')).toBeTruthy();
    expect(
      within(section).getByText('Bucket inventory is truncated; more buckets may exist.'),
    ).toBeTruthy();
    expect(
      within(section).getByText(
        '57 successful requests were unclassified and excluded from the operation estimates.',
      ),
    ).toBeTruthy();
    expectPaintedProgressbar(
      section,
      'Estimated R2 Class A operations: 12.5% used, 87.5% remaining',
      12.5,
    );
    expectPaintedProgressbar(
      section,
      'Estimated R2 Class B operations: 42.0% used, 58.0% remaining',
      42,
    );
    expect(within(section).getAllByRole('progressbar')).toHaveLength(2);
    expect(section.textContent).toContain('875,000 estimated remaining');
  });

  it('renders an unknown R2 observation without implying provider health or remaining storage', async () => {
    mockOperationsFetch(emptyInventory, unknownR2Capacity);

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('R2 capacity is not configured.')).toBeTruthy();
    expect(within(section).queryByText(/healthy/i)).toBeNull();
    expect(within(section).queryByText(/remaining GB-month/i)).toBeNull();
    expect(within(section).queryByText(/GB-month remaining/i)).toBeNull();
  });

  it('uses neutral copy when the admin route rate-limits the R2 observation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse({ error: { code: 'RATE_LIMITED', message: 'route bucket' } }, 429);
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('R2 capacity observation was rate limited.')).toBeTruthy();
    expect(within(section).queryByText(/Cloudflare rate limiting/i)).toBeNull();
    expect(document.body.textContent).not.toContain('route bucket');
  });

  it('returns the whole page to sign-in when the R2 observer finds an expired session', async () => {
    authMock.getSession.mockResolvedValueOnce(adminSession).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/r2-capacity') {
        return jsonResponse(
          { error: { code: 'UNAUTHORIZED', message: 'expired-r2-cookie-detail' } },
          401,
        );
      }
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      const deploymentResponse = defaultDeploymentResponse(url);
      if (deploymentResponse) return deploymentResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(authMock.getSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'R2 capacity' })).toBeNull();
    expect(document.body.textContent).not.toContain('expired-r2-cookie-detail');
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  it('strictly rejects and redacts R2 credentials, raw provider data, and exact remaining storage', async () => {
    const forbiddenValues = [
      'cloudflare-observer-token-must-never-render',
      'cloudflare-account-id-must-never-render',
      'raw Cloudflare GraphQL error body',
      'private/object-key.jpg',
      '9.75 exact remaining GB-month',
    ];
    const poisonedR2Capacity = {
      ...availableR2Capacity,
      apiToken: forbiddenValues[0],
      accountId: forbiddenValues[1],
      rawProviderResponse: { errors: [{ message: forbiddenValues[2] }] },
      objectKeys: [forbiddenValues[3]],
      remainingStorage: forbiddenValues[4],
    };
    const fetchMock = mockOperationsFetch(emptyInventory, poisonedR2Capacity);

    render(<AdminOperations />);

    const section = await getR2CapacitySection();
    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('R2 capacity returned an invalid response.')).toBeTruthy();
    expect(within(section).queryByText('harpa-pro')).toBeNull();

    const [request] = r2CapacityRequests(fetchMock);
    expect(request).toBeDefined();
    const [, requestInit] = request!;
    expect(requestInit).toMatchObject({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(requestInit).not.toHaveProperty('body');
    expect(new Headers(requestInit?.headers).has('authorization')).toBe(false);

    const renderedText = document.body.textContent ?? '';
    const serializedDom = document.documentElement.outerHTML;
    for (const value of forbiddenValues) {
      expect(renderedText).not.toContain(value);
      expect(serializedDom).not.toContain(value);
    }
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('keeps the cost-bearing report diagnostic idle until an administrator runs it', async () => {
    const fetchMock = mockOperationsFetch(emptyInventory);

    render(<AdminOperations />);

    const diagnosticSection = await getDiagnosticSection();
    const idleCopy = within(diagnosticSection).getByText('Not run yet in this browser session.');
    expect(idleCopy.closest('[aria-live="polite"]')).toBeTruthy();
    expect(
      within(diagnosticSection).getByText(
        'Each run updates one synthetic report and may consume AI quota.',
      ),
    ).toBeTruthy();
    expect(
      within(diagnosticSection).getByRole('button', { name: 'Run diagnostic' }),
    ).toHaveProperty('disabled', false);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);
  });

  it('keeps shared Refresh read-only and preserves the idle diagnostic state', async () => {
    const fetchMock = mockOperationsFetch(emptyInventory);
    const user = userEvent.setup();

    render(<AdminOperations />);

    const diagnosticSection = await getDiagnosticSection();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(20));

    expect(diagnosticRequests(fetchMock)).toHaveLength(0);
    expect(
      within(diagnosticSection).getByText('Not run yet in this browser session.'),
    ).toBeTruthy();
  });

  it('manually posts with the current CSRF token, prevents double-submit, and renders proof', async () => {
    let resolveDiagnostic!: (response: Response) => void;
    const diagnosticResponse = new Promise<Response>((resolve) => {
      resolveDiagnostic = resolve;
    });
    const fetchMock = mockDiagnosticFetch(() => diagnosticResponse);
    const user = userEvent.setup();

    render(<AdminOperations />);

    const diagnosticSection = await getDiagnosticSection();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));
    const runButton = within(diagnosticSection).getByRole('button', {
      name: 'Run diagnostic',
    });
    await user.click(runButton);

    await waitFor(() => expect(diagnosticRequests(fetchMock)).toHaveLength(1));
    expect(runButton).toHaveProperty('disabled', true);
    const progress = within(diagnosticSection).getByText('Running diagnostic…');
    expect(progress.closest('[aria-live="polite"]')).toBeTruthy();

    await user.click(runButton);
    expect(diagnosticRequests(fetchMock)).toHaveLength(1);

    const [, requestInit] = diagnosticRequests(fetchMock)[0]!;
    expect(requestInit).toMatchObject({
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(requestInit).not.toHaveProperty('body');
    const requestHeaders = new Headers(requestInit?.headers);
    expect(requestHeaders.get('x-admin-csrf')).toBe(adminSession.csrfToken);
    expect(requestHeaders.has('authorization')).toBe(false);

    await act(async () => {
      resolveDiagnostic(jsonResponse(passDiagnostic));
      await diagnosticResponse;
    });

    expect(await within(diagnosticSection).findByText('Pass')).toBeTruthy();
    await waitFor(() => expect(runButton).toHaveProperty('disabled', false));
    for (const value of [
      'report-canary@e2e.harpapro.com',
      'prj_01234567',
      'rpt_01234567',
      'openai',
      'gpt-5.1',
      'req-report-canary-1',
    ]) {
      expect(within(diagnosticSection).getByText(value)).toBeTruthy();
    }
    expect(within(diagnosticSection).getByText('Report 42')).toBeTruthy();
    expect(within(diagnosticSection).getByText('Live')).toBeTruthy();
    expect(within(diagnosticSection).getByText('Sign-out confirmed.')).toBeTruthy();
    for (const timestamp of [
      passDiagnostic.observedAt,
      passDiagnostic.generation.requestedAt,
      passDiagnostic.generation.finishedAt,
      passDiagnostic.generation.reportUpdatedAt,
      passDiagnostic.generation.generatedAt,
    ]) {
      expect(diagnosticSection.querySelector(`time[datetime="${timestamp}"]`)).toBeTruthy();
    }

    expect(within(diagnosticSection).getByText('Free plan')).toBeTruthy();
    expect(within(diagnosticSection).getByText('Report generations')).toBeTruthy();
    expect(within(diagnosticSection).getByText('AI input tokens')).toBeTruthy();
    expect(within(diagnosticSection).getByText('AI output tokens')).toBeTruthy();
    const renderedProof = diagnosticSection.textContent ?? '';
    for (const value of [
      '2 used',
      '8 remaining',
      '10 limit',
      '125,000 used',
      '875,000 remaining',
      '1,000,000 limit',
      '4,200 used',
      'Unlimited',
      'Custom limit',
    ]) {
      expect(renderedProof).toContain(value);
    }
    expect(diagnosticSection.querySelector(`time[datetime="${resetAt}"]`)).toBeTruthy();
  });

  it('preserves successful proof while showing only reviewed warning copy', async () => {
    const warningDiagnostic = {
      ...passDiagnostic,
      status: 'warning' as const,
      generation: {
        ...passDiagnostic.generation,
        fixtureMode: 'replay' as const,
        idempotentReplay: true,
      },
      limits: null,
      cleanup: 'failed' as const,
      warnings: ['replay_only', 'limits_unavailable', 'sign_out_failed'] as const,
    };
    const { section } = await renderAndRunDiagnostic(warningDiagnostic);

    expect(await within(section).findByText('Warning')).toBeTruthy();
    expect(within(section).getByText('Replay')).toBeTruthy();
    expect(within(section).getByText('openai')).toBeTruthy();
    expect(within(section).getByText('gpt-5.1')).toBeTruthy();
    for (const message of [
      'This run exercised the endpoint and persistence, but did not confirm a fresh live AI provider call.',
      'Generation passed, but effective usage limits were unavailable.',
      'Generation passed, but sign-out could not be confirmed.',
    ]) {
      expect(within(section).getByText(message)).toBeTruthy();
    }
    expect(within(section).queryByText('Sign-out confirmed.')).toBeNull();
  });

  it('renders sanitized failed and not-configured observations without implying health', async () => {
    const failed = {
      observedAt,
      status: 'fail' as const,
      durationMs: 900,
      phase: 'generate' as const,
      reason: 'rate_limited' as const,
      cleanup: 'succeeded' as const,
    };
    let result = await renderAndRunDiagnostic(failed);

    expect(await within(result.section).findByText('Failed')).toBeTruthy();
    expect(within(result.section).getByText('Generate')).toBeTruthy();
    expect(
      within(result.section).getByText('Rate limiting prevented report generation.'),
    ).toBeTruthy();
    expect(within(result.section).getByText('Sign-out confirmed.')).toBeTruthy();
    expect(within(result.section).queryByText(/healthy/i)).toBeNull();

    cleanup();
    result = await renderAndRunDiagnostic(unknownDiagnostic);
    expect(await within(result.section).findByText('Unknown')).toBeTruthy();
    expect(
      within(result.section).getByText('Report-generation diagnostic is not configured.'),
    ).toBeTruthy();
    expect(within(result.section).queryByText(/healthy/i)).toBeNull();
  });

  it('distinguishes rejected admin requests from provider failures and rate limits', async () => {
    const forbiddenBody = {
      error: {
        code: 'FORBIDDEN',
        message: 'csrf-origin-detail-must-never-render',
      },
    };
    let result = await renderAndRunDiagnostic(forbiddenBody, 403);

    expect(await within(result.section).findByText('Request rejected')).toBeTruthy();
    expect(
      within(result.section).getByText(
        'The admin origin or CSRF check rejected this diagnostic request.',
      ),
    ).toBeTruthy();
    expect(result.section.textContent).not.toContain('csrf-origin-detail-must-never-render');
    expect(within(result.section).queryByText(/provider failed/i)).toBeNull();

    cleanup();
    result = await renderAndRunDiagnostic(
      { error: { code: 'RATE_LIMITED', message: 'raw limiter detail' } },
      429,
    );
    expect(await within(result.section).findByText('Rate limited')).toBeTruthy();
    expect(
      within(result.section).getByText('Diagnostic run limit reached. Try again later.'),
    ).toBeTruthy();
    expect(result.section.textContent).not.toContain('raw limiter detail');
  });

  it('returns the whole page to sign-in when a diagnostic request finds an expired session', async () => {
    authMock.getSession.mockResolvedValueOnce(adminSession).mockResolvedValueOnce(null);
    const fetchMock = mockDiagnosticFetch(() =>
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'expired-cookie-detail' } }, 401),
    );
    const user = userEvent.setup();

    render(<AdminOperations />);

    const diagnosticSection = await getDiagnosticSection();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));
    await user.click(within(diagnosticSection).getByRole('button', { name: 'Run diagnostic' }));

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(authMock.getSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Report generation diagnostic' })).toBeNull();
    expect(document.body.textContent).not.toContain('expired-cookie-detail');
    expect(authMock.logout).not.toHaveBeenCalled();
  });

  it('strictly rejects diagnostic responses containing credentials or raw content', async () => {
    const forbiddenValues = [
      'test-password-must-never-render',
      'bearer-token-must-never-render',
      'admin-cookie-must-never-render',
      'synthetic-note-content-must-never-render',
      'raw-model-response-must-never-render',
      'raw-provider-error-must-never-render',
    ];
    const poisonedResponse = {
      ...passDiagnostic,
      password: forbiddenValues[0],
      adminCookie: forbiddenValues[2],
      target: {
        ...passDiagnostic.target,
        bearerToken: forbiddenValues[1],
      },
      generation: {
        ...passDiagnostic.generation,
        notes: forbiddenValues[3],
        rawResponse: forbiddenValues[4],
        providerError: forbiddenValues[5],
      },
    };
    const { section } = await renderAndRunDiagnostic(poisonedResponse);

    expect(await within(section).findByText('Unknown')).toBeTruthy();
    expect(within(section).getByText('The diagnostic returned an invalid response.')).toBeTruthy();
    const renderedText = document.body.textContent ?? '';
    for (const value of [...forbiddenValues, adminSession.csrfToken]) {
      expect(renderedText).not.toContain(value);
    }
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
