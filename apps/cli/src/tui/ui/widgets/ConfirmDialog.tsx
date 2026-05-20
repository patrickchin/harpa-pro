/**
 * Yes/no confirm dialog (arch-tui-layout.md §3.5).
 *
 * Bindings:
 *   y / left  → yes (resolve true)
 *   n / right → no  (resolve false)
 *   ↵         → confirm current default
 *   esc       → cancel
 */
import { createSignal } from 'solid-js';
import { useKeyboard } from '@opentui/solid';
import type { PromptRequest, UiStore } from '../store.js';
import { theme } from '../theme.js';

type ConfirmPrompt = Extract<PromptRequest, { kind: 'confirm' }>;

export interface ConfirmDialogProps {
  readonly ui: UiStore;
  readonly prompt: ConfirmPrompt;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const [choice, setChoice] = createSignal<boolean>(props.prompt.default ?? true);

  useKeyboard((k) => {
    if (k.name === 'escape' || (k.ctrl && k.name === 'c')) {
      props.ui.resolve({ kind: 'cancel' });
      return;
    }
    if (k.name === 'y') {
      props.ui.resolve({ kind: 'confirm', value: true });
      return;
    }
    if (k.name === 'n') {
      props.ui.resolve({ kind: 'confirm', value: false });
      return;
    }
    if (k.name === 'left') setChoice(true);
    if (k.name === 'right') setChoice(false);
    if (k.name === 'tab') setChoice(!choice());
    if (k.name === 'return') {
      props.ui.resolve({ kind: 'confirm', value: choice() });
    }
  });

  return (
    <box flexDirection="column">
      <text fg={theme.fgMuted}>{props.prompt.label}</text>
      <box flexDirection="row" marginTop={1}>
        <text
          fg={choice() ? theme.selectionFg : theme.fg}
          bg={choice() ? theme.selectionBg : undefined}
        >
          {' Yes '}
        </text>
        <text fg={theme.fgDim}>{'  '}</text>
        <text
          fg={!choice() ? theme.selectionFg : theme.fg}
          bg={!choice() ? theme.selectionBg : undefined}
        >
          {' No '}
        </text>
      </box>
      <box marginTop={1}>
        <text fg={theme.fgDim}>y/n · ←/→ · ↵ submit · esc cancel</text>
      </box>
    </box>
  );
}
