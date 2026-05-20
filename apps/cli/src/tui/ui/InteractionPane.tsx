/**
 * Interaction pane (arch-tui-layout-v2.md §2.2, §7).
 *
 * Renders exactly one widget — whichever matches
 * `interaction.currentPrompt.kind` — or an idle/spinner block when
 * there is no outstanding prompt.
 *
 * No box title. The keymap hint (rank 5) is rendered as the pane's
 * footer line — it replaces the v4.1 status-bar hint.
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
  const prompt = () => props.ui.state.interaction.currentPrompt;
  const inFlight = () => props.ui.state.interaction.inFlight;
  const keymapHint = () => props.ui.state.interaction.keymapHint;

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      border
      borderColor={theme.borderActive}
      padding={1}
    >
      <box flexDirection="column" flexGrow={1}>
        <Switch
          fallback={
            <Show
              when={inFlight()}
              fallback={<text fg={theme.fgDim}>idle</text>}
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
      <Show when={keymapHint()}>
        <text fg={theme.fgDim}>{keymapHint()}</text>
      </Show>
    </box>
  );
}
