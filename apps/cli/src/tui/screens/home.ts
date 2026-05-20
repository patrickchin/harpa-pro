/**
 * Home + credentials screens (arch-tui-layout-v2.md §5, §6.6).
 *
 * `homeScreen` renders at the authed root (path `/`). Its viewport
 * is an identity record: signed-in user + API + a brief "what's
 * here" hint. Verbs are the top-level menu (Account · Projects ·
 * Developer · Sign out · Set API URL · Quit).
 *
 * `credentialsScreen` is the unauthed root (path `/`). Viewport
 * tells the user they aren't signed in and which API URL they would
 * sign into. Verbs are Sign in · Set API URL · Quit.
 *
 * Both screens own the top-level "Quit" choice via a magic action
 * the driver in `app.ts` watches for.
 */
import type { Screen, ScreenAction } from '../screen.js';
import type { Session } from '../session.js';
import { accountScreen } from './account.js';
import { projectsScreen } from './projects.js';

/** Magic id sentinel inspected by `runApp` so it can exit. */
export const QUIT_ACTION_ID = 'quit';

interface RootScreenOpts {
  /** Flow action that drives the auth (sign-in) loop. */
  signIn?: (ctx: import('../screen.js').ScreenContext) => Promise<void>;
  signOut?: (ctx: import('../screen.js').ScreenContext) => Promise<void>;
  setApiUrl?: (ctx: import('../screen.js').ScreenContext) => Promise<void>;
  developerRawApi?: (ctx: import('../screen.js').ScreenContext) => Promise<void>;
}

function apiUrlOf(session: Session): string {
  return session.effectiveEnv().HARPA_API_URL ?? '(not set)';
}

export function homeScreen(opts: RootScreenOpts = {}): Screen {
  return {
    id: 'home',
    async header(ctx) {
      if (ctx.session.state.kind !== 'authed') return undefined;
      const who = ctx.session.state.user.displayName ?? ctx.session.state.user.userId;
      return {
        title: `Signed in as ${who}`,
        lines: [`API: ${apiUrlOf(ctx.session)}`],
      };
    },
    body(ctx) {
      if (ctx.session.state.kind !== 'authed') {
        return { kind: 'empty', hint: 'Not signed in.' };
      }
      const u = ctx.session.state.user;
      return {
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
            lines: [`  api url        ${apiUrlOf(ctx.session)}`],
          },
          {
            title: 'next',
            lines: [
              '  Pick a verb on the right. The breadcrumb above',
              '  always shows your location.',
            ],
          },
        ],
      };
    },
    actions(): ReadonlyArray<ScreenAction> {
      const acts: ScreenAction[] = [
        {
          kind: 'screen',
          label: 'Account',
          open: () => accountScreen(),
          refreshHeader: true,
        },
        {
          kind: 'screen',
          label: 'Projects',
          open: () => projectsScreen(),
          refreshHeader: true,
        },
      ];
      if (opts.developerRawApi) {
        acts.push({
          kind: 'flow',
          label: 'Developer › Raw API',
          run: opts.developerRawApi,
        });
      }
      if (opts.signOut) {
        acts.push({
          kind: 'flow',
          label: 'Sign out',
          run: opts.signOut,
          refreshHeader: true,
        });
      }
      if (opts.setApiUrl) {
        acts.push({
          kind: 'flow',
          label: 'Set API URL',
          run: opts.setApiUrl,
          refreshHeader: true,
        });
      }
      acts.push({
        kind: 'flow',
        label: 'Quit',
        run: async () => {},
        // Sentinel so the outer runApp loop can recognise quit.
        hint: QUIT_ACTION_ID,
      });
      return acts;
    },
    backLabel: 'Quit',
  };
}

export function credentialsScreen(opts: RootScreenOpts = {}): Screen {
  return {
    id: 'credentials',
    async header(ctx) {
      const apiUrl = apiUrlOf(ctx.session);
      if (ctx.session.state.kind === 'config') {
        return {
          title: 'Setup required',
          lines: [`No API URL set — pick "Set API URL" to begin.`],
        };
      }
      const reason =
        ctx.session.state.kind === 'auth' && ctx.session.state.reason === 'expired'
          ? ' (session expired)'
          : ctx.session.state.kind === 'auth' && ctx.session.state.reason === 'logged-out'
            ? ' (signed out)'
            : '';
      return {
        title: 'Not signed in',
        lines: [`Sign in to ${apiUrl}${reason}`],
      };
    },
    body(ctx) {
      const apiUrl = apiUrlOf(ctx.session);
      if (ctx.session.state.kind === 'config') {
        return {
          kind: 'detail',
          sections: [
            {
              title: 'setup',
              lines: [
                '  Set HARPA_API_URL in your environment, or pick',
                '  "Set API URL" from the verbs on the right.',
              ],
            },
          ],
        };
      }
      return {
        kind: 'detail',
        sections: [
          {
            title: 'connection',
            lines: [`  api url        ${apiUrl}`],
          },
          {
            title: 'next',
            lines: [
              '  Sign in with your phone number to receive an OTP.',
              '  After signing in you can browse projects and reports.',
            ],
          },
        ],
      };
    },
    actions(ctx): ReadonlyArray<ScreenAction> {
      const acts: ScreenAction[] = [];
      if (ctx.session.state.kind !== 'config' && opts.signIn) {
        acts.push({
          kind: 'flow',
          label: 'Sign in',
          run: opts.signIn,
          refreshHeader: true,
        });
      }
      if (opts.setApiUrl) {
        acts.push({
          kind: 'flow',
          label: 'Set API URL',
          run: opts.setApiUrl,
          refreshHeader: true,
        });
      }
      acts.push({
        kind: 'flow',
        label: 'Quit',
        run: async () => {},
        hint: QUIT_ACTION_ID,
      });
      return acts;
    },
    backLabel: 'Quit',
  };
}
