import { describe, it, expect } from 'vitest';
import { createUiStore } from '../../../tui/ui/store.js';

describe('UiStore', () => {
  it('initialises with empty viewport/status and no prompt', () => {
    const ui = createUiStore();
    expect(ui.state.viewport.title).toBe('');
    expect(ui.state.viewport.headerLines).toEqual([]);
    expect(ui.state.viewport.body).toBeUndefined();
    expect(ui.state.viewport.logTail).toEqual([]);
    expect(ui.state.status.apiUrl).toBe('');
    expect(ui.state.status.breadcrumb).toEqual([]);
    expect(ui.state.currentPrompt).toBeUndefined();
    expect(ui.state.inFlight).toBeUndefined();
  });

  it('merges initial status/viewport from options', () => {
    const ui = createUiStore({
      initialStatus: { apiUrl: 'https://api.local', user: 'alice' },
      initialViewport: { title: 'Welcome' },
    });
    expect(ui.state.status.apiUrl).toBe('https://api.local');
    expect(ui.state.status.user).toBe('alice');
    expect(ui.state.viewport.title).toBe('Welcome');
  });

  it('setViewport patches without dropping other fields', () => {
    const ui = createUiStore();
    ui.setViewport({ title: 'Project Acme' });
    ui.setViewport({ headerLines: ['member: 3', 'reports: 12'] });
    expect(ui.state.viewport.title).toBe('Project Acme');
    expect(ui.state.viewport.headerLines).toEqual(['member: 3', 'reports: 12']);
  });

  it('setStatus patches breadcrumb and keymap hint', () => {
    const ui = createUiStore();
    ui.setStatus({ breadcrumb: ['Projects', 'Acme'] });
    ui.setStatus({ keymapHint: '↑/↓ select · ↵ open' });
    expect(ui.state.status.breadcrumb).toEqual(['Projects', 'Acme']);
    expect(ui.state.status.keymapHint).toBe('↑/↓ select · ↵ open');
  });

  it('setPrompt and clears with undefined', () => {
    const ui = createUiStore();
    ui.setPrompt({ kind: 'confirm', label: 'Delete?' });
    expect(ui.state.currentPrompt?.kind).toBe('confirm');
    ui.setPrompt(undefined);
    expect(ui.state.currentPrompt).toBeUndefined();
  });

  it('setInFlight toggles the indicator', () => {
    const ui = createUiStore();
    ui.setInFlight({ label: 'fetching…' });
    expect(ui.state.inFlight?.label).toBe('fetching…');
    ui.setInFlight(undefined);
    expect(ui.state.inFlight).toBeUndefined();
  });

  it('log appends entries and caps the tail at logCap', () => {
    const ui = createUiStore({ logCap: 3 });
    for (const m of ['a', 'b', 'c', 'd', 'e']) {
      ui.log({ kind: 'info', message: m });
    }
    expect(ui.state.viewport.logTail.map((e) => e.message)).toEqual(['c', 'd', 'e']);
  });

  it('onResolve fires the listener on resolve and unsubscribes after', () => {
    const ui = createUiStore();
    const seen: unknown[] = [];
    ui.onResolve((r) => seen.push(r));
    ui.resolve({ kind: 'select', value: 'add-note' });
    expect(seen).toEqual([{ kind: 'select', value: 'add-note' }]);
    ui.resolve({ kind: 'cancel' });
    expect(seen).toHaveLength(1);
  });

  it('explicit unsubscribe prevents the callback firing', () => {
    const ui = createUiStore();
    const seen: unknown[] = [];
    const off = ui.onResolve((r) => seen.push(r));
    off();
    ui.resolve({ kind: 'confirm', value: true });
    expect(seen).toEqual([]);
  });

  it('multiple resolve listeners all fire once', () => {
    const ui = createUiStore();
    const seen: string[] = [];
    ui.onResolve(() => seen.push('a'));
    ui.onResolve(() => seen.push('b'));
    ui.resolve({ kind: 'cancel' });
    expect(seen).toEqual(['a', 'b']);
    ui.resolve({ kind: 'cancel' });
    expect(seen).toEqual(['a', 'b']);
  });
});
