/**
 * Behaviour tests for `membersScreen` (TUI-nav.4).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runScreen } from '../../../tui/screen.js';
import { membersScreen } from '../../../tui/screens/members.js';
import { scriptedPrompter } from '../../../tui/prompter.js';
import { createSession } from '../../../tui/session.js';
import { memoryCredentialsStore } from '../../../tui/credentials.js';

const ENV = { HARPA_API_URL: 'http://api.example', HARPA_DEBUG: '0' as const };

function authedSession(withProject = true) {
  const s = createSession({
    env: ENV,
    credentials: memoryCredentialsStore(),
    initialState: { kind: 'authed', user: { userId: 'u1' } },
    token: 'tok',
  });
  if (withProject) s.setCurrentProject({ id: 'demo', slug: 'demo', name: 'Demo' });
  return s;
}

function fetchOk(body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
  ) as unknown as typeof fetch;
}

describe('membersScreen', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renders empty state when no members', async () => {
    globalThis.fetch = fetchOk({ items: [] });
    const session = authedSession();
    const prompter = scriptedPrompter([{ kind: 'select', answer: '__back__' }]);
    await runScreen(prompter, session, membersScreen());
    const notes = prompter.transcript.filter((t) => t.kind === 'note');
    expect(JSON.stringify(notes[0])).toContain('No members');
  });

  it('lists members in header count', async () => {
    globalThis.fetch = fetchOk({
      items: [
        { phone: '+15551234567', displayName: 'Alice', role: 'owner' },
        { phone: '+15559876543', displayName: 'Bob', role: 'editor' },
      ],
    });
    const session = authedSession();
    const prompter = scriptedPrompter([{ kind: 'select', answer: '__back__' }]);
    await runScreen(prompter, session, membersScreen());
    const notes = prompter.transcript.filter((t) => t.kind === 'note');
    expect(JSON.stringify(notes[0])).toContain('2 members');
  });

  it('returns header undefined when no currentProject', async () => {
    globalThis.fetch = fetchOk({});
    const session = authedSession(false);
    const prompter = scriptedPrompter([]);
    await runScreen(prompter, session, membersScreen());
    expect(prompter.transcript.filter((t) => t.kind === 'note')).toHaveLength(0);
  });
});
