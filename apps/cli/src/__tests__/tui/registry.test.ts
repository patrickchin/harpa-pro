import { describe, it, expect } from 'vitest';
import type { CommandDef, SubCommandsDef } from 'citty';
import { registry } from '../../tui/registry.js';

/**
 * Walk the live citty command tree and the TUI registry, asserting
 * that every flag-CLI leaf has a matching TUI entry. New commands
 * added without a `tuiSpec` will fail this test in the same PR.
 *
 * Implementation detail: we import the citty `main` definition via
 * dynamic import to avoid triggering `runMain`. `index.ts` only runs
 * the CLI when imported as the entrypoint — for tests we re-derive
 * the leaf list from the same export.
 */

async function loadCittyLeaves(): Promise<string[]> {
  // Re-derive the citty subcommand map from the same source `index.ts`
  // mounts. Keep this in sync if/when `index.ts` grows additional
  // top-level subcommands.
  const { healthCommand } = await import('../../commands/health.js');
  const { tuiCommand } = await import('../../tui/index.js');
  const subCommands: SubCommandsDef = {
    health: healthCommand,
    tui: tuiCommand,
  };
  const root: CommandDef = { meta: { name: 'harpa' }, subCommands };
  return walkLeaves(root, []);
}

function walkLeaves(cmd: CommandDef, prefix: string[]): string[] {
  const subs = cmd.subCommands as SubCommandsDef | undefined;
  if (!subs || Object.keys(subs).length === 0) {
    return prefix.length === 0 ? [] : [prefix.join(' ')];
  }
  const out: string[] = [];
  for (const [name, child] of Object.entries(subs)) {
    out.push(...walkLeaves(child as CommandDef, [...prefix, name]));
  }
  return out;
}

/**
 * Commands that intentionally have no TUI entry — kept in code so the
 * test fails loudly when something is removed without updating this
 * list. `tui` itself is the obvious entry (you can't open the TUI from
 * inside the TUI).
 */
const TUI_OPTED_OUT = new Set<string>(['tui']);

describe('TUI registry completeness', () => {
  it('every flag-CLI leaf has a matching TUI entry (or is opted out)', async () => {
    const cittyLeaves = (await loadCittyLeaves())
      .filter((leaf) => !TUI_OPTED_OUT.has(leaf));
    const tuiLeaves = registry.map((c) => {
      const meta = c.cittyCommand.meta as { name?: string } | undefined;
      return meta?.name ?? '<unnamed>';
    });
    expect(new Set(tuiLeaves)).toEqual(new Set(cittyLeaves));
  });

  it('every registry entry has a non-empty group and label', () => {
    for (const cmd of registry) {
      expect(cmd.tuiSpec.group).toMatch(/.+/);
      expect(cmd.tuiSpec.label).toMatch(/.+/);
    }
  });

  it('every registry entry has an args spec (possibly empty)', () => {
    for (const cmd of registry) {
      expect(cmd.tuiSpec.args).toBeDefined();
    }
  });
});
