/**
 * Multiline text input (arch-tui-layout.md §3.5).
 *
 * Enter inserts a newline; Alt+Enter (or Ctrl+D) submits — matches
 * the convention announced in the keymap. Esc cancels.
 */
import { createSignal } from 'solid-js';
import { useKeyboard } from '@opentui/solid';
import type { PromptRequest, UiStore } from '../store.js';
import { theme } from '../theme.js';

type MultilinePrompt = Extract<PromptRequest, { kind: 'multiline' }>;

export interface MultilineFieldProps {
  readonly ui: UiStore;
  readonly prompt: MultilinePrompt;
}

export function MultilineField(props: MultilineFieldProps) {
  const [value, setValue] = createSignal('');

  useKeyboard((k) => {
    if (k.name === 'escape' || (k.ctrl && k.name === 'c')) {
      props.ui.resolve({ kind: 'cancel' });
      return;
    }
    if ((k.meta && k.name === 'return') || (k.ctrl && k.name === 'd')) {
      props.ui.resolve({ kind: 'text', value: value() });
    }
  });

  return (
    <box flexDirection="column" flexGrow={1}>
      <text fg={theme.fgMuted}>{props.prompt.label}</text>
      <text fg={theme.fgDim}>alt-↵ submit · esc cancel</text>
      <box flexGrow={1} marginTop={1}>
        <textarea
          focused
          initialValue=""
          placeholder={props.prompt.placeholder ?? ''}
          onContentChange={
            ((e: string | { content: string }) => {
              setValue(typeof e === 'string' ? e : e.content);
            }) as never
          }
        />
      </box>
    </box>
  );
}
