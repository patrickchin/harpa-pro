/**
 * One-line status bar (arch-tui-layout.md §3.2).
 *
 * Replaces clack's intro/outro framing. Shows API url, user,
 * breadcrumb (the navigation path through the screen tree), and the
 * keymap hint for the current widget context.
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
      <Show when={s().breadcrumb.length > 0}>
        <text fg={theme.fg}>{` · ${s().breadcrumb.join(' › ')}`}</text>
      </Show>
      <box flexGrow={1} />
      <text fg={theme.fgMuted}>{s().keymapHint}</text>
    </box>
  );
}
