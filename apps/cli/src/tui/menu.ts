/**
 * Menu loop.
 *
 * Two-level navigation: a top-level menu of groups (each one a
 * `tuiSpec.group`) → a per-group menu of commands → run command →
 * return to the group menu. "Back" returns to the previous level;
 * "Quit" from the top level exits the loop.
 *
 * Cancellation rules (docs/v4/arch-tui.md §3.4):
 *   - Ctrl-C inside a command's prompts → return to group menu.
 *   - Ctrl-C at the group menu → return to main menu.
 *   - Ctrl-C at the main menu → exit loop (graceful).
 *
 * No `setTimeout` / fire-and-forget anywhere in this module.
 */
import { groupRegistry, type AnyHarpaCommand, type MenuGroup } from './registry.js';
import type { Prompter } from './prompter.js';
import type { Session } from './session.js';
import { runCommand } from './execute.js';
import { validateApiUrl } from '../lib/env.js';

const BACK = '__back__' as const;
const QUIT = '__quit__' as const;
const SET_API_URL = '__set_api_url__' as const;

export async function mainLoop(prompter: Prompter, session: Session): Promise<void> {
  const groups = groupRegistry();
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

async function promptApiUrl(prompter: Prompter, session: Session): Promise<void> {
  const current = session.effectiveEnv().HARPA_API_URL;
  const answer = await prompter.text({
    label: 'API URL',
    placeholder: 'http://localhost:8787',
    default: current,
    validate: validateApiUrl,
  });
  if (prompter.isCancel(answer)) return;
  session.setApiUrl(answer);
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
