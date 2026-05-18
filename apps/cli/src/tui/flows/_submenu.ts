/**
 * Submenu helper for state-machine flows.
 *
 * Many top-level flows are really "here are N related raw-API leaves,
 * pick one." `submenu(...)` builds that select-and-run loop in one
 * place so the per-flow modules stay short. Each leaf is executed
 * through the existing `runCommand` so prompt collection + error
 * rendering are identical to Developer › Raw API.
 *
 * Flows that need richer behaviour (project-context carrying, multi-
 * step uploads) are hand-rolled — this helper is for the simple
 * "wrap related leaves under one label" case.
 */
import type { Prompter } from '../prompter.js';
import type { Session } from '../session.js';
import { runCommand } from '../execute.js';
import { findLeaf } from '../registry-find.js';

const BACK = '__back__' as const;

export interface SubmenuItem {
  /** TuiSpec.label of a registry leaf, OR a custom action. */
  cittyPath: ReadonlyArray<string>;
  /** Override the menu label (defaults to leaf's tuiSpec.label). */
  label?: string;
  hint?: string;
}

/**
 * Run a "pick a leaf and execute it, repeat until back" loop.
 * Items reference leaves by `cittyPath` so submenus are robust to
 * label changes. Missing leaves throw at flow start (compile-ish
 * safety net).
 */
export async function runSubmenu(
  prompter: Prompter,
  session: Session,
  title: string,
  items: ReadonlyArray<SubmenuItem>,
): Promise<void> {
  const leaves = items.map((item) => {
    const leaf = findLeaf(item.cittyPath);
    if (!leaf) {
      throw new Error(`submenu(${title}): no registry leaf for [${item.cittyPath.join(' ')}]`);
    }
    return { item, leaf };
  });
  for (;;) {
    const choice = await prompter.select<string>({
      label: title,
      options: [
        ...leaves.map(({ item, leaf }) => ({
          value: item.cittyPath.join('/'),
          label: item.label ?? leaf.tuiSpec.label,
          hint: item.hint ?? leaf.tuiSpec.hint,
        })),
        { value: BACK, label: '← back' },
      ],
    });
    if (prompter.isCancel(choice) || choice === BACK) return;
    const match = leaves.find(({ item }) => item.cittyPath.join('/') === choice);
    if (!match) continue;
    await runCommand(prompter, session, match.leaf);
  }
}
