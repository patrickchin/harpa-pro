/**
 * Members screen — list members + add/remove for the current project.
 *
 * Opens from Project Home. Header shows member count. Each member
 * row is a remove action (confirm prompt before firing the leaf).
 * `Add member` opens the leaf with `projectId` prefilled.
 */
import chalk from 'chalk';
import type { Screen, ScreenAction } from '../screen.js';
import { fetchVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';

interface MemberListItem {
  phone: string;
  displayName: string | null;
  role: 'owner' | 'editor' | 'viewer';
}

interface MemberList {
  items: MemberListItem[];
}

export function membersScreen(): Screen {
  let members: MemberListItem[] = [];
  return {
    id: 'members',
    async header(ctx) {
      const project =
        ctx.session.state.kind === 'authed' ? ctx.session.state.currentProject : undefined;
      if (!project) return undefined;
      const leaf = findLeaf(['projects', 'members', 'list']);
      if (!leaf) return { title: 'Members', lines: ['(unavailable)'] };
      const data = await fetchVia<MemberList>(
        leaf,
        { projectId: project.id },
        ctx.session,
      );
      members = data?.items ?? [];
      return {
        title: `Members of ${project.name ?? project.id}`,
        lines: [
          members.length === 0
            ? chalk.dim('No members')
            : `${members.length} member${members.length === 1 ? '' : 's'}`,
        ],
      };
    },
    actions(ctx): ReadonlyArray<ScreenAction> {
      const project =
        ctx.session.state.kind === 'authed' ? ctx.session.state.currentProject : undefined;
      const slug = project?.id ?? '';
      const removeActions: ScreenAction[] = members.map((m) => ({
        kind: 'leaf',
        label: `Remove ${m.displayName ?? m.phone}`,
        hint: `${m.role} · ${m.phone}`,
        cittyPath: ['projects', 'members', 'remove'],
        prefill: () => ({ projectId: slug, phone: m.phone }),
        confirm: { label: `Remove ${m.displayName ?? m.phone}?` },
        refreshHeader: true,
      }));
      return [
        ...removeActions,
        {
          kind: 'leaf',
          label: 'Add member',
          cittyPath: ['projects', 'members', 'add'],
          prefill: () => ({ projectId: slug }),
          refreshHeader: true,
        },
        { kind: 'flow', label: 'Refresh', run: async () => {}, refreshHeader: true },
      ];
    },
  };
}
