import { describe, it, expect } from 'vitest';
import { KEY_BINDINGS, keymapHintFor } from '../../../tui/ui/keymap.js';

describe('keymap', () => {
  it('default hint includes the top-level keys', () => {
    const hint = keymapHintFor(undefined);
    expect(hint).toContain('↑/↓');
    expect(hint).toContain('esc');
    expect(hint).toContain('?');
    expect(hint).toContain('q');
  });

  it('select context filters in select-only bindings', () => {
    const hint = keymapHintFor('select');
    expect(hint).toContain('↑/↓');
    expect(hint).not.toContain('alt-↵');
  });

  it('multiline context includes the alt-↵ binding', () => {
    const hint = keymapHintFor('multiline');
    expect(hint).toContain('alt-↵');
  });

  it('every binding has a non-empty keys and description', () => {
    for (const b of KEY_BINDINGS) {
      expect(b.keys.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
    }
  });
});
