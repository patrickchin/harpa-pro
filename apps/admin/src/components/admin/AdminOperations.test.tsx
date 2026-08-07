// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

function successfulResponse(url: string): Response {
  if (url.endsWith('/readyz')) return new Response(null, { status: 200 });
  if (url.includes('/commits?sha=dev&per_page=1')) return githubJson(githubCommits.dev, 59);
  if (url.includes('/commits?sha=main&per_page=1')) return githubJson(githubCommits.main, 58);
  if (url.includes('/pulls?state=open&sort=updated&direction=desc&per_page=30')) {
    return githubJson(githubPulls, 57);
  }
  throw new Error(`Unexpected fetch: ${url}`);
}

function mockSuccessfulFetch() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => successfulResponse(String(input)));
}

beforeEach(() => {
  vi.restoreAllMocks();
  authMock.getSession.mockReset();
  authMock.getSession.mockResolvedValue(adminSession);
  authMock.logout.mockReset();
  authMock.logout.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe('AdminOperations', () => {
  it('checks Harpa services and shows a bounded public GitHub snapshot', async () => {
    const fetchMock = mockSuccessfulFetch();

    render(<AdminOperations />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Service monitoring' }),
    ).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.example.test/readyz',
      'https://api.example.test/admin/readyz',
      'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=dev&per_page=1',
      'https://api.github.com/repos/patrickchin/harpa-pro/commits?sha=main&per_page=1',
      'https://api.github.com/repos/patrickchin/harpa-pro/pulls?state=open&sort=updated&direction=desc&per_page=30',
    ]);

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
      return successfulResponse(url);
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));
    expect(await within(productCard).findByText('Healthy')).toBeTruthy();
    expect(await within(adminCard).findByText('Healthy')).toBeTruthy();
  });

  it('keeps repository links usable when the browser GitHub rate limit is exhausted', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/readyz')) return new Response(null, { status: 200 });
      if (url.includes('api.github.com')) {
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
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not expose service links without an admin session and supports sign-out', async () => {
    authMock.getSession.mockResolvedValueOnce(null).mockResolvedValueOnce(adminSession);
    mockSuccessfulFetch();
    const user = userEvent.setup();
    const view = render(<AdminOperations />);

    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open dashboard ↗' })).toBeNull();

    view.unmount();
    render(<AdminOperations />);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(authMock.logout).toHaveBeenCalledOnce();
    expect(await screen.findByText('Admin sign-in required.')).toBeTruthy();
  });
});
