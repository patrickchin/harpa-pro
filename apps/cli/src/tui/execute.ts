/**
 * Execute a `HarpaCommand` inside the TUI loop.
 *
 * Calls the command's shared `execute()` factory (same one the citty
 * adapter uses), then hands the openapi-fetch thunk to `performRequest`.
 * The outcome is rendered into the clack flow via the Prompter — no
 * `process.exit`, no direct stderr writes. Errors return the user to
 * the menu (Pitfall 5 echo — no fire-and-forget).
 *
 * See docs/v4/arch-tui.md §3.3 and §3.7.
 */
import { performRequest } from '../lib/run.js';
import { formatErrorMessage, formatTransportMessage } from '../lib/error.js';
import { createApiClient } from '../lib/client.js';
import type { AnyHarpaCommand } from './registry.js';
import type { Prompter } from './prompter.js';
import type { Session } from './session.js';
import { collectArgs } from './prompt.js';
import type { ParsedArgs } from 'citty';

export interface RunCommandResult {
  status: 'ok' | 'error' | 'cancelled';
}

/**
 * Drive prompts → API call → render → return. Never throws (errors
 * are rendered and surfaced via `RunCommandResult`).
 */
export async function runCommand(
  prompter: Prompter,
  session: Session,
  cmd: AnyHarpaCommand,
): Promise<RunCommandResult> {
  const tuiArgs = (cmd.tuiSpec.args ?? {}) as Record<string, import('../lib/command.js').TuiArgSpec>;

  const answers = await collectArgs(prompter, tuiArgs);
  if (prompter.isCancel(answers)) return { status: 'cancelled' };

  // The citty parsed-args shape includes `_: []` plus any positionals /
  // flags. For TUI, we only ever set the prompted keys; missing args
  // stay undefined, matching the citty default behaviour.
  const args = { _: [], ...answers } as unknown as ParsedArgs;
  const env = session.effectiveEnv();
  const client = createApiClient(env);
  const exec = cmd.execute({ client, env, args });

  const outcome = await performRequest(exec.request);

  switch (outcome.kind) {
    case 'ok': {
      const rendered = exec.format(outcome.data);
      if (rendered) prompter.note(rendered, cmd.tuiSpec.label);
      const reqId = outcome.response.headers.get('x-request-id');
      if (reqId) prompter.log.info(`Request ID: ${reqId}`);
      return { status: 'ok' };
    }
    case 'apiError': {
      prompter.log.error(
        formatErrorMessage(outcome.status, outcome.body, outcome.response.headers),
      );
      return { status: 'error' };
    }
    case 'transport': {
      prompter.log.error(formatTransportMessage(outcome.error));
      return { status: 'error' };
    }
    case 'missingToken': {
      prompter.log.error(outcome.error.message);
      return { status: 'error' };
    }
  }
}
