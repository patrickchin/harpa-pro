/**
 * TUI command registry.
 *
 * The single source of truth for what commands appear in `harpa tui`'s
 * menu. Each entry is a `HarpaCommand` produced by `defineHarpaCommand`
 * in `commands/<group>.ts`. The menu loop reads this list and groups
 * by `tuiSpec.group`.
 *
 * Future commands plug in by importing here — no menu-code edits.
 * The registry-completeness test (TUI.5) asserts that every citty
 * leaf has a matching TUI entry (or is explicitly opted out).
 *
 * See docs/v4/arch-tui.md §3.4.
 */
import type { ArgsDef } from 'citty';
import { health } from '../commands/health.js';
import type { HarpaCommand } from '../lib/command.js';

export type AnyHarpaCommand = HarpaCommand<ArgsDef>;

export const registry: ReadonlyArray<AnyHarpaCommand> = [
  health as unknown as AnyHarpaCommand,
];

export interface MenuGroup {
  group: string;
  hint?: string;
  commands: ReadonlyArray<AnyHarpaCommand>;
}

/** Group registry entries by `tuiSpec.group`, preserving insertion order. */
export function groupRegistry(
  entries: ReadonlyArray<AnyHarpaCommand> = registry,
): ReadonlyArray<MenuGroup> {
  const byGroup = new Map<string, AnyHarpaCommand[]>();
  for (const cmd of entries) {
    const g = cmd.tuiSpec.group;
    const list = byGroup.get(g) ?? [];
    list.push(cmd);
    byGroup.set(g, list);
  }
  return Array.from(byGroup.entries()).map(([group, commands]) => ({ group, commands }));
}
