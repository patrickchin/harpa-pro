/**
 * Flow: Set the API URL.
 *
 * Visible in every state — it's the only escape hatch from
 * `config`, and authed users may want to switch staging↔prod.
 * Changing the URL clears persisted credentials (the token is
 * scoped to the API that issued it).
 */
import { validateApiUrl } from '../../lib/env.js';
import type { Flow, FlowResult } from '../flow.js';
import { stay } from '../flow.js';

export const setApiUrlFlow: Flow = {
  id: 'set-api-url',
  label: 'Set API URL',
  hint: 'Change the API base URL (clears stored credentials)',
  visibleIn: ['config', 'auth', 'authed'],
  async run({ prompter, session }): Promise<FlowResult> {
    const current = session.effectiveEnv().HARPA_API_URL;
    const answer = await prompter.text({
      label: 'API URL',
      placeholder: 'http://localhost:8787',
      ...(current ? { default: current } : {}),
      validate: validateApiUrl,
    });
    if (prompter.isCancel(answer)) return stay;
    await session.setApiUrl(answer);
    prompter.log.success(`API URL set to ${answer}`);
    return stay;
  },
};
