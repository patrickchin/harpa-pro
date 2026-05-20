/**
 * Parent column for the ranger-style Miller layout
 * (arch-tui-layout-v2.md §2.3).
 *
 * Read-only list of the parent screen's action labels with the
 * entry-point row highlighted so the user can see where they came
 * from. At the root there is no parent frame; we render a dim
 * placeholder so the column reserves space and the layout doesn't
 * jump as the user navigates.
 *
 * 'h' / Esc on the active middle pane is what actually pops back —
 * this pane is purely informational.
 */
import { For, Show } from 'solid-js';
import type { UiStore } from './store.js';
import { theme } from './theme.js';

export interface ParentPaneProps {
  readonly ui: UiStore;
}

export function ParentPane(props: ParentPaneProps) {
  const parent = () => props.ui.state.parent;
  return (
    <box
      flexDirection="column"
      flexGrow={1}
      border={['top', 'left', 'bottom']}
      borderColor={theme.borderIdle}
      padding={1}
    >
      <Show
        when={parent()}
        fallback={<text fg={theme.fgDim}>—</text>}
      >
        {(frame: () => NonNullable<ReturnType<typeof parent>>) => (
          <box flexDirection="column">
            <For each={frame().items}>
              {(label, i) => {
                const isHighlight = i() === frame().highlightedIndex;
                return (
                  <box flexDirection="row">
                    <text
                      fg={isHighlight ? theme.selectionFg : theme.fgMuted}
                      bg={isHighlight ? theme.selectionBg : undefined}
                    >
                      {label}
                    </text>
                  </box>
                );
              }}
            </For>
          </box>
        )}
      </Show>
    </box>
  );
}
