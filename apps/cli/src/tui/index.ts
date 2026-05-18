/**
 * `harpa tui` — interactive menu-driven shell (v2: stateful app).
 *
 * Boot sequence (arch-tui-app.md §3.4):
 *   1. Parse env loosely (HARPA_API_URL may be missing — config state).
 *   2. Build the OS-default disk-backed credentials store.
 *   3. `bootState({ env, credentials })` validates any persisted token
 *      via `GET /me` and decides the initial AppState.
 *   4. Create the session with that state.
 *   5. `runApp` renders the per-state menu in a loop.
 *
 * `process.exit` is never called inside the loop — Ctrl-C at the
 * top-level select is "Quit", which lets the outer `outro` print.
 *
 * See docs/v4/arch-tui-app.md §3.4, §6.
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { z } from 'zod';
import { parseEnvLoose, formatEnvError } from '../lib/env.js';
import { clackPrompter, type Prompter } from './prompter.js';
import { createSession, type Session } from './session.js';
import { mainLoop } from './menu.js';
import { runApp } from './app.js';
import { bootState } from './state.js';
import { diskCredentialsStore } from './credentials.js';

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

    const credentials = diskCredentialsStore({
      warn: (m) => prompter.log.warn(m),
    });
    const boot = await bootState({ env, credentials });

    const concreteEnv = {
      ...env,
      // Session demands a concrete CliEnv; if we're still in `config`
      // (no URL anywhere) we seed an empty string and the Set-API-URL
      // flow overwrites it on first run.
      HARPA_API_URL: boot.apiUrl ?? '',
    } as Parameters<typeof createSession>[0] extends { env: infer E } ? E : never;

    const session = createSession({
      env: concreteEnv as never,
      credentials,
      initialState: boot.state,
      ...(boot.apiUrl ? { apiUrl: boot.apiUrl } : {}),
      ...(boot.token ? { token: boot.token } : {}),
    });

    if (boot.state.kind === 'authed') {
      prompter.log.info(
        `Restored session for ${boot.state.user.displayName ?? boot.state.user.userId} ` +
        `(credentials file: ${credentials.path})`,
      );
    } else if (boot.state.kind === 'auth' && boot.state.reason === 'expired') {
      prompter.log.warn('Your previous session expired — please sign in again.');
    }

    try {
      await runApp(prompter, session);
    } finally {
      prompter.outro('Goodbye.');
    }
  },
});

/**
 * Test seam — drive the v1 raw-API loop with a scripted prompter +
 * custom session. Kept for the existing menu unit tests; the new
 * state-machine driver is `runApp` (exported from `./app.js`).
 */
export async function runTui(prompter: Prompter, session: Session): Promise<void> {
  await mainLoop(prompter, session);
}
