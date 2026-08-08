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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

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

function mockDiagnosticFetch(
  diagnostic: () => Response | Promise<Response>,
  inventory: unknown = availableInventory,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === 'https://api.example.test/admin/operations/report-generate') {
      return diagnostic();
    }
    return successfulResponse(url, inventory);
  });
}

function diagnosticRequests(fetchMock: MockInstance<typeof globalThis.fetch>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === 'https://api.example.test/admin/operations/report-generate',
  );
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

async function renderAndRunDiagnostic(body: unknown, status = 200) {
  const fetchMock = mockDiagnosticFetch(() => jsonResponse(body, status));
  const user = userEvent.setup();
  render(<AdminOperations />);
  const section = await getDiagnosticSection();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
  await user.click(within(section).getByRole('button', { name: 'Run diagnostic' }));
  return { fetchMock, section };
}

function successfulResponse(url: string, inventory: unknown = availableInventory): Response {
  if (url === 'https://api.example.test/admin/operations/neon') {
    return jsonResponse(inventory);
  }
  if (url.endsWith('/readyz')) return new Response(null, { status: 200 });
  if (url.includes('/commits?sha=dev&per_page=1')) return githubJson(githubCommits.dev, 59);
  if (url.includes('/commits?sha=main&per_page=1')) return githubJson(githubCommits.main, 58);
  if (url.includes('/pulls?state=open&sort=updated&direction=desc&per_page=30')) {
    return githubJson(githubPulls, 57);
  }
  throw new Error(`Unexpected fetch: ${url}`);
}

function mockSuccessfulFetch() {
  return mockOperationsFetch();
}

function mockOperationsFetch(inventory: unknown = availableInventory) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => successfulResponse(String(input), inventory));
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
  it('checks Harpa services, shows GitHub and Neon status, and links every provider console', async () => {
    const fetchMock = mockSuccessfulFetch();

    render(<AdminOperations />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Service monitoring' }),
    ).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.example.test/readyz',
      'https://api.example.test/admin/readyz',
      'https://api.example.test/admin/operations/neon',
      'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=dev&per_page=1',
      'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=main&per_page=1',
      'https://api.github.com/repos/patrickchin/harpa-pro/pulls?state=open&sort=updated&direction=desc&per_page=30',
    ]);
    const githubCalls = fetchMock.mock.calls.filter(
      ([url]) => new URL(String(url)).origin === 'https://api.github.com',
    );
    expect(githubCalls).toHaveLength(3);
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
    expect(screen.getByTestId('github-pr-scroller').className).toContain('overflow-y-auto');
    expect(screen.getByRole('heading', { level: 2, name: 'Neon inventory' })).toBeTruthy();

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

  it('reports individual readiness failures and refreshes only when asked', async () => {
    let productChecks = 0;
    let adminChecks = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/readyz') {
        productChecks += 1;
        return new Response(null, { status: productChecks === 1 ? 503 : 200 });
      }
      if (url === 'https://api.example.test/admin/readyz') {
        adminChecks += 1;
        if (adminChecks === 1) throw new Error('offline');
        return new Response(null, { status: 200 });
      }
      return successfulResponse(url, emptyInventory);
    });
    const user = userEvent.setup();

    render(<AdminOperations />);

    const productCard = (
      await screen.findByRole('heading', {
        level: 3,
        name: 'Product API and database',
      })
    ).closest('article')!;
    const adminCard = screen
      .getByRole('heading', { level: 3, name: 'Admin API and database' })
      .closest('article')!;
    expect(await within(productCard).findByText('Unavailable')).toBeTruthy();
    expect(await within(adminCard).findByText('Unavailable')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(12));
    expect(await within(productCard).findByText('Healthy')).toBeTruthy();
    expect(await within(adminCard).findByText('Healthy')).toBeTruthy();
  });

  it('keeps repository links usable when the browser GitHub rate limit is exhausted', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/readyz')) return new Response(null, { status: 200 });
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (new URL(url).origin === 'https://api.github.com') {
        return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
          status: 403,
          headers: {
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': '1786140366',
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<AdminOperations />);

    expect(await screen.findByText('GitHub rate limit reached for this browser/IP.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open repository ↗' }).getAttribute('href')).toBe(
      'https://github.com/patrickchin/harpa-pro',
    );
    expect(screen.getByRole('link', { name: 'Open pull requests ↗' }).getAttribute('href')).toBe(
      'https://github.com/patrickchin/harpa-pro/pulls',
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('identifies GitHub secondary throttling and provides retry guidance', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/readyz')) return new Response(null, { status: 200 });
      if (url === 'https://api.example.test/admin/operations/neon') {
        return jsonResponse(emptyInventory);
      }
      if (new URL(url).origin === 'https://api.github.com') {
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
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<AdminOperations />);

    expect(
      await screen.findByText('GitHub temporarily throttled requests for this browser/IP.'),
    ).toBeTruthy();
    expect(screen.getByText('Retry after 60 seconds.')).toBeTruthy();
    expect(screen.getByText('12 of 60 requests remain')).toBeTruthy();
  });

  it('does not expose signed-in operations without an admin session and supports sign-out', async () => {
    authMock.getSession.mockResolvedValueOnce(null).mockResolvedValueOnce(adminSession);
    const fetchMock = mockOperationsFetch(emptyInventory);
    const user = userEvent.setup();
    const view = render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open dashboard ↗' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Neon inventory' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    view.unmount();
    render(<AdminOperations />);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(authMock.logout).toHaveBeenCalledOnce();
    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Neon inventory' })).toBeNull();
  });

  it('shows a distinct loading state until the Neon observation arrives', async () => {
    let resolveInventory!: (response: Response) => void;
    const inventoryResponse = new Promise<Response>((resolve) => {
      resolveInventory = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/neon') return inventoryResponse;
      if (
        url === 'https://api.example.test/readyz' ||
        url === 'https://api.example.test/admin/readyz'
      ) {
        return new Response(null, { status: 200 });
      }
      return successfulResponse(url);
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
      if (
        url === 'https://api.example.test/readyz' ||
        url === 'https://api.example.test/admin/readyz'
      ) {
        return new Response(null, { status: 200 });
      }
      return successfulResponse(url);
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
      if (
        url === 'https://api.example.test/readyz' ||
        url === 'https://api.example.test/admin/readyz'
      ) {
        return new Response(null, { status: 200 });
      }
      return successfulResponse(url);
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
