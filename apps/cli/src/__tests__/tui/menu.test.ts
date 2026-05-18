import { describe, it, expect } from 'vitest';
import { runTui } from '../../tui/index.js';
import { createSession } from '../../tui/session.js';
import { scriptedPrompter } from '../../tui/prompter.js';

const env = { HARPA_API_URL: 'http://localhost:9999', HARPA_DEBUG: '0' as const };

describe('TUI menu navigation', () => {
  it('opens the main menu and exits cleanly on quit', async () => {
    const prompter = scriptedPrompter([{ kind: 'select', answer: '__quit__' }]);
    await runTui(prompter, createSession(env));
    expect(prompter.exhausted()).toBe(true);
  });

  it('exits when the user cancels at the main menu (Ctrl-C)', async () => {
    const prompter = scriptedPrompter([
      { kind: 'select', answer: Symbol.for('harpa-cli/tui/cancel') as never },
    ]);
    await runTui(prompter, createSession(env));
    expect(prompter.exhausted()).toBe(true);
  });

  it('navigates main → group → back → main → quit', async () => {
    const prompter = scriptedPrompter([
      { kind: 'select', answer: 'health' },         // group
      { kind: 'select', answer: '__back__' },        // back out of group
      { kind: 'select', answer: '__quit__' },        // quit
    ]);
    await runTui(prompter, createSession(env));
    expect(prompter.exhausted()).toBe(true);
  });

  it('cancelling at the group menu returns to main menu', async () => {
    const prompter = scriptedPrompter([
      { kind: 'select', answer: 'health' },
      { kind: 'select', answer: Symbol.for('harpa-cli/tui/cancel') as never },
      { kind: 'select', answer: '__quit__' },
    ]);
    await runTui(prompter, createSession(env));
    expect(prompter.exhausted()).toBe(true);
  });
});
