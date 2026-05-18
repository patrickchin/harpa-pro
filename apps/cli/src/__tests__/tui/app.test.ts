/**
 * Unit tests for the state-machine driver (`tui/app.ts`).
 *
 * Asserts that the visible menu set is filtered by `flow.visibleIn`
 * and that selecting Quit (or cancelling at the top-level select)
 * exits the loop. Per-flow behaviour lives in the per-flow tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { runApp } from '../../tui/app.js';
import type { Flow, FlowResult } from '../../tui/flow.js';
import { scriptedPrompter } from '../../tui/prompter.js';
import { createSession } from '../../tui/session.js';
import { memoryCredentialsStore, type StoredCredentials } from '../../tui/credentials.js';

const ENV = { HARPA_API_URL: 'http://api.example', HARPA_DEBUG: '0' as const };
const USER = { userId: 'u1', displayName: 'Alice' };
const CREDS: StoredCredentials = {
  version: 1,
  apiUrl: 'http://api.example',
  token: 'tok',
  userId: 'u1',
  savedAt: '2025-01-01T00:00:00.000Z',
};

function makeFlow(id: string, visibleIn: Flow['visibleIn'], run?: () => FlowResult): Flow {
  return {
    id,
    label: id,
    visibleIn,
    run: vi.fn(async () => run ? run() : { kind: 'stay' as const }),
  };
}

describe('runApp', () => {
  it('only shows flows whose visibleIn includes the current state', async () => {
    const authFlow = makeFlow('sign-in', ['auth']);
    const authedFlow = makeFlow('account', ['authed']);
    const everywhere = makeFlow('set-url', ['config', 'auth', 'authed']);
    const session = createSession({
      env: ENV,
      credentials: memoryCredentialsStore(),
      initialState: { kind: 'auth', reason: 'never' },
    });
    // Picking 'account' (only authed) should silently skip — the
    // driver's `visible.find` returns undefined and loops. We then
    // pick a visible flow + quit.
    const prompter = scriptedPrompter([
      { kind: 'select', answer: 'account' },
      { kind: 'select', answer: 'sign-in' },
      { kind: 'select', answer: '__quit__' },
    ]);

    await runApp(prompter, session, { flows: [authFlow, authedFlow, everywhere] });

    expect((authFlow.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect((authedFlow.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect((everywhere.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('runs the selected flow and re-renders until quit', async () => {
    const a = makeFlow('a', ['authed']);
    const session = createSession({
      env: ENV,
      credentials: memoryCredentialsStore(CREDS),
      initialState: { kind: 'authed', user: USER },
      token: 'tok',
    });
    const prompter = scriptedPrompter([
      { kind: 'select', answer: 'a' },
      { kind: 'select', answer: 'a' },
      { kind: 'select', answer: '__quit__' },
    ]);
    await runApp(prompter, session, { flows: [a] });
    expect((a.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('exits when the user cancels the top-level select', async () => {
    const a = makeFlow('a', ['authed']);
    const session = createSession({
      env: ENV,
      credentials: memoryCredentialsStore(),
      initialState: { kind: 'authed', user: USER },
    });
    const prompter = scriptedPrompter([
      { kind: 'select', answer: Symbol.for('harpa-cli/tui/cancel') as never },
    ]);
    await runApp(prompter, session, { flows: [a] });
    expect((a.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('re-renders the menu after a state transition triggered by a flow', async () => {
    const signIn: Flow = {
      id: 'sign-in', label: 'sign-in', visibleIn: ['auth'],
      run: vi.fn(async ({ session }) => {
        await session.setAuth(CREDS, USER);
        return { kind: 'stay' as const };
      }),
    };
    const account = makeFlow('account', ['authed']);
    const session = createSession({
      env: ENV,
      credentials: memoryCredentialsStore(),
      initialState: { kind: 'auth', reason: 'never' },
    });
    const prompter = scriptedPrompter([
      { kind: 'select', answer: 'sign-in' },
      { kind: 'select', answer: 'account' },
      { kind: 'select', answer: '__quit__' },
    ]);
    await runApp(prompter, session, { flows: [signIn, account] });
    expect(session.state.kind).toBe('authed');
    expect((account.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
