/**
 * Shared registry lookup helper. Extracted from `_submenu.ts` so both
 * `screen.ts` and `_submenu.ts` use the same path-matching logic.
 */
import { registry, type AnyHarpaCommand } from './registry.js';

export function findLeaf(
  cittyPath: ReadonlyArray<string>,
): AnyHarpaCommand | undefined {
  return registry.find((c) => {
    const meta = c.cittyCommand.meta as { name?: string } | undefined;
    const p = c.tuiSpec.cittyPath ?? [c.tuiSpec.group, meta?.name ?? ''];
    return (
      p.length === cittyPath.length && p.every((seg, i) => seg === cittyPath[i])
    );
  });
}
