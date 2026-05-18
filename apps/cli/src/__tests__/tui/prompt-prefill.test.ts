/**
 * Tests for `collectArgs(prefill)` (TUI-nav.1).
 *
 * Verifies arch-tui-nav.md §3.3 semantics:
 *   - prefilled args are copied without prompting
 *   - non-prefilled args still prompt normally
 *   - `skipWhen` runs BEFORE the prefill check (prefill never
 *     overrides an explicit skip)
 *   - empty/missing prefill behaves identically to no prefill
 */
import { describe, it, expect } from 'vitest';
import { collectArgs } from '../../tui/prompt.js';
import { scriptedPrompter } from '../../tui/prompter.js';
import type { TuiArgSpec } from '../../lib/command.js';

const TEXT = (label: string, required = true): TuiArgSpec => ({
  label,
  required,
  prompt: { kind: 'text' },
});

describe('collectArgs prefill', () => {
  it('skips prompts for prefilled keys', async () => {
    const p = scriptedPrompter([]);
    const result = await collectArgs(
      p,
      { projectSlug: TEXT('Project slug'), name: TEXT('Note name') },
      { projectSlug: 'demo', name: 'pre-set' },
    );
    expect(result).toEqual({ projectSlug: 'demo', name: 'pre-set' });
    // No prompts should have been issued
    expect(p.transcript).toHaveLength(0);
  });

  it('prompts for non-prefilled keys only', async () => {
    const p = scriptedPrompter([{ kind: 'text', answer: 'My Note' }]);
    const result = await collectArgs(
      p,
      { projectSlug: TEXT('Project slug'), name: TEXT('Note name') },
      { projectSlug: 'demo' },
    );
    expect(result).toEqual({ projectSlug: 'demo', name: 'My Note' });
    expect(p.transcript).toHaveLength(1);
  });

  it('skipWhen runs before prefill check', async () => {
    const spec: Record<string, TuiArgSpec> = {
      generate: { label: 'Generate?', required: true, prompt: { kind: 'confirm' } },
      style: {
        label: 'Style',
        required: false,
        prompt: { kind: 'text' },
        skipWhen: (a) => a.generate === false,
      },
    };
    const p = scriptedPrompter([{ kind: 'confirm', answer: false }]);
    const result = await collectArgs(p, spec, { style: 'should-be-ignored' });
    expect(result).toEqual({ generate: false });
  });

  it('missing prefill behaves like no prefill', async () => {
    const p = scriptedPrompter([
      { kind: 'text', answer: 'a' },
      { kind: 'text', answer: 'b' },
    ]);
    const result = await collectArgs(p, {
      x: TEXT('X'),
      y: TEXT('Y'),
    });
    expect(result).toEqual({ x: 'a', y: 'b' });
  });
});
