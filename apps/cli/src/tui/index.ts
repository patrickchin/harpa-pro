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
    // HARPA_TUI_CLASSIC=1 opts back into the @clack/prompts UI while
    // L4 is still in flight. Default is the new split-pane TUI.
    const useClassic = process.env['HARPA_TUI_CLASSIC'] === '1';
    if (useClassic) {
      await runClassic();
      return;
    }
    await runSplitPane();
  },
});

async function runClassic(): Promise<void> {
  const prompter = clackPrompter();
  prompter.intro(chalk.cyan('harpa tui'));

  const boot = await bootOrExit(prompter);
  if (!boot) return;

  if (boot.session.state.kind === 'authed') {
    prompter.log.info(
      `Restored session for ${boot.session.state.user.displayName ?? boot.session.state.user.userId} ` +
        `(credentials file: ${boot.credentialsPath})`,
    );
  } else if (boot.session.state.kind === 'auth' && boot.session.state.reason === 'expired') {
    prompter.log.warn('Your previous session expired — please sign in again.');
  }

  try {
    await runApp(prompter, boot.session);
  } finally {
    prompter.outro('Goodbye.');
  }
}

async function runSplitPane(): Promise<void> {
  // Use a temporary clack prompter for boot output so env errors and
  // sign-in prompts that happen *before* the TUI mounts still surface
  // sensibly. Once the renderer takes over the terminal we never
  // write to stdout outside the OpenTUI buffer.
  const stagedLog: Array<{ kind: 'info' | 'success' | 'warn' | 'error'; message: string }> = [];
  const stagingPrompter: Pick<Prompter, 'log'> = {
    log: {
      info: (m) => stagedLog.push({ kind: 'info', message: m }),
      success: (m) => stagedLog.push({ kind: 'success', message: m }),
      error: (m) => stagedLog.push({ kind: 'error', message: m }),
      warn: (m) => stagedLog.push({ kind: 'warn', message: m }),
    },
  };

  const boot = await bootOrExit(stagingPrompter);
  if (!boot) return;

  if (boot.session.state.kind === 'authed') {
    stagedLog.push({
      kind: 'info',
      message: `Restored session for ${boot.session.state.user.displayName ?? boot.session.state.user.userId}`,
    });
  } else if (boot.session.state.kind === 'auth' && boot.session.state.reason === 'expired') {
    stagedLog.push({
      kind: 'warn',
      message: 'Your previous session expired — please sign in again.',
    });
  }

  await runOpenTuiApp(boot.session, { bootLog: stagedLog });
}

async function runOpenTuiApp(
  session: Session,
  opts: { bootLog: ReadonlyArray<{ kind: 'info' | 'success' | 'warn' | 'error'; message: string }> },
): Promise<void> {
  // Dynamic import: @opentui/core uses Bun FFI which is unavailable
  // when this module is loaded under Node (e.g. by vitest). Pulling
  // it in only inside the split-pane code path keeps the existing
  // tests that import `./index.js` working under both runtimes.
  const { runOpenTuiApp: run } = await import('./opentui-runner.js');
  await run(session, opts);
}

interface BootResult {
  session: Session;
  credentialsPath: string;
}

async function bootOrExit(
  logger: Pick<Prompter, 'log'>,
): Promise<BootResult | undefined> {
  let env;
  try {
    env = parseEnvLoose();
  } catch (err) {
    if (err instanceof z.ZodError) {
      logger.log.error(formatEnvError(err));
      process.exit(1);
    }
    throw err;
  }

  const credentials = diskCredentialsStore({
    warn: (m) => logger.log.warn(m),
  });
  const boot = await bootState({ env, credentials });

  const concreteEnv = {
    ...env,
    HARPA_API_URL: boot.apiUrl ?? '',
  } as Parameters<typeof createSession>[0] extends { env: infer E } ? E : never;

  const session = createSession({
    env: concreteEnv as never,
    credentials,
    initialState: boot.state,
    ...(boot.apiUrl ? { apiUrl: boot.apiUrl } : {}),
    ...(boot.token ? { token: boot.token } : {}),
  });

  return { session, credentialsPath: credentials.path };
}

/**
 * Test seam — drive the v1 raw-API loop with a scripted prompter +
 * custom session. Kept for the existing menu unit tests; the new
 * state-machine driver is `runApp` (exported from `./app.js`).
 */
export async function runTui(prompter: Prompter, session: Session): Promise<void> {
  await mainLoop(prompter, session);
}
