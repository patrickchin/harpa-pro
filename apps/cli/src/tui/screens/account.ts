/**
 * Account screen (arch-tui-layout-v2.md §5, §6.1).
 *
 * Replaces the v4.1 `flows/account.ts` flat submenu. Drilling into
 * Account now changes the breadcrumb to `/account` and renders the
 * user's profile + usage + AI settings as a `record` body. Verbs
 * (Edit profile, Update AI settings, Sign out) live in the
 * interaction pane.
 */
import type { Screen, ScreenAction } from '../screen.js';
import { fetchVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';

interface Profile {
  id: string;
  phone?: string;
  displayName?: string | null;
  createdAt?: string;
}

interface Usage {
  reports?: { used: number; limit?: number | null };
  aiTokens?: number;
}

interface AiSettings {
  vendor?: string;
  model?: string;
}

export function accountScreen(): Screen {
  let profile: Profile | undefined;
  let usage: Usage | undefined;
  let ai: AiSettings | undefined;
  return {
    id: 'account',
    breadcrumb: 'account',
    async header(ctx) {
      const meLeaf = findLeaf(['me', 'get']);
      const usageLeaf = findLeaf(['me', 'usage']);
      const aiLeaf = findLeaf(['settings', 'ai', 'get']);
      const [p, u, a] = await Promise.all([
        meLeaf ? fetchVia<Profile>(meLeaf, {}, ctx.session) : Promise.resolve(undefined),
        usageLeaf ? fetchVia<Usage>(usageLeaf, {}, ctx.session) : Promise.resolve(undefined),
        aiLeaf ? fetchVia<AiSettings>(aiLeaf, {}, ctx.session) : Promise.resolve(undefined),
      ]);
      profile = p;
      usage = u;
      ai = a;
      const name =
        p?.displayName ??
        (ctx.session.state.kind === 'authed' ? ctx.session.state.user.displayName : undefined) ??
        p?.phone ??
        'You';
      return {
        title: 'Your account',
        lines: [name],
      };
    },
    body() {
      const sections: { title?: string; lines: string[] }[] = [];
      sections.push({
        title: 'profile',
        lines: [
          `  display name   ${profile?.displayName ?? '(none)'}`,
          `  phone          ${profile?.phone ?? '(none)'}`,
          `  created        ${profile?.createdAt ?? '—'}`,
        ],
      });
      if (usage) {
        const r = usage.reports;
        sections.push({
          title: 'usage (this month)',
          lines: [
            `  reports        ${r?.used ?? 0}${r?.limit ? ` of ${r.limit}` : ''}`,
            `  ai tokens      ${usage.aiTokens ?? 0}`,
          ],
        });
      }
      if (ai) {
        sections.push({
          title: 'ai settings',
          lines: [
            `  vendor         ${ai.vendor ?? '(default)'}`,
            `  model          ${ai.model ?? '(default)'}`,
          ],
        });
      }
      return { kind: 'detail', sections };
    },
    actions(): ReadonlyArray<ScreenAction> {
      return [
        {
          kind: 'leaf',
          label: 'Edit profile',
          cittyPath: ['me', 'update'],
          refreshHeader: true,
        },
        {
          kind: 'leaf',
          label: 'Update AI settings',
          cittyPath: ['settings', 'ai', 'set'],
          refreshHeader: true,
        },
        { kind: 'flow', label: 'Refresh', run: async () => {}, refreshHeader: true },
      ];
    },
    backLabel: '← back to home',
  };
}
