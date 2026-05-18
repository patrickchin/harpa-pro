/**
 * `harpa tui` — interactive menu-driven shell.
 *
 * Boots, parses env via `getEnv()` (fail-fast — same path as the
 * flag-driven CLI), starts an in-memory session, and hands control to
 * the menu loop. `process.exit` is never called inside the loop;
 * errors render via `lib/error.ts` formatters and return to the menu.
 *
 * See docs/v4/arch-tui.md §3.4.
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { getEnv } from '../lib/env-runtime.js';
import { clackPrompter, type Prompter } from './prompter.js';
import { createSession, type Session } from './session.js';
import { mainLoop } from './menu.js';

export const tuiCommand = defineCommand({
  meta: {
    name: 'tui',
    description: 'Interactive menu-driven shell for the harpa-pro API.',
  },
  async run() {
    const env = getEnv();
    const prompter = clackPrompter();
    const session = createSession(env);
    prompter.intro(chalk.cyan('harpa tui'));
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
 * through `getEnv()` / clack.
 */
export async function runTui(prompter: Prompter, session: Session): Promise<void> {
  await mainLoop(prompter, session);
}
