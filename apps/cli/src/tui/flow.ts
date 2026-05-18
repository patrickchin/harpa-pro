/**
 * Flow infrastructure for the v2 TUI.
 *
 * A `Flow` is a user-facing action that can be selected from the
 * state-aware top-level menu. It owns its own internal prompts and
 * returns a `FlowResult` telling the driver whether to stay, transition
 * to a new app state, or pop back. The driver in `app.ts` is the only
 * code that decides which flows to show — every flow declares which
 * states it's `visibleIn`.
 *
 * Flows live under `tui/flows/*.ts`. Each one is unit-tested with the
 * scripted prompter; their wire path is covered by the in-process
 * Hono behaviour tests where applicable.
 *
 * See docs/v4/arch-tui-app.md §3.6.
 */
import type { Prompter } from './prompter.js';
import type { AppState, Session } from './session.js';

export type FlowResult =
  | { kind: 'stay' }                          // re-render same state's menu
  | { kind: 'transition'; to: AppState }       // explicit state change (driver re-renders)
  | { kind: 'quit' };                          // exit the app

export interface FlowContext {
  readonly prompter: Prompter;
  readonly session: Session;
}

export interface Flow {
  /** Stable identifier — used by tests and the menu's `select` value. */
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  /** Which app-state kinds may show this entry. */
  readonly visibleIn: ReadonlyArray<AppState['kind']>;
  run(ctx: FlowContext): Promise<FlowResult>;
}

/** Helper for flows that just want to re-render after returning. */
export const stay: FlowResult = { kind: 'stay' };
export const quit: FlowResult = { kind: 'quit' };
