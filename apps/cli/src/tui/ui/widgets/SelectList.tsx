/**
 * Single-line select widget (arch-tui-layout.md §3.5).
 *
 * Wraps OpenTUI's native `<select>` — it owns arrow/enter handling.
 * Esc cancels (resolves with `{ kind: 'cancel' }`).
 */
import { createMemo } from 'solid-js';
import { useKeyboard } from '@opentui/solid';
import type { PromptRequest, UiStore } from '../store.js';
import { theme } from '../theme.js';

type SelectPrompt = Extract<PromptRequest, { kind: 'select' }>;

export interface SelectListProps {
  readonly ui: UiStore;
  readonly prompt: SelectPrompt;
}

export function SelectList(props: SelectListProps) {
  const options = createMemo(() =>
    props.prompt.options.map((o) => ({
      name: o.label,
      description: o.hint ?? '',
      value: o.value,
    })),
  );

  const initialIndex = () => {
    const v = props.prompt.initialValue;
    if (!v) return 0;
    const i = props.prompt.options.findIndex((o) => o.value === v);
    return i < 0 ? 0 : i;
  };

  useKeyboard((k) => {
    if (k.name === 'escape' || (k.ctrl && k.name === 'c')) {
      props.ui.resolve({ kind: 'cancel' });
    }
  });

  return (
    <box flexDirection="column" flexGrow={1}>
      <text fg={theme.fgMuted}>{props.prompt.label}</text>
      <box flexGrow={1} marginTop={1}>
        <select
          focused
          options={options()}
          selectedIndex={initialIndex()}
          focusedBackgroundColor={theme.bg}
          selectedBackgroundColor={theme.selectionBg}
          selectedTextColor={theme.selectionFg}
          showDescription
          wrapSelection
          onSelect={(_i, opt) => {
            if (opt) {
              props.ui.resolve({ kind: 'select', value: String(opt.value) });
            }
          }}
        />
      </box>
    </box>
  );
}
