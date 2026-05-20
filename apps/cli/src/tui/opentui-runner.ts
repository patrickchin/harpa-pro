/**
 * OpenTUI runner (arch-tui-layout-v2.md §3, §7).
 *
 * Wires the imperative `runApp` driver to the reactive Solid view
 * via the `ViewportSink` abstraction. The new store has four
 * slices — topbar / viewport / interaction / log — so this runner:
 *
 *   - seeds `topbar.breadcrumb = ['/']` and `topbar.identity`
 *     (user · apiLabel · fixtureMode) at boot, deriving the API
 *     label via `apiLabelFor(url)`.
 *   - maps the new sink (`setHeadline`, `pushBreadcrumb`, etc.) to
 *     `ui.setViewport` / `ui.setTopBar` mutations.
 *   - lets `opentuiPrompter` push prompts into the interaction slice
 *     and log entries into the single-line LogStrip.
 *   - never decorates viewport-bound strings with ANSI; the renderer
 *     stays a buffer renderer.
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
import { apiLabelFor } from './identity.js';
import { signInFlow, signOutFlow } from './flows/auth.js';
import { setApiUrlFlow } from './flows/set-api-url.js';
import { accountFlow } from './flows/account.js';
import { projectsFlow } from './flows/projects.js';
import { developerRawApiFlow } from './flows/developer-raw-api.js';
import { uploadFlow } from './flows/upload.js';

/** Default top-level flow set. Filtered per `visibleIn` at runtime. */
const DEFAULT_FLOWS: ReadonlyArray<Flow> = [
  accountFlow,
  projectsFlow,
  uploadFlow,
  developerRawApiFlow,
  signInFlow,
  signOutFlow,
  setApiUrlFlow,
];

export interface RunOpenTuiOptions {
  readonly flows?: ReadonlyArray<Flow>;
  /** Boot-time messages to display in the log strip on first paint. */
  readonly bootLog?: ReadonlyArray<{
    kind: 'info' | 'success' | 'warn' | 'error';
    message: string;
  }>;
}

function fixtureModeFromEnv(): 'live' | 'replay' | 'record' {
  const v = (process.env.AI_FIXTURE_MODE ?? '').toLowerCase();
  return v === 'replay' || v === 'record' ? v : 'live';
}

export async function runOpenTuiApp(
  session: Session,
  opts: RunOpenTuiOptions = {},
): Promise<void> {
  const apiUrl = session.effectiveEnv().HARPA_API_URL ?? '(not set)';
  const userName =
    session.state.kind === 'authed'
      ? session.state.user.displayName ?? session.state.user.userId
      : undefined;

  const ui = createUiStore({
    initialTopBar: {
      breadcrumb: ['/'],
      identity: {
        ...(userName ? { user: userName } : {}),
        apiLabel: apiLabelFor(apiUrl),
        fixtureMode: fixtureModeFromEnv(),
      },
    },
    initialViewport: {
      headline: 'harpa',
      subline: 'Pick a verb in the right pane.',
    },
    initialInteraction: {
      keymapHint: keymapHintFor(undefined),
    },
  });

  for (const entry of opts.bootLog ?? []) {
    ui.log(entry);
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
      flows: opts.flows ?? DEFAULT_FLOWS,
    });
  } finally {
    renderer.destroy();
  }
}

function viewportSinkFor(ui: UiStore): ViewportSink {
  const crumbs: string[] = ['/'];
  return {
    setHeadline(headline, subline) {
      ui.setViewport({
        headline,
        ...(subline === undefined ? { subline: undefined } : { subline }),
      });
    },
    setBody(body) {
      ui.setViewport(body === undefined ? { body: undefined } : { body });
    },
    pushBreadcrumb(label) {
      crumbs.push(label);
      ui.setTopBar({ breadcrumb: [...crumbs] });
    },
    popBreadcrumb() {
      crumbs.pop();
      ui.setTopBar({ breadcrumb: [...crumbs] });
    },
    setInFlight(label) {
      ui.setInFlight(label === undefined ? undefined : { label });
    },
  };
}
