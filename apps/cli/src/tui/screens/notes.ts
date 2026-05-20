/**
 * Notes list screen — picker over notes for the current report, plus
 * per-note edit/delete actions. Reached from Report Home › View notes.
 *
 * The note action screen is small enough to inline as a child screen
 * factory rather than its own file (per arch-tui-nav.md §3.1's
 * "notesActionScreen" — no separate currentNote on the session).
 */
import chalk from 'chalk';
import type { Screen, ScreenAction, ScreenContext } from '../screen.js';
import { runScreen } from '../screen.js';
import { fetchAllVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';
import type { NoteLike } from '../../lib/render.js';

const INLINE_OPEN = 7;

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
      return {
        title: `Notes on report #${currentReport.number}`,
        lines: [
          notes.length === 0
            ? chalk.dim('No notes yet')
            : `${notes.length} note${notes.length === 1 ? '' : 's'}`,
        ],
      };
    },
    body() {
      if (notes.length === 0) {
        return { kind: 'empty', hint: 'No notes yet' };
      }
      return {
        kind: 'list',
        items: notes.map((n) => {
          const text = (n.body ?? n.transcript ?? '').toString();
          return {
            label: n.kind,
            hint: text ? text.slice(0, 60) : undefined,
          };
        }),
      };
    },
    actions(ctx): ReadonlyArray<ScreenAction> {
      if (ctx.session.state.kind !== 'authed') return [];
      const { currentProject, currentReport } = ctx.session.state;
      if (!currentProject || !currentReport) return [];
      const project = currentProject.id;
      const number = currentReport.number;

      const labelFor = (n: NoteLike) =>
        `${n.kind} · "${(n.body ?? n.transcript ?? n.kind).toString().slice(0, 40)}"`;
      const openNote = (n: NoteLike) => () => noteActionScreen(n);

      const acts: ScreenAction[] = [];
      if (notes.length === 0) {
        // nothing inline
      } else if (notes.length <= INLINE_OPEN) {
        for (const n of notes) {
          acts.push({
            kind: 'screen',
            label: labelFor(n),
            open: openNote(n),
          });
        }
      } else {
        acts.push({
          kind: 'flow',
          label: `Open note… (${notes.length})`,
          run: async (innerCtx: ScreenContext) => {
            const choice = await innerCtx.prompter.select<string>({
              label: 'Pick a note to open',
              options: [
                ...notes.map((n) => ({ value: n.id, label: labelFor(n) })),
                { value: '__cancel__', label: '← cancel' },
              ],
            });
            if (innerCtx.prompter.isCancel(choice) || choice === '__cancel__') return;
            const picked = notes.find((n) => n.id === choice);
            if (!picked) return;
            await runScreen(innerCtx.prompter, innerCtx.session, openNote(picked)());
          },
        });
      }

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
