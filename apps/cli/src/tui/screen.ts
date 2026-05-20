/**
 * Screen driver for the navigational TUI (arch-tui-nav.md §3.4).
 *
 * A `Screen` is an info header + a context-aware action menu rendered
 * in a loop. Actions can be:
 *   - leaf: run a registry command with optional prefill
 *   - screen: open a child screen (drill-down)
 *   - flow: run an arbitrary async function
 *   - separator: visual divider (not selectable)
 *
 * `header()` is fetched once on entry and re-fetched only when an
 * action declares `refreshHeader`. `header() === undefined` means
 * the underlying resource went away → driver pops.
 */
import type { Prompter } from './prompter.js';
import type { Session } from './session.js';
import type { ViewportBody } from './ui/store.js';
import { type ViewportSink, nullViewportSink } from './viewport-sink.js';
import { runCommand } from './execute.js';
import { findLeaf as findLeafImpl } from './registry-find.js';

export interface HeaderInfo {
  readonly title: string;
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
      /** Lazy so the latest session state is read each render. */
      prefill?: (session: Session) => Readonly<Record<string, unknown>>;
      /** Confirm prompt before running. */
      confirm?: { label: string };
      /** Re-fetch header after success. Default: false. */
      refreshHeader?: boolean;
    }
  | {
      kind: 'screen';
      label: string;
      hint?: string;
      open: (ctx: ScreenContext) => Screen;
      /** Re-fetch header after the child screen returns. */
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
  /** Breadcrumb segment pushed onto the status bar on entry. */
  readonly breadcrumb?: string;
  header(ctx: ScreenContext): Promise<HeaderInfo | undefined>;
  /**
   * Optional read-only body shown in the viewport while this screen
   * is active. Re-evaluated on every render. Default: undefined
   * (viewport just shows the header).
   */
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
    run: async () => {
      /* no-op — driver re-renders on return */
    },
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
  if (screen.breadcrumb) viewport.pushBreadcrumb(screen.breadcrumb);
  try {
    for (;;) {
      if (header === undefined) break;
      viewport.setHeader(header.title, header.lines);
      viewport.setBody(screen.body?.(ctx));
      // For backwards compat with the classic clack TUI: still emit
      // the header inline. Under opentui the viewport pane shows it
      // and `note()` writes to the rolling log tail — slightly
      // redundant but not wrong. L4 cleanup removes the inline note
      // once the clack path is gone.
      prompter.note(header.lines.join('\n'), header.title);

      const actions = screen.actions(ctx);
      type NonSep = Exclude<ScreenAction, { kind: 'separator' }>;
      const selectable: NonSep[] = actions.filter(
        (a): a is NonSep => a.kind !== 'separator',
      );
      const choice = await prompter.select<string>({
        label: 'Action',
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
    if (screen.breadcrumb) viewport.popBreadcrumb();
  }
}
