/**
 * Screen driver for the navigational TUI (arch-tui-layout-v2.md §5).
 *
 * A `Screen` is an info header + viewport body + context-aware action
 * menu rendered in a loop. Actions can be:
 *   - leaf: run a registry command with optional prefill
 *   - screen: open a child screen (drill-down)
 *   - flow: run an arbitrary async function
 *   - separator: visual divider (not selectable)
 *
 * `header()` returns the rank-2 headline + rank-3 subline lines for
 * the viewport pane. Re-fetched only when an action declares
 * `refreshHeader`. `header() === undefined` means the underlying
 * resource went away → driver pops.
 *
 * The driver pushes a breadcrumb on entry and pops on exit so the
 * TopBar always reflects "where am I".
 */
import type { Prompter } from './prompter.js';
import type { Session } from './session.js';
import type { ViewportBody } from './ui/store.js';
import { type ViewportSink, nullViewportSink } from './viewport-sink.js';
import { runCommand } from './execute.js';
import { findLeaf as findLeafImpl } from './registry-find.js';

export interface HeaderInfo {
  /** Rank-2 headline ("what we're looking at"). */
  readonly title: string;
  /**
   * Rank-3 subline lines. The first line is rendered as the subline
   * in the viewport; remaining lines flow into the `body` rendering
   * via the screen's `body()` method (kept separate so screens that
   * just want a one-line summary don't have to build a body).
   */
  readonly lines: ReadonlyArray<string>;
}

export interface ScreenContext {
  readonly prompter: Prompter;
  readonly session: Session;
  readonly viewport: ViewportSink;
}

export type ScreenAction =
  | {
      kind: 'leaf';
      label: string;
      hint?: string;
      cittyPath: ReadonlyArray<string>;
      prefill?: (session: Session) => Readonly<Record<string, unknown>>;
      confirm?: { label: string };
      refreshHeader?: boolean;
    }
  | {
      kind: 'screen';
      label: string;
      hint?: string;
      open: (ctx: ScreenContext) => Screen;
      refreshHeader?: boolean;
    }
  | {
      kind: 'flow';
      label: string;
      hint?: string;
      run: (ctx: ScreenContext) => Promise<void>;
      refreshHeader?: boolean;
    }
  | { kind: 'separator'; label?: string };

export interface Screen {
  readonly id: string;
  readonly breadcrumb?: string | ((ctx: ScreenContext) => string);
  header(ctx: ScreenContext): Promise<HeaderInfo | undefined>;
  body?(ctx: ScreenContext): ViewportBody | undefined;
  actions(ctx: ScreenContext): ReadonlyArray<ScreenAction>;
  backLabel?: string;
  onExit?(ctx: ScreenContext): void;
}

/** Synthetic action that just forces a header refresh. */
export function refreshAction(label = 'Refresh'): ScreenAction {
  return {
    kind: 'flow',
    label,
    run: async () => {},
    refreshHeader: true,
  };
}

const BACK = '__back__';

export async function runScreen(
  prompter: Prompter,
  session: Session,
  screen: Screen,
  viewport: ViewportSink = nullViewportSink(),
): Promise<void> {
  const ctx: ScreenContext = { prompter, session, viewport };
  let header = await screen.header(ctx);
  const crumb =
    typeof screen.breadcrumb === 'function'
      ? screen.breadcrumb(ctx)
      : screen.breadcrumb;
  if (crumb) viewport.pushBreadcrumb(crumb);
  try {
    for (;;) {
      if (header === undefined) break;
      viewport.setHeadline(header.title, header.lines[0]);
      viewport.setBody(screen.body?.(ctx));
      // Mirror the header into the rolling log tail via prompter.note
      // so scriptedPrompter-based tests can assert on the header text
      // via prompter.transcript.
      prompter.note(header.lines.join('\n'), header.title);

      const actions = screen.actions(ctx);
      type NonSep = Exclude<ScreenAction, { kind: 'separator' }>;
      const selectable: NonSep[] = actions.filter(
        (a): a is NonSep => a.kind !== 'separator',
      );
      const choice = await prompter.select<string>({
        label: '',
        options: [
          ...selectable.map((a, i) => {
            const o: { value: string; label: string; hint?: string } = {
              value: String(i),
              label: a.label,
            };
            if (a.hint !== undefined) o.hint = a.hint;
            return o;
          }),
          { value: BACK, label: screen.backLabel ?? '← back' },
        ],
      });

      if (prompter.isCancel(choice) || choice === BACK) break;

      const action = selectable[Number(choice)];
      if (!action) continue;

      let didMutate = false;
      switch (action.kind) {
        case 'leaf': {
          if (action.confirm) {
            const ok = await prompter.confirm({ label: action.confirm.label });
            if (prompter.isCancel(ok) || !ok) break;
          }
          const leaf = findLeafImpl(action.cittyPath);
          if (!leaf) {
            prompter.log.error(
              `Screen ${screen.id}: no registry leaf for [${action.cittyPath.join(' ')}]`,
            );
            break;
          }
          const prefill = action.prefill?.(session);
          viewport.setInFlight(action.label);
          try {
            const r = await runCommand(
              prompter,
              session,
              leaf,
              prefill ? { prefill: { ...prefill } } : {},
            );
            didMutate = r.status === 'ok' && Boolean(action.refreshHeader);
          } finally {
            viewport.setInFlight(undefined);
          }
          break;
        }
        case 'screen': {
          const child = action.open(ctx);
          await runScreen(prompter, session, child, viewport);
          didMutate = Boolean(action.refreshHeader);
          break;
        }
        case 'flow': {
          viewport.setInFlight(action.label);
          try {
            await action.run(ctx);
          } finally {
            viewport.setInFlight(undefined);
          }
          didMutate = Boolean(action.refreshHeader);
          break;
        }
      }
      if (didMutate) header = await screen.header(ctx);
    }
    screen.onExit?.(ctx);
  } finally {
    if (crumb) viewport.popBreadcrumb();
  }
}
