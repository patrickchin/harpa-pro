/**
 * State-aware top-level menu driver (arch-tui-layout-v2.md §5, §6.6).
 *
 * Renders the root menu — Account, Projects, Developer, Sign in,
 * Sign out, Set API URL, Quit — filtered by the current
 * `AppState.kind`. The visible set is recomputed every iteration so
 * a flow that transitions auth → authed (sign-in) re-renders the
 * authed menu without restarting the loop.
 *
 * v4.2 layout: the read-only context for the current root state
 * (who am I, which API, what to do next) is pushed into the
 * viewport sink as a `headline + subline + body`. The interaction
 * pane only carries the verb menu. Identity has moved to the TopBar
 * and is owned by `opentui-runner.ts`.
 *
 * See docs/v4/arch-tui-layout-v2.md §6.6 for the per-state body
 * template.
 */
import type { Prompter } from './prompter.js';
import type { Flow, FlowResult } from './flow.js';
import type { Session, AppState } from './session.js';
import {
  type ViewportSink,
  nullViewportSink,
} from './viewport-sink.js';
import type { ViewportBody } from './ui/store.js';

export interface RunAppOpts {
  flows?: ReadonlyArray<Flow>;
  /** Sink for the read-only viewport pane. Defaults to a no-op. */
  viewport?: ViewportSink;
}

const QUIT = '__quit__';

interface RootHeader {
  readonly headline: string;
  readonly subline?: string;
  readonly body: ViewportBody;
}

function rootHeader(state: AppState, session: Session): RootHeader {
  const apiUrl = session.effectiveEnv().HARPA_API_URL ?? '(not set)';
  switch (state.kind) {
    case 'config':
      return {
        headline: 'Setup required',
        subline: 'No API URL set',
        body: {
          kind: 'detail',
          sections: [
            {
              title: 'setup',
              lines: [
                '  Pick "Set API URL" on the right to choose which',
                '  Harpa API to talk to.',
              ],
            },
          ],
        },
      };
    case 'auth': {
      const reason =
        state.reason === 'expired'
          ? 'session expired'
          : state.reason === 'logged-out'
            ? 'signed out'
            : 'not signed in';
      return {
        headline: 'Not signed in',
        subline: `Sign in to ${apiUrl} (${reason})`,
        body: {
          kind: 'detail',
          sections: [
            {
              title: 'connection',
              lines: [`  api url        ${apiUrl}`],
            },
            {
              title: 'next',
              lines: [
                '  Pick "Sign in" on the right to authenticate with',
                '  your phone number. After signing in you can browse',
                '  projects and reports.',
              ],
            },
          ],
        },
      };
    }
    case 'authed': {
      const u = state.user;
      const who = u.displayName ?? u.userId;
      return {
        headline: `Signed in as ${who}`,
        subline: `Pick a verb on the right`,
        body: {
          kind: 'detail',
          sections: [
            {
              title: 'who',
              lines: [
                `  display name   ${u.displayName ?? '(none)'}`,
                `  phone          ${u.phone ?? '(none)'}`,
              ],
            },
            {
              title: 'connection',
              lines: [`  api url        ${apiUrl}`],
            },
            {
              title: 'next',
              lines: [
                '  Account — your profile, usage, AI settings',
                '  Projects — projects, members, reports, notes',
                '  Developer — every raw endpoint as a flat menu',
              ],
            },
          ],
        },
      };
    }
  }
}

export async function runApp(
  prompter: Prompter,
  session: Session,
  opts: RunAppOpts,
): Promise<void> {
  const viewport = opts.viewport ?? nullViewportSink();
  for (;;) {
    const state = session.state;
    const visible = (opts.flows ?? []).filter((f) => f.visibleIn.includes(state.kind));

    const h = rootHeader(state, session);
    viewport.setHeadline(h.headline, h.subline);
    viewport.setBody(h.body);
    // Mirror into the prompter transcript so scripted-prompter tests
    // can still assert on the rendered context.
    prompter.note(h.subline ?? '', h.headline);

    const options: { value: string; label: string; hint?: string }[] = visible.map(
      (f) => {
        const o: { value: string; label: string; hint?: string } = {
          value: f.id,
          label: f.label,
        };
        if (f.hint !== undefined) o.hint = f.hint;
        return o;
      },
    );
    options.push({ value: QUIT, label: 'Quit' });

    const answer = await prompter.select<string>({
      label: '',
      options,
    });

    if (prompter.isCancel(answer) || answer === QUIT) return;

    const flow = visible.find((f) => f.id === answer);
    if (!flow) continue;

    viewport.setInFlight(flow.label);
    let result: FlowResult;
    try {
      result = await flow.run({ prompter, session, viewport });
    } finally {
      viewport.setInFlight(undefined);
    }
    if (result.kind === 'quit') return;
    if (result.kind === 'transition') {
      session.state = result.to;
    }
  }
}
