/**
 * Tests for the Account flow (TUI-app.5).
 *
 * We don't drive every leaf — those are tested by the existing
 * integration tests. We assert: (a) the flow boots without throwing
 * (every cittyPath resolves against the real registry — guards
 * against label drift), (b) selecting "back" returns immediately.
 */
import { describe, it, expect } from 'vitest';
import { accountFlow } from '../../../tui/flows/account.js';
import { scriptedPrompter } from '../../../tui/prompter.js';
import { createSession } from '../../../tui/session.js';
import { memoryCredentialsStore } from '../../../tui/credentials.js';

const ENV = { HARPA_API_URL: 'http://api.example', HARPA_DEBUG: '0' as const };
const USER = { userId: 'u1' };

describe('accountFlow', () => {
  it('opens the submenu and exits on "back"', async () => {
    const session = createSession({
      env: ENV,
      credentials: memoryCredentialsStore(),
      initialState: { kind: 'authed', user: USER },
      token: 'tok',
    });
    const prompter = scriptedPrompter([
      { kind: 'select', answer: '__back__' },
    ]);
    const result = await accountFlow.run({ prompter, session });
    expect(result).toEqual({ kind: 'stay' });
  });

  it('is only visible while authed', () => {
    expect(accountFlow.visibleIn).toEqual(['authed']);
  });
});
