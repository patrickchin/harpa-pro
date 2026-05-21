/**
 * Top-level layout for the OpenTUI TUI (arch-tui-layout-v3.md §1).
 *
 *   ┌─ TopBar (breadcrumb · identity) ────────────────────────────┐
 *   │ Interaction (1fr)             ¦ Viewport (2fr)               │
 *   │ "what you can do"             ¦ "what's here"                │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ LogStrip (one line · fixture mode right)                     │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * The viewport also serves as the ranger-style preview pane: as the
 * user moves the highlight in the Interaction pane, it shows the
 * highlighted action's `preview()` (and reverts to the screen's
 * default body on non-previewing rows).
 */
import type { UiStore } from './store.js';
import { TopBar } from './TopBar.js';
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
        <box flexBasis={0} flexGrow={1} minWidth={24}>
          <InteractionPane ui={props.ui} />
        </box>
        <box flexBasis={0} flexGrow={2} minWidth={32}>
          <ViewportPane ui={props.ui} />
        </box>
      </box>
      <box height={1}>
        <LogStrip ui={props.ui} />
      </box>
    </box>
  );
}
