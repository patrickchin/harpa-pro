import { describe, it, expect } from 'vitest';
import { mainLoop } from '../../tui/menu.js';
import { createSession } from '../../tui/session.js';
import { scriptedPrompter } from '../../tui/prompter.js';

const env = { HARPA_API_URL: 'http://old.example', HARPA_DEBUG: '0' as const };

describe('TUI — Set API URL', () => {
  it('updates the session URL via the "Set API URL" main-menu entry', async () => {
    const session = createSession(env);
    const prompter = scriptedPrompter([
      { kind: 'select', answer: '__set_api_url__' },
      { kind: 'text', answer: 'http://new.example' },
      { kind: 'select', answer: '__quit__' },
    ]);

    await mainLoop(prompter, session);

    expect(session.effectiveEnv().HARPA_API_URL).toBe('http://new.example');
    expect(prompter.exhausted()).toBe(true);
    const success = prompter.transcript.find((t) => t.kind === 'log.success');
    expect(String(success?.payload)).toContain('http://new.example');
  });

  it('keeps the existing URL when the user cancels the text prompt', async () => {
    const session = createSession(env);
    const prompter = scriptedPrompter([
      { kind: 'select', answer: '__set_api_url__' },
      { kind: 'text', answer: Symbol.for('harpa-cli/tui/cancel') as never },
      { kind: 'select', answer: '__quit__' },
    ]);

    await mainLoop(prompter, session);

    expect(session.effectiveEnv().HARPA_API_URL).toBe('http://old.example');
  });
});
