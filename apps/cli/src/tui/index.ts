/**
 * `harpa tui` — interactive menu-driven shell.
 *
 * Boots with a tolerant env parse: `HARPA_API_URL` may be unset, in
 * which case the TUI prompts the user for it interactively. All other
 * env validation still applies. The collected URL lives in the
 * in-memory session only — never written to disk.
 *
 * Errors render via `lib/error.ts` formatters and return to the menu.
 * `process.exit` is never called inside the loop.
 *
 * See docs/v4/arch-tui.md §3.4.
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { z } from 'zod';
import { parseEnvLoose, formatEnvError, validateApiUrl, type CliEnv } from '../lib/env.js';
import { clackPrompter, type Prompter } from './prompter.js';
import { createSession, type Session } from './session.js';
import { mainLoop } from './menu.js';

export const tuiCommand = defineCommand({
  meta: {
    name: 'tui',
    description: 'Interactive menu-driven shell for the harpa-pro API.',
  },
  async run() {
    const prompter = clackPrompter();
    prompter.intro(chalk.cyan('harpa tui'));

    let env;
    try {
      env = parseEnvLoose();
    } catch (err) {
      if (err instanceof z.ZodError) {
        prompter.log.error(formatEnvError(err));
        prompter.outro('Goodbye.');
        process.exit(1);
      }
      throw err;
    }

    // Ask for the API URL up-front if it wasn't supplied via env.
    let apiUrl = env.HARPA_API_URL;
    if (!apiUrl) {
      const answer = await prompter.text({
        label: 'API URL',
        placeholder: 'http://localhost:8787',
        validate: validateApiUrl,
      });
      if (prompter.isCancel(answer)) {
        prompter.outro('Goodbye.');
        return;
      }
      apiUrl = answer;
    }

    const concrete: CliEnv = { ...env, HARPA_API_URL: apiUrl };
    const session = createSession(concrete);
    try {
      await runTui(prompter, session);
    } finally {
      prompter.outro('Goodbye.');
    }
  },
});

/**
 * Test seam — drive the loop with a scripted prompter + custom session.
 * Kept distinct from the citty `run` so unit/behaviour tests don't go
 * through `parseEnvLoose()` / clack.
 */
export async function runTui(prompter: Prompter, session: Session): Promise<void> {
  await mainLoop(prompter, session);
}
