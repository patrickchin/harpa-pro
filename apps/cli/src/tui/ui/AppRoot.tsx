/**
 * Top-level layout for the OpenTUI TUI — ranger-style Miller columns
 * (arch-tui-layout-v2.md §2).
 *
 *   ┌─ TopBar (breadcrumb · identity) ──────────────────────────────────────┐
 *   │ Parent (1fr) │ Interaction (2fr)        │ Preview / Viewport (3fr)    │
 *   │ where we     │ what you can do here     │ context of the highlighted  │
 *   │ came from    │ (select / input)         │ row (or this screen's body) │
 *   ├───────────────────────────────────────────────────────────────────────┤
 *   │ LogStrip (one line · fixture mode right)                              │
 *   └───────────────────────────────────────────────────────────────────────┘
 */
import type { UiStore } from './store.js';
import { TopBar } from './TopBar.js';
import { ParentPane } from './ParentPane.js';
import { ViewportPane } from './ViewportPane.js';
import { InteractionPane } from './InteractionPane.js';
import { LogStrip } from './LogStrip.js';
import { theme } from './theme.js';

export interface AppRootProps {
  readonly ui: UiStore;
}

export function AppRoot(props: AppRootProps) {
  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={theme.bg}>
      <box height={1}>
        <TopBar ui={props.ui} />
      </box>
      <box flexDirection="row" flexGrow={1}>
        <box flexBasis={0} flexGrow={1} minWidth={16}>
          <ParentPane ui={props.ui} />
        </box>
        <box flexBasis={0} flexGrow={2} minWidth={24}>
          <InteractionPane ui={props.ui} />
        </box>
        <box flexBasis={0} flexGrow={3} minWidth={32}>
          <ViewportPane ui={props.ui} />
        </box>
      </box>
      <box height={1}>
        <LogStrip ui={props.ui} />
      </box>
    </box>
  );
}
