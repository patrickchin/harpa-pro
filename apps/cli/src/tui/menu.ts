/**
 * Raw-API menu loop (formerly `mainLoop`; renamed for v2).
 *
 * Two-level navigation over `registry.ts`:
 *   group menu → command menu → run command → back to group menu.
 *
 * In v2 this loop sits behind `Developer › Raw API` and only shows
 * leaves with `tuiSpec.surface !== 'flow-only'`. The `__set_api_url__`
 * entry is preserved for backwards-compatibility with the v1 unit
 * tests and remains useful inside the raw menu too.
 *
 * Cancellation rules (arch-tui.md §3.4):
 *   - Ctrl-C inside a command's prompts → return to group menu.
 *   - Ctrl-C at the group menu → return to main menu.
 *   - Ctrl-C at the main menu → exit loop (graceful).
 *
 * No `setTimeout` / fire-and-forget anywhere in this module.
 */
import { groupRegistry, registry, type AnyHarpaCommand, type MenuGroup } from './registry.js';
import type { Prompter } from './prompter.js';
import type { Session } from './session.js';
import { runCommand } from './execute.js';
import { validateApiUrl } from '../lib/env.js';

const BACK = '__back__' as const;
const QUIT = '__quit__' as const;
const SET_API_URL = '__set_api_url__' as const;

function rawApiRegistry(): ReadonlyArray<AnyHarpaCommand> {
  return registry.filter((c) => c.tuiSpec.surface !== 'flow-only');
}

export async function runRawApiMenu(prompter: Prompter, session: Session): Promise<void> {
  const groups = groupRegistry(rawApiRegistry());
  for (;;) {
    const choice = await prompter.select<string>({
      label: `Select an action  (API: ${session.effectiveEnv().HARPA_API_URL})`,
      options: [
        ...groups.map((g) => ({
          value: g.group,
          label: g.group,
          hint: groupHint(g),
        })),
        { value: SET_API_URL, label: 'Set API URL', hint: 'Change the API base URL for this session' },
        { value: QUIT, label: 'quit' },
      ],
    });

    if (prompter.isCancel(choice) || choice === QUIT) return;
    if (choice === SET_API_URL) {
      await promptApiUrl(prompter, session);
      continue;
    }

    const group = groups.find((g) => g.group === choice);
    if (!group) continue;
    await groupLoop(prompter, session, group);
  }
}

/** v1 alias preserved for the existing tests; same behaviour. */
export const mainLoop = runRawApiMenu;

async function promptApiUrl(prompter: Prompter, session: Session): Promise<void> {
  const current = session.effectiveEnv().HARPA_API_URL;
  const answer = await prompter.text({
    label: 'API URL',
    placeholder: 'http://localhost:8787',
    default: current,
    validate: validateApiUrl,
  });
  if (prompter.isCancel(answer)) return;
  await session.setApiUrl(answer);
  prompter.log.success(`API URL set to ${answer}`);
}

async function groupLoop(
  prompter: Prompter,
  session: Session,
  group: MenuGroup,
): Promise<void> {
  for (;;) {
    const choice = await prompter.select<string>({
      label: `${group.group} — pick a command`,
      options: [
        ...group.commands.map((c) => ({
          value: c.tuiSpec.label,
          label: c.tuiSpec.label,
          hint: c.tuiSpec.hint,
        })),
        { value: BACK, label: '← back' },
      ],
    });

    if (prompter.isCancel(choice) || choice === BACK) return;
    const cmd = group.commands.find((c) => c.tuiSpec.label === choice);
    if (!cmd) continue;
    await runCommand(prompter, session, cmd as AnyHarpaCommand);
  }
}

function groupHint(g: MenuGroup): string | undefined {
  const first = g.commands[0]?.tuiSpec.hint;
  return g.commands.length === 1 ? first : `${g.commands.length} commands`;
}
