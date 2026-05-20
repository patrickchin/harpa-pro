/**
 * Interaction pane (arch-tui-layout.md §3.2, §3.5).
 *
 * Renders exactly one widget — whichever matches
 * `state.currentPrompt.kind` — or an idle/spinner block when there
 * is no outstanding prompt.
 *
 * Each widget owns its own keystroke handling and calls
 * `ui.resolve(...)` to settle the awaiting `opentuiPrompter` call.
 */
import { Match, Show, Switch } from 'solid-js';
import type { PromptRequest, UiStore } from './store.js';
import { theme } from './theme.js';
import { SelectList } from './widgets/SelectList.js';
import { TextField } from './widgets/TextField.js';
import { MultilineField } from './widgets/MultilineField.js';
import { FilePathField } from './widgets/FilePathField.js';
import { ConfirmDialog } from './widgets/ConfirmDialog.js';
import { Spinner } from './widgets/Spinner.js';

export interface InteractionPaneProps {
  readonly ui: UiStore;
}

function promptOfKind<K extends PromptRequest['kind']>(
  p: PromptRequest | undefined,
  kind: K,
): Extract<PromptRequest, { kind: K }> | undefined {
  return p?.kind === kind ? (p as Extract<PromptRequest, { kind: K }>) : undefined;
}

export function InteractionPane(props: InteractionPaneProps) {
  const prompt = () => props.ui.state.currentPrompt;
  const inFlight = () => props.ui.state.inFlight;

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      border
      borderColor={theme.borderActive}
      title="action"
      titleAlignment="left"
      padding={1}
    >
      <Switch
        fallback={
          <Show
            when={inFlight()}
            fallback={<text fg={theme.fgDim}>idle — waiting for next step</text>}
          >
            {(busy: () => { readonly label: string }) => <Spinner label={busy().label} />}
          </Show>
        }
      >
        <Match when={promptOfKind(prompt(), 'select')}>
          {(p: () => Extract<PromptRequest, { kind: 'select' }>) => <SelectList ui={props.ui} prompt={p()} />}
        </Match>
        <Match when={promptOfKind(prompt(), 'text')}>
          {(p: () => Extract<PromptRequest, { kind: 'text' }>) => <TextField ui={props.ui} prompt={p()} />}
        </Match>
        <Match when={promptOfKind(prompt(), 'multiline')}>
          {(p: () => Extract<PromptRequest, { kind: 'multiline' }>) => <MultilineField ui={props.ui} prompt={p()} />}
        </Match>
        <Match when={promptOfKind(prompt(), 'filePath')}>
          {(p: () => Extract<PromptRequest, { kind: 'filePath' }>) => <FilePathField ui={props.ui} prompt={p()} />}
        </Match>
        <Match when={promptOfKind(prompt(), 'confirm')}>
          {(p: () => Extract<PromptRequest, { kind: 'confirm' }>) => <ConfirmDialog ui={props.ui} prompt={p()} />}
        </Match>
      </Switch>
    </box>
  );
}
