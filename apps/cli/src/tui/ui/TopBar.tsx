/**
 * TopBar (arch-tui-layout-v2.md §2.1).
 *
 * Single row, two halves:
 *   - left  : URL-style breadcrumb path, rendered loud (rank 1).
 *             Source of truth for "where am I" — no other chrome
 *             prints the path.
 *   - right : identity strip — `Patrick · prod` — rendered muted
 *             (rank 5). Identity facts live here and nowhere else.
 *
 * When the breadcrumb is wider than the available width the head is
 * truncated with `…/`, never the tail, so the user always sees their
 * current location.
 */
import { Show } from 'solid-js';
import type { UiStore } from './store.js';
import { theme } from './theme.js';

export interface TopBarProps {
  readonly ui: UiStore;
}

const MAX_SEGMENT = 24;

function truncateSegment(s: string): string {
  if (s.length <= MAX_SEGMENT) return s;
  const keep = Math.floor((MAX_SEGMENT - 1) / 2);
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}

export function pathOf(crumbs: ReadonlyArray<string>): string {
  if (crumbs.length === 0) return '/';
  return '/' + crumbs.map(truncateSegment).join('/');
}

function identityText(i: { readonly user?: string; readonly apiLabel: string }): string {
  const bits: string[] = [];
  if (i.user) bits.push(i.user);
  if (i.apiLabel) bits.push(i.apiLabel);
  return bits.join(' · ');
}

export function TopBar(props: TopBarProps) {
  const breadcrumb = () => pathOf(props.ui.state.topbar.breadcrumb);
  const identity = () => identityText(props.ui.state.topbar.identity);
  return (
    <box
      flexDirection="row"
      backgroundColor={theme.bg}
      paddingLeft={1}
      paddingRight={1}
      width="100%"
    >
      <text fg={theme.primary} attributes={1 /* bold */}>{breadcrumb()}</text>
      <box flexGrow={1} />
      <Show when={identity()}>
        <text fg={theme.fgMuted}>{identity()}</text>
      </Show>
    </box>
  );
}
