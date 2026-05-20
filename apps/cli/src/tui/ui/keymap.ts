/**
 * Static keymap text shown in the status bar and the `?` help overlay.
 *
 * The actual key handling lives in each widget (SelectList,
 * TextField, ...). This module just centralises the strings so the
 * status bar and help overlay agree.
 *
 * See arch-tui-layout.md §3.6.
 */
export interface KeyBinding {
  readonly keys: string;
  readonly description: string;
  /** Optional widget filter — undefined means "global". */
  readonly context?: 'select' | 'text' | 'multiline' | 'confirm' | 'top';
}

export const KEY_BINDINGS: ReadonlyArray<KeyBinding> = [
  { keys: '↑/↓', description: 'select', context: 'select' },
  { keys: '↵', description: 'submit' },
  { keys: 'esc', description: 'back' },
  { keys: 'alt-↵', description: 'newline', context: 'multiline' },
  { keys: 'pgup/pgdn', description: 'scroll viewport' },
  { keys: '?', description: 'help' },
  { keys: 'q', description: 'quit', context: 'top' },
  { keys: 'ctrl-c', description: 'quit' },
];

const DEFAULT_HINT = '↑/↓ select · ↵ open · esc back · ctrl-c quit · ? help';

export function keymapHintFor(
  ctx: KeyBinding['context'] | undefined,
): string {
  if (!ctx) return DEFAULT_HINT;
  const bindings = KEY_BINDINGS.filter(
    (b) => b.context === undefined || b.context === ctx,
  );
  return bindings.map((b) => `${b.keys} ${b.description}`).join(' · ');
}
