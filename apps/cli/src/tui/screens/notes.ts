/**
 * Notes list screen — viewport shows all notes for the current
 * report; the interaction pane inlines each note as an opener
 * (no separate picker — see arch-tui-layout.md "context first").
 *
 * The note action screen is small enough to inline as a child screen
 * factory rather than its own file (per arch-tui-nav.md §3.1's
 * "notesActionScreen" — no separate currentNote on the session).
 */
import type { Screen, ScreenAction } from '../screen.js';
import { fetchAllVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';
import type { NoteLike } from '../../lib/render.js';

export function notesScreen(): Screen {
  let notes: NoteLike[] = [];
  return {
    id: 'notes',
    breadcrumb: 'notes',
    async header(ctx) {
      if (ctx.session.state.kind !== 'authed') return undefined;
      const { currentProject, currentReport } = ctx.session.state;
      if (!currentProject || !currentReport) return undefined;
      const leaf = findLeaf(['notes', 'list']);
      if (!leaf) return { title: 'Notes', lines: ['(unavailable)'] };
      const data = await fetchAllVia<NoteLike>(
        leaf,
        { project: currentProject.id, reportNumber: currentReport.number },
        ctx.session,
      );
      notes = data?.items ?? [];
      const kinds = notes.reduce<Record<string, number>>((acc, n) => {
        acc[n.kind] = (acc[n.kind] ?? 0) + 1;
        return acc;
      }, {});
      const kindSummary = Object.entries(kinds)
        .map(([k, v]) => `${v} ${k}`)
        .join(' · ');
      return {
        title: `Notes — report #${currentReport.number}`,
        lines: [
          notes.length === 0
            ? 'No notes yet — pick "Add text note" to capture one'
            : `${notes.length} note${notes.length === 1 ? '' : 's'}${kindSummary ? ` · ${kindSummary}` : ''}`,
        ],
      };
    },
    body() {
      if (notes.length === 0) {
        return {
          kind: 'empty',
          hint: 'No notes yet.\nPick "Add text note" on the right to capture one.',
        };
      }
      const sections = notes.map((n, idx) => {
        const text = (n.body ?? n.transcript ?? '').toString();
        const created = n.createdAt ? String(n.createdAt).slice(0, 19) : '';
        const head = created ? `${n.kind}  ·  ${created}` : n.kind;
        const lines = text
          ? text.split('\n').slice(0, 6).map((l) => `  ${l}`)
          : ['  (empty)'];
        return { title: `${idx + 1}. ${head}`, lines };
      });
      return { kind: 'detail', sections };
    },
    actions(ctx): ReadonlyArray<ScreenAction> {
      if (ctx.session.state.kind !== 'authed') return [];
      const { currentProject, currentReport } = ctx.session.state;
      if (!currentProject || !currentReport) return [];
      const project = currentProject.id;
      const number = currentReport.number;

      const labelFor = (n: NoteLike) =>
        `${n.kind} · "${(n.body ?? n.transcript ?? n.kind).toString().slice(0, 40)}"`;

      const acts: ScreenAction[] = notes.map((n) => ({
        kind: 'screen' as const,
        label: labelFor(n),
        open: () => noteActionScreen(n),
      }));

      return [
        ...acts,
        {
          kind: 'leaf',
          label: 'Add text note',
          cittyPath: ['notes', 'create'],
          prefill: () => ({ project, reportNumber: number }),
          refreshHeader: true,
        },
        { kind: 'flow', label: 'Refresh', run: async () => {}, refreshHeader: true },
      ];
    },
  };
}

function noteActionScreen(note: NoteLike): Screen {
  return {
    id: 'note-action',
    async header() {
      const body = note.body ?? note.transcript ?? '(no body)';
      return {
        title: `Note · ${note.kind}`,
        lines: [String(body)],
      };
    },
    actions(): ReadonlyArray<ScreenAction> {
      return [
        {
          kind: 'leaf',
          label: 'Edit note',
          cittyPath: ['notes', 'update'],
          prefill: () => ({ noteId: note.id }),
        },
        {
          kind: 'leaf',
          label: 'Delete note',
          cittyPath: ['notes', 'delete'],
          prefill: () => ({ noteId: note.id }),
          confirm: { label: 'Delete this note?' },
        },
      ];
    },
  };
}
