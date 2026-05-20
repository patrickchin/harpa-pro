/**
 * Read-only viewport (arch-tui-layout.md §3.2).
 *
 * The pane title is the **current navigation path** rendered URL-style
 * (`/projects/acme/reports/12`). That makes "where am I" the most
 * visible piece of state in the app — every screen pushes its segment
 * (with id/slug) onto the breadcrumb on entry and pops it on exit, so
 * the path follows the user without any per-screen plumbing.
 *
 * Below the title: optional header lines (project meta, etc), one of
 * the body variants (list / detail / result / empty), then the
 * rolling log tail. No keystroke handling — the user reads this pane
 * and acts in the interaction pane.
 */
import { For, Show } from 'solid-js';
import type { UiStore, ViewportBody } from './store.js';
import { theme, logColor } from './theme.js';

export interface ViewportPaneProps {
  readonly ui: UiStore;
}

function pathOf(crumbs: ReadonlyArray<string>): string {
  if (crumbs.length === 0) return '/';
  return '/' + crumbs.join('/');
}

export function ViewportPane(props: ViewportPaneProps) {
  const v = () => props.ui.state.viewport;
  const path = () => pathOf(props.ui.state.status.breadcrumb);
  return (
    <box
      flexDirection="column"
      flexGrow={1}
      border={['top', 'right', 'bottom']}
      borderColor={theme.borderIdle}
      title={path()}
      titleAlignment="left"
      padding={1}
    >
      <Show when={v().title}>
        <text fg={theme.fg}>{v().title}</text>
      </Show>
      <Show when={v().headerLines.length > 0}>
        <box flexDirection="column" marginTop={v().title ? 0 : 0} marginBottom={1}>
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
