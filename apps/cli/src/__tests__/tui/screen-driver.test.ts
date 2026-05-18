/**
 * Tests for the `runScreen` driver (TUI-nav.2).
 *
 * Uses a synthetic Screen with a counting `header()` to assert:
 *   - header is fetched once on entry, only re-fetched on
 *     `refreshHeader: true`
 *   - `header() === undefined` pops back immediately
 *   - back / cancel both exit the loop
 *   - `onExit` is called
 *   - child screens run via `kind: 'screen'`
 *   - flow actions can mutate state and trigger refresh
 */
import { describe, it, expect, vi } from 'vitest';
import { runScreen, type Screen, type ScreenAction, refreshAction } from '../../tui/screen.js';
import { scriptedPrompter } from '../../tui/prompter.js';
import { createSession } from '../../tui/session.js';
import { memoryCredentialsStore } from '../../tui/credentials.js';

const env = { HARPA_API_URL: 'http://api.example', HARPA_DEBUG: '0' as const };

function authedSession() {
  return createSession({
    env,
    credentials: memoryCredentialsStore(),
    initialState: { kind: 'authed', user: { userId: 'u1' } },
    token: 'tok',
  });
}

interface Counters {
  headerCalls: number;
  flowRuns: number;
  exits: number;
}

function makeScreen(opts: {
  counters: Counters;
  actions: () => ReadonlyArray<ScreenAction>;
  headerReturn?: () => { title: string; lines: string[] } | undefined;
  id?: string;
}): Screen {
  return {
    id: opts.id ?? 'test-screen',
    async header() {
      opts.counters.headerCalls++;
      if (opts.headerReturn) return opts.headerReturn();
      return { title: 'Test', lines: [`render ${opts.counters.headerCalls}`] };
    },
    actions: opts.actions,
    onExit() {
      opts.counters.exits++;
    },
  };
}

describe('runScreen driver', () => {
  it('fetches header once on entry and exits on back', async () => {
    const counters: Counters = { headerCalls: 0, flowRuns: 0, exits: 0 };
    const screen = makeScreen({
      counters,
      actions: () => [
        { kind: 'flow', label: 'No-op', run: async () => { counters.flowRuns++; } },
      ],
    });
    const prompter = scriptedPrompter([
      { kind: 'select', answer: '__back__' },
    ]);
    await runScreen(prompter, authedSession(), screen);
    expect(counters.headerCalls).toBe(1);
    expect(counters.flowRuns).toBe(0);
    expect(counters.exits).toBe(1);
  });

  it('does not refresh header when action lacks refreshHeader', async () => {
    const counters: Counters = { headerCalls: 0, flowRuns: 0, exits: 0 };
    const screen = makeScreen({
      counters,
      actions: () => [
        { kind: 'flow', label: 'Tick', run: async () => { counters.flowRuns++; } },
      ],
    });
    const prompter = scriptedPrompter([
      { kind: 'select', answer: '0' },
      { kind: 'select', answer: '__back__' },
    ]);
    await runScreen(prompter, authedSession(), screen);
    expect(counters.flowRuns).toBe(1);
    expect(counters.headerCalls).toBe(1);
  });

  it('refreshes header when action declares refreshHeader', async () => {
    const counters: Counters = { headerCalls: 0, flowRuns: 0, exits: 0 };
    const screen = makeScreen({
      counters,
      actions: () => [refreshAction('Refresh')],
    });
    const prompter = scriptedPrompter([
      { kind: 'select', answer: '0' },
      { kind: 'select', answer: '__back__' },
    ]);
    await runScreen(prompter, authedSession(), screen);
    expect(counters.headerCalls).toBe(2);
  });

  it('pops when header returns undefined', async () => {
    const counters: Counters = { headerCalls: 0, flowRuns: 0, exits: 0 };
    const screen = makeScreen({
      counters,
      actions: () => [],
      headerReturn: () => undefined,
    });
    const prompter = scriptedPrompter([]);
    await runScreen(prompter, authedSession(), screen);
    expect(counters.headerCalls).toBe(1);
    expect(counters.exits).toBe(1);
  });

  it('cancel at menu exits like back', async () => {
    const counters: Counters = { headerCalls: 0, flowRuns: 0, exits: 0 };
    const screen = makeScreen({
      counters,
      actions: () => [
        { kind: 'flow', label: 'X', run: async () => {} },
      ],
    });
    const { CANCEL } = await import('../../tui/prompter.js');
    const prompter = scriptedPrompter([
      { kind: 'select', answer: CANCEL },
    ]);
    await runScreen(prompter, authedSession(), screen);
    expect(counters.exits).toBe(1);
  });

  it('drills into a child screen and returns', async () => {
    const counters: Counters = { headerCalls: 0, flowRuns: 0, exits: 0 };
    const childCounters: Counters = { headerCalls: 0, flowRuns: 0, exits: 0 };
    const child = makeScreen({
      counters: childCounters,
      id: 'child',
      actions: () => [],
    });
    const parent = makeScreen({
      counters,
      id: 'parent',
      actions: () => [
        { kind: 'screen', label: 'Open child', open: () => child },
      ],
    });
    const prompter = scriptedPrompter([
      { kind: 'select', answer: '0' },             // open child
      { kind: 'select', answer: '__back__' },      // exit child
      { kind: 'select', answer: '__back__' },      // exit parent
    ]);
    await runScreen(prompter, authedSession(), parent);
    expect(childCounters.headerCalls).toBe(1);
    expect(childCounters.exits).toBe(1);
    expect(counters.exits).toBe(1);
  });

  it('skips confirmed leaf when user declines', async () => {
    // We can't easily test full leaf execution without a registry leaf,
    // but we can assert the confirm path short-circuits cleanly.
    const counters: Counters = { headerCalls: 0, flowRuns: 0, exits: 0 };
    const action: ScreenAction = {
      kind: 'leaf',
      label: 'Delete',
      cittyPath: ['nope', 'nope'],
      confirm: { label: 'Sure?' },
    };
    const screen = makeScreen({ counters, actions: () => [action] });
    const prompter = scriptedPrompter([
      { kind: 'select', answer: '0' },
      { kind: 'confirm', answer: false },
      { kind: 'select', answer: '__back__' },
    ]);
    const errSpy = vi.fn();
    prompter.log.error = errSpy;
    await runScreen(prompter, authedSession(), screen);
    // No leaf lookup attempted because user said no.
    expect(errSpy).not.toHaveBeenCalled();
    expect(counters.exits).toBe(1);
  });
});
