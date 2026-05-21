/**
 * Behaviour tests for `projectsScreen` and `projectHomeScreen`
 * (TUI-nav.3). Stubs `globalThis.fetch` to feed canned API responses
 * to the underlying `projects.list` / `projects.get` leaves and
 * drives the screen with `scriptedPrompter`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runScreen } from '../../../tui/screen.js';
import { projectsScreen } from '../../../tui/screens/projects.js';
import { projectHomeScreen } from '../../../tui/screens/project-home.js';
import { scriptedPrompter } from '../../../tui/prompter.js';
import { createSession } from '../../../tui/session.js';
import { memoryCredentialsStore } from '../../../tui/credentials.js';

const ENV = { HARPA_API_URL: 'http://api.example', HARPA_DEBUG: '0' as const };

const PROJECTS_PAGE = {
  items: [
    {
      id: 'demo',
      name: 'Demo Project',
      clientName: 'Acme',
      address: null,
      ownerId: 'u1',
      myRole: 'owner',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-02',
      stats: { totalReports: 3, drafts: 1, lastReportAt: '2024-05-01' },
    },
  ],
  nextCursor: null,
};

function makeFetch(routes: Record<string, unknown>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    for (const [pattern, body] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return new Response(JSON.stringify({ error: { code: 'not_found' } }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function authedSession() {
  return createSession({
    env: ENV,
    credentials: memoryCredentialsStore(),
    initialState: { kind: 'authed', user: { userId: 'u1' } },
    token: 'tok',
  });
}

describe('projectsScreen', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renders project count header and exits on back', async () => {
    globalThis.fetch = makeFetch({ '/projects': PROJECTS_PAGE });
    const session = authedSession();
    const prompter = scriptedPrompter([{ kind: 'select', answer: '__back__' }]);

    await runScreen(prompter, session, projectsScreen());

    const notes = prompter.transcript.filter((t) => t.kind === 'note');
    expect(notes).toHaveLength(1);
    expect(JSON.stringify(notes[0])).toContain('1 project');
  });

  it('renders placeholder when API is unreachable', async () => {
    globalThis.fetch = (async () => {
      throw new Error('econnrefused');
    }) as unknown as typeof fetch;
    const session = authedSession();
    const prompter = scriptedPrompter([{ kind: 'select', answer: '__back__' }]);

    await runScreen(prompter, session, projectsScreen());

    const notes = prompter.transcript.filter((t) => t.kind === 'note');
    expect(JSON.stringify(notes[0])).toContain('unable to load');
  });

  it('clears currentProject on exit', async () => {
    globalThis.fetch = makeFetch({ '/projects': PROJECTS_PAGE });
    const session = authedSession();
    session.setCurrentProject({ id: 'demo', slug: 'demo', name: 'Demo' });
    const prompter = scriptedPrompter([{ kind: 'select', answer: '__back__' }]);

    await runScreen(prompter, session, projectsScreen());

    if (session.state.kind !== 'authed') throw new Error('unreachable');
    expect(session.state.currentProject).toBeUndefined();
  });
  it('Open project flow picks a project from the viewport and opens project-home', async () => {
    globalThis.fetch = makeFetch({
      '/projects/demo': PROJECTS_PAGE.items[0],
      '/projects': PROJECTS_PAGE,
    });
    const session = authedSession();
    // Sequence:
    //   1. select "Open project" from the action menu (index 0)
    //   2. viewportSelect → pick 'demo'
    //   3. project-home action menu → __back__
    //   4. projects screen action menu → __back__
    const prompter = scriptedPrompter([
      { kind: 'select', answer: '0' },
      { kind: 'viewportSelect', answer: 'demo' },
      { kind: 'select', answer: '__back__' },
      { kind: 'select', answer: '__back__' },
    ]);

    await runScreen(prompter, session, projectsScreen());

    const vs = prompter.transcript.filter((t) => t.kind === 'viewportSelect');
    expect(vs).toHaveLength(1);
    expect(JSON.stringify(vs[0])).toContain('demo');
    // After the screen exits, currentProject is cleared by onExit.
    if (session.state.kind !== 'authed') throw new Error('unreachable');
    expect(session.state.currentProject).toBeUndefined();
  });

  it('Open project flow warns when there are no projects', async () => {
    globalThis.fetch = makeFetch({ '/projects': { items: [], nextCursor: null } });
    const session = authedSession();
    const prompter = scriptedPrompter([
      { kind: 'select', answer: '0' },           // Open project
      { kind: 'select', answer: '__back__' },    // back out
    ]);

    await runScreen(prompter, session, projectsScreen());

    const warns = prompter.transcript.filter((t) => t.kind === 'log.warn');
    expect(warns).toHaveLength(1);
    expect(JSON.stringify(warns[0])).toContain('No projects to open');
    // No viewportSelect prompt should have been issued.
    expect(prompter.transcript.filter((t) => t.kind === 'viewportSelect')).toHaveLength(0);
  });
});

describe('projectHomeScreen', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('pops when project no longer exists (header undefined)', async () => {
    globalThis.fetch = makeFetch({}); // every fetch 404s
    const session = authedSession();
    session.setCurrentProject({ id: 'gone', slug: 'gone', name: 'Gone' });
    const prompter = scriptedPrompter([]); // no actions — driver should pop immediately

    await runScreen(prompter, session, projectHomeScreen());

    // We never reach a select, so no transcript entries other than maybe nothing.
    const selects = prompter.transcript.filter((t) => t.kind === 'select');
    expect(selects).toHaveLength(0);
  });

  it('renders project info from canonical fixture', async () => {
    globalThis.fetch = makeFetch({
      '/projects/demo': PROJECTS_PAGE.items[0],
    });
    const session = authedSession();
    session.setCurrentProject({ id: 'demo', slug: 'demo', name: 'Demo' });
    const prompter = scriptedPrompter([{ kind: 'select', answer: '__back__' }]);

    await runScreen(prompter, session, projectHomeScreen());

    const notes = prompter.transcript.filter((t) => t.kind === 'note');
    expect(notes).toHaveLength(1);
    const note = JSON.stringify(notes[0]);
    expect(note).toContain('Demo Project');
    expect(note).toContain('reports');
  });
});
