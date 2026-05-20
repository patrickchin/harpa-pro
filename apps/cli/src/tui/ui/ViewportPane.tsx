/**
 * Read-only viewport (arch-tui-layout-v2.md §2.2, §6).
 *
 * Renders the content for the current breadcrumb in priority order:
 *   - headline (rank 2)  : single sentence identifying what's here
 *   - subline  (rank 3)  : short summary line under the headline
 *   - body              : record / table / form-progress / empty
 *
 * No box title — the breadcrumb in `TopBar` is the title of this
 * pane. No log tail — that moved to `LogStrip`.
 */
import { For, Show } from 'solid-js';
import type { UiStore, ViewportBody, ViewportListItem } from './store.js';
import { theme } from './theme.js';

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
      padding={1}
    >
      <Show when={v().headline}>
        <text fg={theme.fg}>{v().headline!}</text>
      </Show>
      <Show when={v().subline}>
        <text fg={theme.fgMuted}>{v().subline!}</text>
      </Show>
      <Show when={v().headline || v().subline}>
        <box height={1} />
      </Show>

      <box flexDirection="column" flexGrow={1}>
        <BodyView body={v().body} />
      </box>
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
            return <ListBody items={b.items} columnTitles={b.columnTitles} />;
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

/**
 * Renders a list with optional structured columns.
 *
 * Layout: label is always shown; subsequent columns are joined with
 * two-space gaps. When the column data is sparse (most items have no
 * extra columns) we fall back to the `hint` for narrow rendering.
 */
function ListBody(props: {
  items: ReadonlyArray<ViewportListItem>;
  columnTitles?: ReadonlyArray<string>;
}) {
  const items = () => props.items;
  // Header row: render each title in its own slot so it lines up with the
  // label / column slots below (label is followed by 2-space gaps).
  const headerCells = (): string[] => {
    const t = props.columnTitles;
    if (!t || t.length === 0) return [];
    return t.map((s) => s);
  };
  return (
    <box flexDirection="column">
      <Show when={headerCells().length > 0}>
        <box flexDirection="row">
          <text fg={theme.fgMuted}>{headerCells().join('  ')}</text>
        </box>
        <box height={0} />
      </Show>
      <For each={items()}>
        {(item) => (
          <box flexDirection="row">
            <text fg={theme.fg}>{item.label}</text>
            <Show when={item.columns && item.columns.length > 0}>
              <text fg={theme.fgMuted}>{`  ${(item.columns ?? []).join('  ')}`}</text>
            </Show>
            <Show when={(!item.columns || item.columns.length === 0) && item.hint}>
              <text fg={theme.fgMuted}>{`  ${item.hint}`}</text>
            </Show>
          </box>
        )}
      </For>
    </box>
  );
}
