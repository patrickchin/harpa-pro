/**
 * Notes list screen — picker over notes for the current report, plus
 * per-note edit/delete actions. Reached from Report Home › View notes.
 *
 * The note action screen is small enough to inline as a child screen
 * factory rather than its own file (per arch-tui-nav.md §3.1's
 * "notesActionScreen" — no separate currentNote on the session).
 */
import chalk from 'chalk';
import type { Screen, ScreenAction } from '../screen.js';
import { fetchVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';
import type { NoteLike } from '../../lib/render.js';

interface NoteList {
  items: NoteLike[];
}

export function notesScreen(): Screen {
  let notes: NoteLike[] = [];
  return {
    id: 'notes',
    async header(ctx) {
      if (ctx.session.state.kind !== 'authed') return undefined;
      const { currentProject, currentReport } = ctx.session.state;
      if (!currentProject || !currentReport) return undefined;
      const leaf = findLeaf(['notes', 'list']);
      if (!leaf) return { title: 'Notes', lines: ['(unavailable)'] };
      const data = await fetchVia<NoteList>(
        leaf,
        { project: currentProject.id, reportNumber: currentReport.number },
        ctx.session,
      );
      notes = data?.items ?? [];
      return {
        title: `Notes on report #${currentReport.number}`,
        lines: [
          notes.length === 0
            ? chalk.dim('No notes yet')
            : `${notes.length} note${notes.length === 1 ? '' : 's'}`,
        ],
      };
    },
    actions(ctx): ReadonlyArray<ScreenAction> {
      if (ctx.session.state.kind !== 'authed') return [];
      const { currentProject, currentReport } = ctx.session.state;
      if (!currentProject || !currentReport) return [];
      const project = currentProject.id;
      const number = currentReport.number;

      const picks: ScreenAction[] = notes.map((n) => {
        const preview =
          (n.body ?? n.transcript ?? n.kind).toString().slice(0, 40);
        return {
          kind: 'screen',
          label: `${n.kind} · "${preview}"`,
          open: () => noteActionScreen(n),
        };
      });

      return [
        ...picks,
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
      const body = note.body ?? note.transcript ?? chalk.dim('(no body)');
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
