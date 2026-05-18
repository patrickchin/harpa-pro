/**
 * Behaviour tests for `reportsScreen` + `reportHomeScreen`
 * (TUI-nav.5). Drives the screens with `scriptedPrompter` and stubs
 * `globalThis.fetch` for the underlying leaves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runScreen } from '../../../tui/screen.js';
import { reportsScreen } from '../../../tui/screens/reports.js';
import { reportHomeScreen } from '../../../tui/screens/report-home.js';
import { scriptedPrompter } from '../../../tui/prompter.js';
import { createSession } from '../../../tui/session.js';
import { memoryCredentialsStore } from '../../../tui/credentials.js';

const ENV = { HARPA_API_URL: 'http://api.example', HARPA_DEBUG: '0' as const };

function authedSession(opts?: { withReport?: boolean }) {
  const s = createSession({
    env: ENV,
    credentials: memoryCredentialsStore(),
    initialState: { kind: 'authed', user: { userId: 'u1' } },
    token: 'tok',
  });
  s.setCurrentProject({ id: 'demo', slug: 'demo', name: 'Demo' });
  if (opts?.withReport) {
    s.setCurrentReport({ projectSlug: 'demo', number: 12, status: 'draft' });
  }
  return s;
}

function makeFetch(routes: Record<string, unknown>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    for (const [pat, body] of Object.entries(routes)) {
      if (url.includes(pat)) {
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

describe('reportsScreen', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('shows empty state', async () => {
    globalThis.fetch = makeFetch({ '/projects/demo/reports': { items: [], nextCursor: null } });
    const prompter = scriptedPrompter([{ kind: 'select', answer: '__back__' }]);
    await runScreen(prompter, authedSession(), reportsScreen());
    const notes = prompter.transcript.filter((t) => t.kind === 'note');
    expect(JSON.stringify(notes[0])).toContain('No reports');
  });

  it('lists reports in header count', async () => {
    globalThis.fetch = makeFetch({
      '/projects/demo/reports': {
        items: [
          { id: 'r12', number: 12, projectId: 'demo', status: 'draft', visitDate: '2024-05-04', createdAt: '2024-05-01', updatedAt: '2024-05-01' },
          { id: 'r11', number: 11, projectId: 'demo', status: 'finalized', visitDate: null, createdAt: '2024-04-01', updatedAt: '2024-04-01' },
        ],
        nextCursor: null,
      },
    });
    const prompter = scriptedPrompter([{ kind: 'select', answer: '__back__' }]);
    await runScreen(prompter, authedSession(), reportsScreen());
    const notes = prompter.transcript.filter((t) => t.kind === 'note');
    expect(JSON.stringify(notes[0])).toContain('2 reports');
  });

  it('onExit clears currentReport', async () => {
    globalThis.fetch = makeFetch({ '/projects/demo/reports': { items: [], nextCursor: null } });
    const session = authedSession({ withReport: true });
    const prompter = scriptedPrompter([{ kind: 'select', answer: '__back__' }]);
    await runScreen(prompter, session, reportsScreen());
    if (session.state.kind !== 'authed') throw new Error('unreachable');
    expect(session.state.currentReport).toBeUndefined();
  });
});

describe('reportHomeScreen status-aware actions', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('pops when report has gone (404)', async () => {
    globalThis.fetch = makeFetch({});
    const prompter = scriptedPrompter([]);
    await runScreen(prompter, authedSession({ withReport: true }), reportHomeScreen());
    expect(prompter.transcript.filter((t) => t.kind === 'select')).toHaveLength(0);
  });

  it('renders draft status header', async () => {
    globalThis.fetch = makeFetch({
      '/projects/demo/reports/12': {
        id: 'r12', number: 12, projectId: 'demo', status: 'draft',
        visitDate: '2024-05-04', createdAt: '2024-05-01', updatedAt: '2024-05-01',
      },
    });
    const prompter = scriptedPrompter([{ kind: 'select', answer: '__back__' }]);
    await runScreen(prompter, authedSession({ withReport: true }), reportHomeScreen());
    const notes = prompter.transcript.filter((t) => t.kind === 'note');
    expect(JSON.stringify(notes[0])).toContain('status');
    expect(JSON.stringify(notes[0])).toContain('draft');
  });
});
