/**
 * Single-line select widget (arch-tui-layout-v2.md §7).
 *
 * Wraps OpenTUI's native `<select>` — it owns arrow/enter handling.
 * Esc cancels (resolves with `{ kind: 'cancel' }`).
 *
 * The prompt's `label` is rendered as a muted helper line above the
 * list, but suppressed entirely when it's the empty string or the
 * driver default `'Action'` — those generic labels would compete with
 * the breadcrumb in `TopBar` for the user's attention.
 */
import { createMemo, Show } from 'solid-js';
import { useKeyboard } from '@opentui/solid';
import type { PromptRequest, UiStore } from '../store.js';
import { theme } from '../theme.js';

type SelectPrompt = Extract<PromptRequest, { kind: 'select' }>;

export interface SelectListProps {
  readonly ui: UiStore;
  readonly prompt: SelectPrompt;
}

function isGenericLabel(label: string): boolean {
  const t = label.trim();
  return t === '' || t === 'Action';
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
    if (k.name === 'escape' || (k.name === 'h' && !k.ctrl && !k.meta)) {
      props.ui.resolve({ kind: 'cancel' });
    }
  });

  // Ranger-style vim bindings on top of OpenTUI's defaults
  // (which already map j/k to down/up, return to select).
  const keyBindings = [
    { name: 'l', action: 'select-current' as const },
  ];

  return (
    <box flexDirection="column" flexGrow={1}>
      <Show when={!isGenericLabel(props.prompt.label)}>
        <text fg={theme.fgMuted}>{props.prompt.label}</text>
      </Show>
      <select
        flexGrow={1}
        marginTop={isGenericLabel(props.prompt.label) ? 0 : 1}
        focused
        options={options()}
        selectedIndex={initialIndex()}
        focusedBackgroundColor={theme.bg}
        selectedBackgroundColor={theme.selectionBg}
        selectedTextColor={theme.selectionFg}
        showDescription
        wrapSelection
        keyBindings={keyBindings}
        onChange={(_i: number, opt: { value?: unknown } | null) => {
          const cb = props.prompt.onHighlight;
          if (cb && opt && opt.value !== undefined) cb(String(opt.value));
        }}
        onSelect={(_i, opt) => {
          if (opt) {
            props.ui.resolve({ kind: 'select', value: String(opt.value) });
          }
        }}
      />
    </box>
  );
}
