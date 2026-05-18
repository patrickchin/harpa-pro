import { describe, it, expect } from 'vitest';
import { uploadFlow } from '../../../tui/flows/upload.js';
import { scriptedPrompter } from '../../../tui/prompter.js';
import { createSession } from '../../../tui/session.js';
import { memoryCredentialsStore } from '../../../tui/credentials.js';

describe('uploadFlow', () => {
  it('opens and exits via back', async () => {
    const session = createSession({
      env: { HARPA_API_URL: 'http://api.example', HARPA_DEBUG: '0' },
      credentials: memoryCredentialsStore(),
      initialState: { kind: 'authed', user: { userId: 'u1' } },
      token: 't',
    });
    const prompter = scriptedPrompter([{ kind: 'select', answer: '__back__' }]);
    const r = await uploadFlow.run({ prompter, session });
    expect(r).toEqual({ kind: 'stay' });
  });

  it('is only visible while authed', () => {
    expect(uploadFlow.visibleIn).toEqual(['authed']);
  });
});
