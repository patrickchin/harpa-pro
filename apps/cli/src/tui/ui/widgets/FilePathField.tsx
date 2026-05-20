/**
 * File-path input (arch-tui-layout.md §3.5).
 *
 * For now this is just a TextField with a different label and a
 * validate hook. Future work (§7 carve-out) will add path
 * completion / browser.
 */
import { TextField } from './TextField.js';
import type { PromptRequest, UiStore } from '../store.js';

type FilePathPrompt = Extract<PromptRequest, { kind: 'filePath' }>;

export interface FilePathFieldProps {
  readonly ui: UiStore;
  readonly prompt: FilePathPrompt;
}

export function FilePathField(props: FilePathFieldProps) {
  const adapted = {
    kind: 'text' as const,
    label: props.prompt.label,
    placeholder: props.prompt.placeholder,
    validate: props.prompt.validate,
  };
  return <TextField ui={props.ui} prompt={adapted} />;
}
