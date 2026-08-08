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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function defaultDeploymentResponse(url: string): Response | null {
  if (url === 'https://api.example.test/healthz') return jsonResponse(apiIdentity);
  if (url === 'https://api.example.test/readyz') return jsonResponse(productReadiness);
  if (url === 'https://api.example.test/admin/readyz') return jsonResponse(adminReadiness);
  if (url === '/_cf-pages-deployment.json') return jsonResponse(adminPagesMarker);
  return null;
}

function mockOperationsFetch(
  inventory: unknown = availableInventory,
  r2Capacity: unknown = availableR2Capacity,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === 'https://api.example.test/admin/operations/neon') {
      return jsonResponse(inventory);
    }
    if (url === 'https://api.example.test/admin/operations/r2-capacity') {
      return jsonResponse(r2Capacity);
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

async function getR2CapacitySection() {
  const heading = await screen.findByRole('heading', {
    level: 2,
    name: 'R2 capacity',
  });
  const section = heading.closest('section');
  expect(section).toBeTruthy();
  return section!;
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
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
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

afterEach(() => cleanup());

describe('AdminOperations', () => {
  it('checks both Harpa services and links to every active provider console', async () => {
    const fetchMock = mockOperationsFetch();

    render(<AdminOperations />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Service monitoring' }),
    ).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        'https://api.example.test/healthz',
        'https://api.example.test/readyz',
        'https://api.example.test/admin/readyz',
        '/_cf-pages-deployment.json',
        'https://api.example.test/admin/operations/neon',
        'https://api.example.test/admin/operations/r2-capacity',
      ]),
    );

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

  it('uses four fixed deployment reads on load and shared Refresh without polling', async () => {
    const fetchMock = mockOperationsFetch();
    const user = userEvent.setup();
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
    ] as const;

    render(<AdminOperations />);

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
    const intervalSpy = vi.spyOn(globalThis, 'setInterval');
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    for (const { url } of expectedRequests) {
      expect(deploymentRequests(fetchMock, url)).toHaveLength(1);
    }
    expect(intervalSpy).not.toHaveBeenCalled();
    intervalSpy.mockRestore();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      for (const { url } of expectedRequests) {
        expect(deploymentRequests(fetchMock, url)).toHaveLength(2);
      }
    });
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
    expect(fetchMock).toHaveBeenCalledTimes(6);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(12));
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
    expect(fetchMock).toHaveBeenCalledTimes(12);
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
    expect(fetchMock).toHaveBeenCalledTimes(12);
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
    for (const value of forbiddenValues) expect(renderedText).not.toContain(value);
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    expect(diagnosticRequests(fetchMock)).toHaveLength(0);
  });

  it('keeps shared Refresh read-only and preserves the idle diagnostic state', async () => {
    const fetchMock = mockOperationsFetch(emptyInventory);
    const user = userEvent.setup();

    render(<AdminOperations />);

    const diagnosticSection = await getDiagnosticSection();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(12));

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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
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
