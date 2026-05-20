/**
 * One-line status bar (arch-tui-layout.md §3.2).
 *
 * Shows API url, user, and the keymap hint for the current widget
 * context. The navigation path lives in the viewport pane title now
 * (the "context panel" is the source of truth for "where am I"), so
 * the status bar no longer repeats it.
 */
import { Show } from 'solid-js';
import type { UiStore } from './store.js';
import { theme } from './theme.js';

export interface StatusBarProps {
  readonly ui: UiStore;
}

export function StatusBar(props: StatusBarProps) {
  const s = () => props.ui.state.status;
  return (
    <box
      flexDirection="row"
      backgroundColor={theme.statusBarBg}
      paddingLeft={1}
      paddingRight={1}
      width="100%"
    >
      <text fg={theme.fgMuted}>{s().apiUrl || '—'}</text>
      <Show when={s().user}>
        <text fg={theme.fgMuted}>{` · ${s().user}`}</text>
      </Show>
      <box flexGrow={1} />
      <text fg={theme.fgMuted}>{s().keymapHint}</text>
    </box>
  );
}
