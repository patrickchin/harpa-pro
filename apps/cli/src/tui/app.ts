/**
 * State-machine driver for the v2 TUI.
 *
 * `runApp` repeatedly renders a top-level `select` of the flows that
 * are `visibleIn` the current `session.state.kind`, runs the chosen
 * flow, applies its `FlowResult`, and loops until the user picks
 * "Quit" or cancels at the top level.
 *
 * Per-state menus (per arch-tui-app.md §3.2):
 *
 *   config  → [Set API URL, Quit]
 *   auth    → [Sign in, Set API URL, Quit]
 *   authed  → [Account, Projects, Upload a file, Developer › Raw API,
 *              Sign out, Set API URL, Quit]
 *
 * Flows are registered in `FLOWS` below; the driver itself contains
 * no flow-specific logic. Adding a new flow = add to the array.
 *
 * Cancellation: Ctrl-C at the top-level select = "Quit". Ctrl-C inside
 * a flow returns to the flow's parent (the flow handles it; the driver
 * just sees a `stay` result).
 */
import chalk from 'chalk';
import type { Prompter } from './prompter.js';
import type { Session } from './session.js';
import type { Flow } from './flow.js';
import { type ViewportSink, nullViewportSink } from './viewport-sink.js';
import { setApiUrlFlow } from './flows/set-api-url.js';
import { developerRawApiFlow } from './flows/developer-raw-api.js';
import { signInFlow, signOutFlow } from './flows/auth.js';
import { accountFlow } from './flows/account.js';
import { projectsFlow } from './flows/projects.js';
import { uploadFlow } from './flows/upload.js';

const QUIT = '__quit__' as const;

/**
 * Default flow registry. Tests inject their own list to keep the
 * surface area small. Order matters — this is the order of the
 * top-level menu, per arch-tui-app.md §3.2.
 */
export const DEFAULT_FLOWS: ReadonlyArray<Flow> = [
  signInFlow,
  accountFlow,
  projectsFlow,
  uploadFlow,
  developerRawApiFlow,
  signOutFlow,
  setApiUrlFlow,
];

export interface RunAppOptions {
  flows?: ReadonlyArray<Flow>;
  /**
   * Optional viewport sink for the split-pane TUI. Default: no-op
   * (used by the classic clack runner and the scripted-prompter
   * tests).
   */
  viewport?: ViewportSink;
}

export async function runApp(
  prompter: Prompter,
  session: Session,
  opts: RunAppOptions = {},
): Promise<void> {
  const flows = opts.flows ?? DEFAULT_FLOWS;
  const viewport = opts.viewport ?? nullViewportSink();
  for (;;) {
    const visible = flows.filter((f) => f.visibleIn.includes(session.state.kind));
    viewport.setHeader(...stateViewportHeader(session));
    const choice = await prompter.select<string>({
      label: stateLabel(session),
      options: [
        ...visible.map((f) => ({ value: f.id, label: f.label, hint: f.hint })),
        { value: QUIT, label: 'Quit' },
      ],
    });

    if (prompter.isCancel(choice) || choice === QUIT) return;

    const flow = visible.find((f) => f.id === choice);
    if (!flow) continue;

    viewport.setInFlight(flow.label);
    let result;
    try {
      result = await flow.run({ prompter, session, viewport });
    } finally {
      viewport.setInFlight(undefined);
    }
    if (result.kind === 'quit') return;
    // 'transition' and 'stay' both fall through — the driver re-renders
    // off `session.state` which the flow already mutated.
  }
}

function stateLabel(session: Session): string {
  const state = session.state;
  const apiUrl = session.effectiveEnv().HARPA_API_URL ?? '(not set)';
  switch (state.kind) {
    case 'config':
      return chalk.yellow('No API URL set — pick "Set API URL" to begin.');
    case 'auth': {
      const reasonText = state.reason === 'expired'
        ? ' (session expired — please sign in again)'
        : state.reason === 'logged-out'
          ? ' (signed out)'
          : '';
      return `Sign in to ${apiUrl}${reasonText}`;
    }
    case 'authed': {
      const who = state.user.displayName ?? state.user.userId;
      const proj = state.currentProject
        ? `  •  project: ${state.currentProject.slug ?? state.currentProject.id}`
        : '';
      return `Signed in as ${chalk.cyan(who)}  (API: ${apiUrl})${proj}`;
    }
  }
}

/**
 * Plain (un-ANSI'd) variant of stateLabel for the viewport pane.
 * OpenTUI buffers don't render ANSI escapes inside cells, so chalk-
 * coloured strings would print literally there.
 */
function stateViewportHeader(session: Session): [string, ReadonlyArray<string>] {
  const state = session.state;
  const apiUrl = session.effectiveEnv().HARPA_API_URL ?? '(not set)';
  switch (state.kind) {
    case 'config':
      return [
        'harpa · setup',
        ['No API URL set — pick "Set API URL" to begin.'],
      ];
    case 'auth':
      return [
        'harpa · sign in',
        [
          state.reason === 'expired'
            ? `Sign in to ${apiUrl} (session expired)`
            : `Sign in to ${apiUrl}`,
        ],
      ];
    case 'authed': {
      const who = state.user.displayName ?? state.user.userId;
      const lines = [`Signed in as ${who}`, `API: ${apiUrl}`];
      if (state.currentProject) {
        lines.push(
          `Project: ${state.currentProject.slug ?? state.currentProject.id}`,
        );
      }
      return ['harpa', lines];
    }
  }
}
