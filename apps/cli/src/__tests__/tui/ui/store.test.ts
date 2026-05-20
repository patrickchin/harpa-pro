/**
 * UiStore unit tests (arch-tui-layout-v2.md §8).
 *
 * Asserts the four-slice shape: topbar / viewport / interaction /
 * log. Replaces the v1 `status` slice with `topbar` (breadcrumb +
 * identity) and a separate `interaction` slice (prompt + in-flight +
 * keymap hint). The log is now a single LogEntry replaced on each
 * push, not a capped tail.
 */
import { describe, it, expect } from 'vitest';
import { createUiStore } from '../../../tui/ui/store.js';

describe('UiStore', () => {
  it('initialises with empty slices and no prompt', () => {
    const ui = createUiStore();
    expect(ui.state.viewport.headline).toBeUndefined();
    expect(ui.state.viewport.subline).toBeUndefined();
    expect(ui.state.viewport.body).toBeUndefined();
    expect(ui.state.topbar.breadcrumb).toEqual([]);
    expect(ui.state.topbar.identity.apiLabel).toBe('');
    expect(ui.state.interaction.currentPrompt).toBeUndefined();
    expect(ui.state.interaction.inFlight).toBeUndefined();
    expect(ui.state.log).toBeUndefined();
  });

  it('merges initial topbar/viewport/interaction from options', () => {
    const ui = createUiStore({
      initialTopBar: {
        breadcrumb: ['/'],
        identity: { user: 'alice', apiLabel: 'prod', fixtureMode: 'live' },
      },
      initialViewport: { headline: 'Welcome' },
      initialInteraction: { keymapHint: '↑/↓ select' },
    });
    expect(ui.state.topbar.breadcrumb).toEqual(['/']);
    expect(ui.state.topbar.identity.user).toBe('alice');
    expect(ui.state.topbar.identity.apiLabel).toBe('prod');
    expect(ui.state.viewport.headline).toBe('Welcome');
    expect(ui.state.interaction.keymapHint).toBe('↑/↓ select');
  });

  it('setViewport patches without dropping other fields', () => {
    const ui = createUiStore();
    ui.setViewport({ headline: 'Project Acme' });
    ui.setViewport({ subline: 'member: 3 · reports: 12' });
    expect(ui.state.viewport.headline).toBe('Project Acme');
    expect(ui.state.viewport.subline).toBe('member: 3 · reports: 12');
  });

  it('setTopBar patches breadcrumb and setIdentity patches identity', () => {
    const ui = createUiStore();
    ui.setTopBar({ breadcrumb: ['/', 'projects', 'acme'] });
    ui.setIdentity({ user: 'alice', fixtureMode: 'replay' });
    expect(ui.state.topbar.breadcrumb).toEqual(['/', 'projects', 'acme']);
    expect(ui.state.topbar.identity.user).toBe('alice');
    expect(ui.state.topbar.identity.fixtureMode).toBe('replay');
  });

  it('setPrompt and clears with undefined', () => {
    const ui = createUiStore();
    ui.setPrompt({ kind: 'confirm', label: 'Delete?' });
    expect(ui.state.interaction.currentPrompt?.kind).toBe('confirm');
    ui.setPrompt(undefined);
    expect(ui.state.interaction.currentPrompt).toBeUndefined();
  });

  it('setInFlight toggles the indicator', () => {
    const ui = createUiStore();
    ui.setInFlight({ label: 'fetching…' });
    expect(ui.state.interaction.inFlight?.label).toBe('fetching…');
    ui.setInFlight(undefined);
    expect(ui.state.interaction.inFlight).toBeUndefined();
  });

  it('log replaces the single log entry on each push', () => {
    const ui = createUiStore();
    for (const m of ['a', 'b', 'c']) {
      ui.log({ kind: 'info', message: m });
    }
    expect(ui.state.log?.message).toBe('c');
    expect(ui.state.log?.kind).toBe('info');
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
