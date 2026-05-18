import { describe, it, expect } from 'vitest';
import { projectsFlow } from '../../../tui/flows/projects.js';
import { scriptedPrompter } from '../../../tui/prompter.js';
import { createSession } from '../../../tui/session.js';
import { memoryCredentialsStore } from '../../../tui/credentials.js';

const ENV = { HARPA_API_URL: 'http://api.example', HARPA_DEBUG: '0' as const };

describe('projectsFlow', () => {
  it('opens and exits via back', async () => {
    const session = createSession({
      env: ENV,
      credentials: memoryCredentialsStore(),
      initialState: { kind: 'authed', user: { userId: 'u1' } },
      token: 't',
    });
    const prompter = scriptedPrompter([{ kind: 'select', answer: '__back__' }]);
    const r = await projectsFlow.run({ prompter, session });
    expect(r).toEqual({ kind: 'stay' });
  });

  it('is only visible while authed', () => {
    expect(projectsFlow.visibleIn).toEqual(['authed']);
  });
});
