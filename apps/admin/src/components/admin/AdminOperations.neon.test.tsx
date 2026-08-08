// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
];

const observedAt = '2026-08-08T05:30:00.000Z';
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function successfulResponse(url: string): Response {
  if (url.endsWith('/readyz')) return new Response(null, { status: 200 });
  if (url === 'https://api.example.test/admin/operations/neon') {
    return jsonResponse(availableInventory);
  }
  if (url.includes('/commits?sha=dev&per_page=1')) return jsonResponse(githubCommits.dev);
  if (url.includes('/commits?sha=main&per_page=1')) return jsonResponse(githubCommits.main);
  if (url.includes('/pulls?state=open&sort=updated&direction=desc&per_page=30')) {
    return jsonResponse(githubPulls);
  }
  throw new Error(`Unexpected fetch: ${url}`);
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

describe('AdminOperations Neon forward-port', () => {
  it('keeps the GitHub snapshot while rendering the bounded Neon inventory', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      successfulResponse(String(input)),
    );

    render(<AdminOperations />);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'GitHub public repository' }),
    ).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 2, name: 'Neon inventory' })).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        'https://api.example.test/readyz',
        'https://api.example.test/admin/readyz',
        'https://api.example.test/admin/operations/neon',
        'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=dev&per_page=1',
        'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=main&per_page=1',
        'https://api.github.com/repos/patrickchin/harpa-pro/pulls?state=open&sort=updated&direction=desc&per_page=30',
      ]),
    );

    const inventorySection = screen
      .getByRole('heading', { level: 2, name: 'Neon inventory' })
      .closest('section')!;
    expect(within(inventorySection).getByText('1 visible project')).toBeTruthy();
    expect(inventorySection.querySelector(`time[datetime="${observedAt}"]`)).toBeTruthy();
    const projectCard = within(inventorySection)
      .getByRole('heading', { level: 3, name: 'Application database' })
      .closest('article')!;
    expect(within(projectCard).getByText('147 branches')).toBeTruthy();
    expect(within(projectCard).getByText('2 active branch details returned.')).toBeTruthy();
    expect(within(projectCard).getByText('br_main')).toBeTruthy();
    expect(within(projectCard).getByText('br_dev')).toBeTruthy();

    expect(
      screen.getByRole('list', { name: 'Open pull requests' }),
    ).toBeTruthy();
  });

  it('returns to the signed-out guard when the Neon observer rejects an expired session', async () => {
    authMock.getSession.mockResolvedValueOnce(adminSession).mockResolvedValueOnce(null);
    let requestCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.example.test/admin/operations/neon') {
        requestCount += 1;
        return requestCount === 1 ? new Response(null, { status: 401 }) : jsonResponse(availableInventory);
      }
      return successfulResponse(url);
    });

    render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Neon inventory' })).toBeNull();
  });
});
