/**
 * Top-level layout for the OpenTUI TUI (arch-tui-layout.md §3.2).
 *
 * Two-column split (interaction | viewport) over a one-line status
 * bar. Both panes read the same `UiStore`; the interaction pane is
 * on the left where the eye lands first, the viewport on the right
 * shows context for the current action.
 *
 *   ┌── interaction ──┬──────────────── viewport ─────────────────┐
 *   │                 │ header                                    │
 *   │ prompt widget   │ body                                      │
 *   │                 │ log tail                                  │
 *   └─────────────────┴───────────────────────────────────────────┘
 *   status bar (api · user · breadcrumb · keymap hint)
 */
import type { UiStore } from './store.js';
import { ViewportPane } from './ViewportPane.js';
import { InteractionPane } from './InteractionPane.js';
import { StatusBar } from './StatusBar.js';
import { theme } from './theme.js';

export interface AppRootProps {
  readonly ui: UiStore;
}

export function AppRoot(props: AppRootProps) {
  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={theme.bg}>
      <box flexDirection="row" flexGrow={1}>
        <box flexBasis={0} flexGrow={1} minWidth={24}>
          <InteractionPane ui={props.ui} />
        </box>
        <box flexBasis={0} flexGrow={2} minWidth={20}>
          <ViewportPane ui={props.ui} />
        </box>
      </box>
      <box height={1}>
        <StatusBar ui={props.ui} />
      </box>
    </box>
  );
}
