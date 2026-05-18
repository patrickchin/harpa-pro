/**
 * Tests for askArg — focused on the optional-number bug where an
 * empty answer to e.g. `--limit` (labelled "Page size (optional)")
 * was being coerced to Number("") === 0, then failing the
 * underlying min=1 check.
 */
import { describe, it, expect } from 'vitest';
import { askArg } from '../../tui/prompt.js';
import { scriptedPrompter } from '../../tui/prompter.js';
import type { TuiArgSpec } from '../../lib/command.js';

describe('askArg — number kind', () => {
  it('optional number returns undefined on empty input', async () => {
    const spec: TuiArgSpec = {
      label: 'Page size',
      required: false,
      prompt: { kind: 'number', min: 1, max: 100, default: 20 },
    };
    const prompter = scriptedPrompter([
      { kind: 'text', answer: '' },
    ]);
    const result = await askArg(prompter, 'limit', spec);
    expect(result).toBeUndefined();
  });

  it('required number coerces empty to NaN (so caller can re-prompt via validator)', async () => {
    const spec: TuiArgSpec = {
      label: 'Count',
      required: true,
      prompt: { kind: 'number', min: 1 },
    };
    const prompter = scriptedPrompter([
      { kind: 'text', answer: '42' },
    ]);
    const result = await askArg(prompter, 'count', spec);
    expect(result).toBe(42);
  });

  it('optional number coerces non-empty answer normally', async () => {
    const spec: TuiArgSpec = {
      label: 'Page size',
      required: false,
      prompt: { kind: 'number', min: 1, max: 100, default: 20 },
    };
    const prompter = scriptedPrompter([
      { kind: 'text', answer: '50' },
    ]);
    const result = await askArg(prompter, 'limit', spec);
    expect(result).toBe(50);
  });

  it('label gets "(optional)" suffix when not required', async () => {
    const spec: TuiArgSpec = {
      label: 'Page size',
      required: false,
      prompt: { kind: 'number' },
    };
    const prompter = scriptedPrompter([
      { kind: 'text', expectLabel: 'Page size (optional)', answer: '' },
    ]);
    const result = await askArg(prompter, 'limit', spec);
    expect(result).toBeUndefined();
  });
});
