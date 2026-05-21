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
 *
 * Focus-transfer: when the active prompt is `viewportSelect`, the
 * body is replaced with an interactive select widget rendered in
 * this pane, the border colour becomes `borderActive`, and the
 * InteractionPane drops to a muted hint.
 */
import { createMemo, For, Show } from 'solid-js';
import { useKeyboard } from '@opentui/solid';
import type { PromptRequest, UiStore, ViewportBody, ViewportListItem } from './store.js';
import { theme } from './theme.js';

export interface ViewportPaneProps {
  readonly ui: UiStore;
}

type ViewportSelectPrompt = Extract<PromptRequest, { kind: 'viewportSelect' }>;

export function ViewportPane(props: ViewportPaneProps) {
  const v = () => props.ui.state.viewport;
  const prompt = () => props.ui.state.interaction.currentPrompt;
  const vsPrompt = (): ViewportSelectPrompt | undefined => {
    const p = prompt();
    return p?.kind === 'viewportSelect' ? p : undefined;
  };
  const focused = () => vsPrompt() !== undefined;
  return (
    <box
      flexDirection="column"
      flexGrow={1}
      border
      borderColor={focused() ? theme.borderActive : theme.borderIdle}
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
        <Show
          when={vsPrompt()}
          fallback={<BodyView body={v().body} />}
        >
          {(p: () => ViewportSelectPrompt) => (
            <ViewportSelect ui={props.ui} prompt={p()} />
          )}
        </Show>
      </box>
    </box>
  );
}

function rowText(it: ViewportSelectPrompt['items'][number]): string {
  const cols = it.columns && it.columns.length > 0 ? `   ${it.columns.join('  ')}` : '';
  const hint = !it.columns && it.hint ? `   ${it.hint}` : '';
  return `${it.label}${cols}${hint}`;
}

function ViewportSelect(props: { ui: UiStore; prompt: ViewportSelectPrompt }) {
  const options = createMemo(() =>
    props.prompt.items.map((it) => ({
      name: rowText(it),
      description: '',
      value: it.value,
    })),
  );
  const initialIndex = () => {
    const v = props.prompt.initialValue;
    if (!v) return 0;
    const i = props.prompt.items.findIndex((it) => it.value === v);
    return i < 0 ? 0 : i;
  };

  useKeyboard((k) => {
    if (k.name === 'escape' || (k.name === 'h' && !k.ctrl && !k.meta)) {
      props.ui.resolve({ kind: 'cancel' });
    }
  });

  const keyBindings = [{ name: 'l', action: 'select-current' as const }];

  return (
    <box flexDirection="column" flexGrow={1}>
      <Show when={props.prompt.label}>
        <text fg={theme.fgMuted}>{props.prompt.label}</text>
        <box height={1} />
      </Show>
      <select
        flexGrow={1}
        focused
        options={options()}
        selectedIndex={initialIndex()}
        focusedBackgroundColor={theme.bg}
        selectedBackgroundColor={theme.selectionBg}
        selectedTextColor={theme.selectionFg}
        wrapSelection
        keyBindings={keyBindings}
        onChange={(_i: number, opt: { value?: unknown } | null) => {
          const cb = props.prompt.onHighlight;
          if (cb && opt && opt.value !== undefined) cb(String(opt.value));
        }}
        onSelect={(_i, opt) => {
          if (opt) {
            props.ui.resolve({ kind: 'select', value: String(opt.value) });
          }
        }}
      />
    </box>
  );
}

function BodyView(props: { body: ViewportBody | undefined }) {
  return (
    <Show
      when={props.body}
      fallback={<text fg={theme.fgDim}>—</text>}
      keyed
    >
      {(body: ViewportBody) => {
        switch (body.kind) {
          case 'empty':
            return <text fg={theme.fgDim}>{body.hint ?? '(empty)'}</text>;
          case 'result':
            return <text fg={theme.fg}>{body.content}</text>;
          case 'list':
            return <ListBody items={body.items} columnTitles={body.columnTitles} />;
          case 'detail':
            return (
              <box flexDirection="column">
                <For each={body.sections}>
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
