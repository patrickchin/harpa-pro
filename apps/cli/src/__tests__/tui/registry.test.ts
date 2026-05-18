import { describe, it, expect } from 'vitest';
import type { CommandDef, SubCommandsDef } from 'citty';
import { main } from '../../index.js';
import { registry } from '../../tui/registry.js';

/**
 * Walk the live citty command tree (the real `main` mounted in
 * `index.ts`) and the TUI registry, asserting that every flag-CLI leaf
 * has a matching TUI entry. New commands added without a `tuiSpec` will
 * fail this test in the same PR — Pitfall 13 echo: don't let the test
 * stub-out the spec by re-declaring the tree it's supposed to gate.
 *
 * Commands that intentionally have no TUI presence go in
 * `TUI_OPTED_OUT`. Each entry MUST have a reason comment so removing
 * it (i.e. migrating it to a `tuiSpec`) is a deliberate act.
 */

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
 * Commands that intentionally have no TUI entry. `tui` itself is the
 * obvious case (you can't open the TUI from inside the TUI). Everything
 * else here is a known follow-up: the flag-CLI shipped before the
 * `defineHarpaCommand` migration. Removing an entry means a TUI spec +
 * registry mount + behaviour test landed in the same PR.
 */
const TUI_OPTED_OUT = new Set<string>([
  // Self — TUI can't open the TUI.
  'tui',

  // Pending TUI migration (tracked in arch-tui.md §7 follow-ups):
  'auth otp start',
  'auth otp verify',
  'auth logout',
  'me get',
  'me update',
  'me usage',
  'projects list',
  'projects create',
  'projects get',
  'projects update',
  'projects delete',
  'projects members list',
  'projects members add',
  'projects members remove',
  'reports list',
  'reports create',
  'reports get',
  'reports update',
  'reports delete',
  'reports generate',
  'reports regenerate',
  'reports finalize',
  'reports pdf',
  'notes list',
  'notes create',
  'notes update',
  'notes delete',
  'files presign',
  'files register',
  'files url',
  'files upload',
  'voice transcribe',
  'voice summarize',
  'settings ai get',
  'settings ai set',
]);

describe('TUI registry completeness', () => {
  it('every flag-CLI leaf has a matching TUI entry (or is opted out)', () => {
    const cittyLeaves = walkLeaves(main as CommandDef, []).filter(
      (leaf) => !TUI_OPTED_OUT.has(leaf),
    );
    const tuiLeaves = registry.map((c) => {
      const path = c.tuiSpec.group;
      const meta = c.cittyCommand.meta as { name?: string } | undefined;
      // Until commands carry a full path, we approximate with
      // `<group> <leaf>`. `health` and other single-leaf groups
      // serialise as just the leaf name (matching `main`).
      const leafName = meta?.name ?? '<unnamed>';
      return path === leafName ? leafName : `${path} ${leafName}`;
    });
    expect(new Set(tuiLeaves)).toEqual(new Set(cittyLeaves));
  });

  it('opt-outs only contain leaves that actually exist in the citty tree', () => {
    const cittyLeaves = new Set(walkLeaves(main as CommandDef, []));
    for (const opted of TUI_OPTED_OUT) {
      expect(cittyLeaves.has(opted), `${opted} is opted out but no longer in the CLI tree`).toBe(true);
    }
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
