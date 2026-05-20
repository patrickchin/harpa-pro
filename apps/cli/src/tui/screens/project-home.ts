/**
 * Project home screen — info header for the current project + menu
 * of report/member actions. Reached from `projectsScreen` after the
 * user picks a project; `session.currentProject` is already set.
 *
 * Actions:
 *   · New report                 ─► leaf reports.create (prefill projectId)
 *   · Reports                    ─► reportsScreen (TUI-nav.5)
 *   · Members                    ─► membersScreen (TUI-nav.4)
 *   · Edit project               ─► leaf projects.update (prefill id)
 *   · Delete project             ─► leaf projects.delete (confirm)
 *   · Refresh
 *   · ← back
 *
 * The Reports / Members screens land in later commits; until they
 * exist this screen exposes the underlying leaves with prefill, so
 * the drill-down works end-to-end even mid-rollout.
 */
import type { Screen, ScreenAction } from '../screen.js';
import { fetchVia, fetchAllVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';
import { membersScreen } from './members.js';
import { reportsScreen } from './reports.js';
import type { ProjectLike, ReportLike, MemberLike } from '../../lib/render.js';

export function projectHomeScreen(): Screen {
  let detail: ProjectLike | undefined;
  let reports: ReportLike[] = [];
  let members: MemberLike[] = [];
  return {
    id: 'project-home',
    breadcrumb: (ctx) => {
      const p =
        ctx.session.state.kind === 'authed'
          ? ctx.session.state.currentProject
          : undefined;
      return p ? (p.slug ?? p.id) : '?';
    },
    async header(ctx) {
      const project = ctx.session.state.kind === 'authed' ? ctx.session.state.currentProject : undefined;
      if (!project) return undefined;
      const getLeaf = findLeaf(['projects', 'get']);
      if (!getLeaf) {
        return {
          title: `Project: ${project.name ?? project.id}`,
          lines: ['(unavailable)'],
        };
      }
      const data = await fetchVia<ProjectLike>(getLeaf, { id: project.id }, ctx.session);
      if (!data) return undefined; // 404 → resource gone, pop back
      detail = data;

      const reportsLeaf = findLeaf(['reports', 'list']);
      const membersLeaf = findLeaf(['projects', 'members', 'list']);
      const [r, m] = await Promise.all([
        reportsLeaf
          ? fetchAllVia<ReportLike>(reportsLeaf, { projectId: project.id }, ctx.session).catch(
              () => undefined,
            )
          : Promise.resolve(undefined),
        membersLeaf
          ? fetchAllVia<MemberLike>(membersLeaf, { projectId: project.id }, ctx.session).catch(
              () => undefined,
            )
          : Promise.resolve(undefined),
      ]);
      reports = r?.items ?? [];
      members = m?.items ?? [];

      const totalReports = data.stats?.totalReports ?? reports.length;
      const drafts = data.stats?.drafts ?? reports.filter((x) => x.status !== 'finalized').length;
      return {
        title: `Project: ${data.name}`,
        lines: [
          `role: ${data.myRole} · client: ${data.clientName ?? '(none)'} · ${totalReports} report${totalReports === 1 ? '' : 's'} (${drafts} draft) · ${members.length} member${members.length === 1 ? '' : 's'}`,
        ],
      };
    },
    body() {
      if (!detail) return { kind: 'empty', hint: 'Loading…' };
      const sections: Array<{ title?: string; lines: string[] }> = [
        {
          title: 'Details',
          lines: [
            `name:     ${detail.name}`,
            `slug:     ${detail.id}`,
            `role:     ${detail.myRole}`,
            `client:   ${detail.clientName ?? '(none)'}`,
            `address:  ${detail.address ?? '(none)'}`,
          ],
        },
      ];
      if (reports.length > 0) {
        const sorted = [...reports].sort((a, b) =>
          String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
        );
        const rows = sorted.slice(0, 10).map((r) => {
          const num = `#${String(r.number).padEnd(3)}`;
          const status = (r.status ?? '').padEnd(9);
          const visit = (r.visitDate ?? '—').padEnd(11);
          const created = String(r.createdAt ?? '').slice(0, 10);
          return `  ${num}  ${status}  visit ${visit}  created ${created}`;
        });
        if (sorted.length > 10) rows.push(`  … +${sorted.length - 10} more`);
        sections.push({ title: `Reports (${reports.length})`, lines: rows });
      } else {
        sections.push({ title: 'Reports (0)', lines: ['  No reports yet.'] });
      }
      if (members.length > 0) {
        const rows = members.slice(0, 8).map((mb) => {
          const name = (mb.displayName ?? '—').padEnd(20).slice(0, 20);
          const role = mb.role.padEnd(7);
          return `  ${name}  ${role}  ${mb.phone}`;
        });
        if (members.length > 8) rows.push(`  … +${members.length - 8} more`);
        sections.push({ title: `Members (${members.length})`, lines: rows });
      } else {
        sections.push({ title: 'Members (0)', lines: ['  No members yet.'] });
      }
      return { kind: 'detail', sections };
    },
    actions(ctx): ReadonlyArray<ScreenAction> {
      const project =
        ctx.session.state.kind === 'authed' ? ctx.session.state.currentProject : undefined;
      const slug = project?.id ?? '';
      return [
        {
          kind: 'screen',
          label: 'Reports',
          open: () => reportsScreen(),
          refreshHeader: true,
        },
        {
          kind: 'leaf',
          label: 'New report',
          cittyPath: ['reports', 'create'],
          prefill: () => ({ projectId: slug }),
          refreshHeader: true,
        },
        {
          kind: 'screen',
          label: 'Members',
          open: () => membersScreen(),
          refreshHeader: true,
        },
        {
          kind: 'leaf',
          label: 'Add member',
          cittyPath: ['projects', 'members', 'add'],
          prefill: () => ({ projectId: slug }),
          refreshHeader: true,
        },
        {
          kind: 'leaf',
          label: 'Edit project',
          cittyPath: ['projects', 'update'],
          prefill: () => ({ id: slug }),
          refreshHeader: true,
        },
        {
          kind: 'leaf',
          label: 'Delete project',
          cittyPath: ['projects', 'delete'],
          prefill: () => ({ id: slug }),
          confirm: { label: `Delete project ${slug}? This cannot be undone.` },
          refreshHeader: true,
        },
        {
          kind: 'flow',
          label: 'Refresh',
          run: async () => {},
          refreshHeader: true,
        },
      ];
    },
    backLabel: '← back to projects',
  };
}
