/**
 * Upload screen — scoped to the currently-open report. Reached from
 * Report Home › Upload media. Per arch-tui-nav.md §3.1, the actual
 * "auto-create note from upload" flow is still the deferred carve-out
 * (no underlying leaf yet — arch-tui-app.md §6.8). For now this
 * screen surfaces the raw building blocks (presign / register /
 * voice transcribe / voice summarize).
 *
 * No prefill targets are available on these leaves until the unified
 * `files upload` leaf lands; the screen still serves its purpose as
 * a discoverable upload entry-point inside Report Home rather than
 * a top-level surface.
 */
import chalk from 'chalk';
import type { Screen, ScreenAction } from '../screen.js';

export function uploadScreen(): Screen {
  return {
    id: 'upload',
    async header(ctx) {
      if (ctx.session.state.kind !== 'authed') return undefined;
      const { currentReport } = ctx.session.state;
      if (!currentReport) return undefined;
      return {
        title: `Upload to report #${currentReport.number}`,
        lines: [
          chalk.dim(
            'Presign → upload to R2 → register file → attach as note (manual for now)',
          ),
        ],
      };
    },
    actions(): ReadonlyArray<ScreenAction> {
      return [
        { kind: 'leaf', label: 'Presign upload URL', cittyPath: ['files', 'presign'] },
        { kind: 'leaf', label: 'Register file', cittyPath: ['files', 'register'] },
        { kind: 'leaf', label: 'Voice — transcribe', cittyPath: ['voice', 'transcribe'] },
        { kind: 'leaf', label: 'Voice — summarize', cittyPath: ['voice', 'summarize'] },
      ];
    },
  };
}
