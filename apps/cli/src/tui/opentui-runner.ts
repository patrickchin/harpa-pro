/**
 * OpenTUI runner (arch-tui-layout.md §3.7).
 *
 * Wires the imperative screen driver (`runApp`) to the reactive Solid
 * view layer via the `ViewportSink` abstraction so screens push
 * read-only content into the left pane while prompts flow through
 * `opentuiPrompter` into the right pane.
 *
 *   1. Create a `UiStore`.
 *   2. Mount `<AppRoot ui={ui}/>` into an OpenTUI renderer.
 *   3. Build `opentuiPrompter(ui)` and a `ViewportSink` backed by
 *      `ui.set*` methods.
 *   4. Run `runApp` with both. When it returns, destroy the
 *      renderer so the terminal is restored.
 */
import { render } from '@opentui/solid';
import { createCliRenderer } from '@opentui/core';
import type { Session } from './session.js';
import type { Flow } from './flow.js';
import { runApp } from './app.js';
import { opentuiPrompter } from './prompter.js';
import { createUiStore, type UiStore } from './ui/store.js';
import { AppRoot } from './ui/AppRoot.js';
import { keymapHintFor } from './ui/keymap.js';
import type { ViewportSink } from './viewport-sink.js';

export interface RunOpenTuiOptions {
  readonly flows?: ReadonlyArray<Flow>;
  /** Boot-time messages to display in the log tail on first paint. */
  readonly bootLog?: ReadonlyArray<{
    kind: 'info' | 'success' | 'warn' | 'error';
    message: string;
  }>;
}

export async function runOpenTuiApp(
  session: Session,
  opts: RunOpenTuiOptions = {},
): Promise<void> {
  const ui = createUiStore({
    initialStatus: {
      apiUrl: session.effectiveEnv().HARPA_API_URL ?? '(not set)',
      keymapHint: keymapHintFor(undefined),
    },
    initialViewport: {
      title: 'harpa',
      headerLines: ['Pick an action in the right pane.'],
    },
  });

  for (const entry of opts.bootLog ?? []) {
    ui.log(entry);
  }

  if (session.state.kind === 'authed') {
    ui.setStatus({
      user: session.state.user.displayName ?? session.state.user.userId,
    });
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    clearOnShutdown: true,
    targetFps: 30,
  });

  await render(() => AppRoot({ ui }), renderer);

  try {
    await runApp(opentuiPrompter(ui), session, {
      viewport: viewportSinkFor(ui),
      ...(opts.flows ? { flows: opts.flows } : {}),
    });
  } finally {
    renderer.destroy();
  }
}

function viewportSinkFor(ui: UiStore): ViewportSink {
  const crumbs: string[] = [];
  return {
    setHeader(title, lines) {
      ui.setViewport({ title, headerLines: lines });
    },
    setBody(body) {
      ui.setViewport(body === undefined ? { body: undefined } : { body });
    },
    pushBreadcrumb(label) {
      crumbs.push(label);
      ui.setStatus({ breadcrumb: [...crumbs] });
    },
    popBreadcrumb() {
      crumbs.pop();
      ui.setStatus({ breadcrumb: [...crumbs] });
    },
    setInFlight(label) {
      ui.setInFlight(label === undefined ? undefined : { label });
    },
  };
}

