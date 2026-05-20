/**
 * Single-line text input (arch-tui-layout.md §3.5).
 *
 * Uses OpenTUI's `<input>` — it handles cursor movement and editing.
 * Submits on enter, cancels on esc.
 */
import { createSignal, Show } from 'solid-js';
import { useKeyboard } from '@opentui/solid';
import type { PromptRequest, UiStore } from '../store.js';
import { theme } from '../theme.js';

type TextPrompt = Extract<PromptRequest, { kind: 'text' }>;

export interface TextFieldProps {
  readonly ui: UiStore;
  readonly prompt: TextPrompt;
}

export function TextField(props: TextFieldProps) {
  const [error, setError] = createSignal<string | undefined>(undefined);

  useKeyboard((k) => {
    if (k.name === 'escape' || (k.ctrl && k.name === 'c')) {
      props.ui.resolve({ kind: 'cancel' });
    }
  });

  const submit = (v: string) => {
    const validate = props.prompt.validate;
    const err = validate ? validate(v) : undefined;
    if (err) {
      setError(err);
      return;
    }
    props.ui.resolve({ kind: 'text', value: v });
  };

  return (
    <box flexDirection="column">
      <text fg={theme.fgMuted}>{props.prompt.label}</text>
      <box marginTop={1}>
        <input
          focused
          value={props.prompt.default ?? ''}
          placeholder={props.prompt.placeholder ?? ''}
          onInput={() => {
            if (error()) setError(undefined);
          }}
          onSubmit={((v: string | { value: string }) =>
            submit(typeof v === 'string' ? v : v.value)) as never}
        />
      </box>
      <Show when={error()}>
        <box marginTop={1}>
          <text fg={theme.error}>{error()}</text>
        </box>
      </Show>
    </box>
  );
}
