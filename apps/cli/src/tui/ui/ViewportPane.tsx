/**
 * Read-only viewport (arch-tui-layout.md §3.2).
 *
 * Shows `state.viewport`: a title bar, header lines (e.g. project
 * meta), one of the body variants (list / detail / result / empty),
 * and the rolling log tail. No keystroke handling — the user reads
 * this pane and acts in the interaction pane.
 */
import { For, Show } from 'solid-js';
import type { UiStore, ViewportBody } from './store.js';
import { theme, logColor } from './theme.js';

export interface ViewportPaneProps {
  readonly ui: UiStore;
}

export function ViewportPane(props: ViewportPaneProps) {
  const v = () => props.ui.state.viewport;
  return (
    <box
      flexDirection="column"
      flexGrow={1}
      border={['top', 'right', 'bottom']}
      borderColor={theme.borderIdle}
      title={v().title || 'harpa'}
      titleAlignment="left"
      padding={1}
    >
      <Show when={v().headerLines.length > 0}>
        <box flexDirection="column" marginBottom={1}>
          <For each={v().headerLines}>
            {(line) => <text fg={theme.fgMuted}>{line}</text>}
          </For>
        </box>
      </Show>

      <box flexDirection="column" flexGrow={1}>
        <BodyView body={v().body} />
      </box>

      <Show when={v().logTail.length > 0}>
        <box flexDirection="column" marginTop={1}>
          <For each={v().logTail}>
            {(entry) => (
              <text fg={logColor(entry.kind)}>
                {(entry.title ? `${entry.title}: ` : '') + entry.message}
              </text>
            )}
          </For>
        </box>
      </Show>
    </box>
  );
}

function BodyView(props: { body: ViewportBody | undefined }) {
  return (
    <Show
      when={props.body}
      fallback={<text fg={theme.fgDim}>—</text>}
    >
      {(body: () => ViewportBody) => {
        const b = body();
        switch (b.kind) {
          case 'empty':
            return <text fg={theme.fgDim}>{b.hint ?? '(empty)'}</text>;
          case 'result':
            return <text fg={theme.fg}>{b.content}</text>;
          case 'list':
            return (
              <box flexDirection="column">
                <For each={b.items}>
                  {(item) => (
                    <box flexDirection="row">
                      <text fg={theme.fg}>{`• ${item.label}`}</text>
                      <Show when={item.hint}>
                        <text fg={theme.fgMuted}>{`  ${item.hint}`}</text>
                      </Show>
                      <Show when={item.mirrorsAction}>
                        <text fg={theme.fgDim}>{`  → ${item.mirrorsAction}`}</text>
                      </Show>
                    </box>
                  )}
                </For>
              </box>
            );
          case 'detail':
            return (
              <box flexDirection="column">
                <For each={b.sections}>
                  {(section, i) => (
                    <box flexDirection="column" marginTop={i() === 0 ? 0 : 1}>
                      <Show when={section.title}>
                        <text fg={theme.fgMuted}>{section.title!}</text>
                      </Show>
                      <For each={section.lines}>
                        {(line) => <text fg={theme.fg}>{line}</text>}
                      </For>
                    </box>
                  )}
                </For>
              </box>
            );
        }
      }}
    </Show>
  );
}
