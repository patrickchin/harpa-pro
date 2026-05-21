import { describe, it, expect } from 'vitest';
import { CANCEL, opentuiPrompter } from '../../tui/prompter.js';
import { createUiStore } from '../../tui/ui/store.js';

describe('opentuiPrompter', () => {
  it('text(): pushes request, resolves on ui.resolve, clears the prompt', async () => {
    const ui = createUiStore();
    const prompter = opentuiPrompter(ui);

    const pending = prompter.text({ label: 'Name', placeholder: 'alice' });
    expect(ui.state.interaction.currentPrompt?.kind).toBe('text');
    expect(ui.state.interaction.currentPrompt).toMatchObject({ label: 'Name', placeholder: 'alice' });

    ui.resolve({ kind: 'text', value: 'bob' });
    const got = await pending;
    expect(got).toBe('bob');
    expect(ui.state.interaction.currentPrompt).toBeUndefined();
  });

  it('select(): forwards options + hints, returns typed value', async () => {
    const ui = createUiStore();
    const prompter = opentuiPrompter(ui);

    const pending = prompter.select({
      label: 'Action',
      options: [
        { value: 'add-note', label: 'Add note', hint: 'n' },
        { value: 'generate', label: 'Generate' },
      ],
      initialValue: 'add-note',
    });
    const req = ui.state.interaction.currentPrompt;
    expect(req?.kind).toBe('select');
    if (req?.kind === 'select') {
      expect(req.options).toEqual([
        { value: 'add-note', label: 'Add note', hint: 'n' },
        { value: 'generate', label: 'Generate' },
      ]);
      expect(req.initialValue).toBe('add-note');
    }

    ui.resolve({ kind: 'select', value: 'generate' });
    expect(await pending).toBe('generate');
  });

  it('confirm(): yes path', async () => {
    const ui = createUiStore();
    const prompter = opentuiPrompter(ui);
    const pending = prompter.confirm({ label: 'Delete?', default: false });
    expect(ui.state.interaction.currentPrompt).toMatchObject({ kind: 'confirm', label: 'Delete?', default: false });
    ui.resolve({ kind: 'confirm', value: true });
    expect(await pending).toBe(true);
  });

  it('cancel resolution returns CANCEL for every prompt kind', async () => {
    const ui = createUiStore();
    const prompter = opentuiPrompter(ui);

    const t = prompter.text({ label: 'X' });
    ui.resolve({ kind: 'cancel' });
    expect(prompter.isCancel(await t)).toBe(true);

    const s = prompter.select({ label: 'Y', options: [{ value: 'a', label: 'A' }] });
    ui.resolve({ kind: 'cancel' });
    expect(prompter.isCancel(await s)).toBe(true);

    const c = prompter.confirm({ label: 'Z?' });
    ui.resolve({ kind: 'cancel' });
    expect(prompter.isCancel(await c)).toBe(true);
  });

  it('multiline and filePath route through their own request kinds', async () => {
    const ui = createUiStore();
    const prompter = opentuiPrompter(ui);

    const m = prompter.multiline({ label: 'Note' });
    expect(ui.state.interaction.currentPrompt?.kind).toBe('multiline');
    ui.resolve({ kind: 'text', value: 'line1\nline2' });
    expect(await m).toBe('line1\nline2');

    const f = prompter.filePath({ label: 'File' });
    expect(ui.state.interaction.currentPrompt?.kind).toBe('filePath');
    ui.resolve({ kind: 'text', value: '/tmp/x.jpg' });
    expect(await f).toBe('/tmp/x.jpg');
  });

  it('selectFromViewport(): pushes viewportSelect prompt with items, resolves with picked value', async () => {
    const ui = createUiStore();
    const prompter = opentuiPrompter(ui);

    const pending = prompter.selectFromViewport<string>({
      label: 'Pick a project',
      items: [
        { value: 'p1', label: 'Demo', columns: ['OWNER', 'Acme'] },
        { value: 'p2', label: 'Other' },
      ],
    });
    const req = ui.state.interaction.currentPrompt;
    expect(req?.kind).toBe('viewportSelect');
    if (req?.kind === 'viewportSelect') {
      expect(req.label).toBe('Pick a project');
      expect(req.items).toEqual([
        { value: 'p1', label: 'Demo', columns: ['OWNER', 'Acme'] },
        { value: 'p2', label: 'Other' },
      ]);
    }
    ui.resolve({ kind: 'select', value: 'p2' });
    expect(await pending).toBe('p2');
    expect(ui.state.interaction.currentPrompt).toBeUndefined();
  });

  it('selectFromViewport(): cancel returns CANCEL', async () => {
    const ui = createUiStore();
    const prompter = opentuiPrompter(ui);
    const pending = prompter.selectFromViewport({
      items: [{ value: 'a', label: 'A' }],
    });
    ui.resolve({ kind: 'cancel' });
    expect(prompter.isCancel(await pending)).toBe(true);
  });

  it('note + log.* push the latest entry into the single log slot with the right kind', async () => {
    const ui = createUiStore();
    const prompter = opentuiPrompter(ui);
    prompter.note('hello', 'Heads up');
    expect(ui.state.log).toMatchObject({ kind: 'note', message: 'hello', title: 'Heads up' });
    prompter.log.info('i');
    expect(ui.state.log).toMatchObject({ kind: 'info', message: 'i' });
    prompter.log.success('s');
    expect(ui.state.log).toMatchObject({ kind: 'success', message: 's' });
    prompter.log.warn('w');
    expect(ui.state.log).toMatchObject({ kind: 'warn', message: 'w' });
    prompter.log.error('e');
    expect(ui.state.log).toMatchObject({ kind: 'error', message: 'e' });
  });

  it('intro/outro are no-ops (no log entries, no exceptions)', () => {
    const ui = createUiStore();
    const prompter = opentuiPrompter(ui);
    prompter.intro('start');
    prompter.outro('done');
    expect(ui.state.log).toBeUndefined();
  });

  it('sequential prompts work: second prompt is independent of the first', async () => {
    const ui = createUiStore();
    const prompter = opentuiPrompter(ui);

    const a = prompter.text({ label: 'A' });
    ui.resolve({ kind: 'text', value: 'first' });
    expect(await a).toBe('first');

    const b = prompter.confirm({ label: 'B?' });
    ui.resolve({ kind: 'confirm', value: false });
    expect(await b).toBe(false);
    expect(ui.state.interaction.currentPrompt).toBeUndefined();
  });

  it('isCancel only recognises the CANCEL sentinel', () => {
    const ui = createUiStore();
    const prompter = opentuiPrompter(ui);
    expect(prompter.isCancel(CANCEL)).toBe(true);
    expect(prompter.isCancel('cancel')).toBe(false);
    expect(prompter.isCancel(undefined)).toBe(false);
  });
});
