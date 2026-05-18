import { describe, it, expect } from 'vitest';
import { CANCEL, scriptedPrompter } from '../../tui/prompter.js';

describe('scriptedPrompter', () => {
  it('returns scripted answers in order and records a transcript', async () => {
    const p = scriptedPrompter([
      { kind: 'text', answer: 'alice' },
      { kind: 'select', answer: 'voice' },
      { kind: 'confirm', answer: true },
    ]);

    expect(await p.text({ label: 'Name' })).toBe('alice');
    expect(await p.select({ label: 'Kind', options: [{ value: 'voice', label: 'Voice' }] })).toBe('voice');
    expect(await p.confirm({ label: 'Proceed?' })).toBe(true);

    expect(p.exhausted()).toBe(true);
    expect(p.transcript.map((t) => t.kind)).toEqual(['text', 'select', 'confirm']);
  });

  it('throws when the prompt kind does not match the next step', async () => {
    const p = scriptedPrompter([{ kind: 'text', answer: 'x' }]);
    await expect(p.confirm({ label: 'Y?' })).rejects.toThrow(/expected text but got confirm/);
  });

  it('throws when no steps are left', async () => {
    const p = scriptedPrompter([]);
    await expect(p.text({ label: 'X' })).rejects.toThrow(/no steps left/);
  });

  it('matches expectLabel when supplied', async () => {
    const p = scriptedPrompter([{ kind: 'text', expectLabel: 'Phone', answer: '+1' }]);
    await expect(p.text({ label: 'Code' })).rejects.toThrow(/label "Phone"/);
  });

  it('propagates the CANCEL sentinel as an answer', async () => {
    const p = scriptedPrompter([{ kind: 'text', answer: CANCEL }]);
    const v = await p.text({ label: 'X' });
    expect(p.isCancel(v)).toBe(true);
  });

  it('captures log/note/intro/outro into the transcript', async () => {
    const p = scriptedPrompter([]);
    p.intro('hi');
    p.note('body', 'title');
    p.log.success('ok');
    p.outro('bye');
    expect(p.transcript.map((t) => t.kind)).toEqual(['intro', 'note', 'log.success', 'outro']);
  });
});
