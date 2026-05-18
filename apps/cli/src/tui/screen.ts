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
import { runCommand } from './execute.js';
import { findLeaf as findLeafImpl } from './registry-find.js';

export interface HeaderInfo {
  readonly title: string;
  readonly lines: ReadonlyArray<string>;
}

export interface ScreenContext {
  readonly prompter: Prompter;
  readonly session: Session;
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
  header(ctx: ScreenContext): Promise<HeaderInfo | undefined>;
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
): Promise<void> {
  const ctx: ScreenContext = { prompter, session };
  let header = await screen.header(ctx);
  for (;;) {
    if (header === undefined) break;
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
        const r = await runCommand(
          prompter,
          session,
          leaf,
          prefill ? { prefill: { ...prefill } } : {},
        );
        didMutate = r.status === 'ok' && Boolean(action.refreshHeader);
        break;
      }
      case 'screen': {
        const child = action.open(ctx);
        await runScreen(prompter, session, child);
        didMutate = Boolean(action.refreshHeader);
        break;
      }
      case 'flow': {
        await action.run(ctx);
        didMutate = Boolean(action.refreshHeader);
        break;
      }
    }
    if (didMutate) header = await screen.header(ctx);
  }
  screen.onExit?.(ctx);
}
