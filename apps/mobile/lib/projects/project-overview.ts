/**
 * Pure helpers for the project overview screen. Ported from
 * `../haru3-reports/apps/mobile/lib/project-overview.ts` on branch `dev`.
 *
 * v4 note: the `Project.stats` shape is now produced server-side, so the
 * client only needs the relative-time formatter for `lastReportAt`.
 */

/**
 * Shared layout constants for the project overview screen + skeleton.
 * Keeping these centralised lets `ProjectOverviewSkeleton` reserve the
 * same vertical space that the loaded content will occupy, so the
 * landmark probes (see `lib/layout-shift-probe.ts`) report ~0 shift
 * between the two frames.
 */
export const PROJECT_OVERVIEW_LAYOUT = {
  /** Matches `px-5` on the loaded ScrollView contentContainerStyle. */
  paddingHorizontal: 20,
  paddingTop: 8,
  paddingBottom: 24,
  /** Matches the `gap: 16` between the four top-level blocks. */
  gap: 16,
  /** StatTile primitive uses `min-h-[92px]`. */
  statTileHeight: 92,
  /**
   * Header row (client + address Pressables stacked with `gap-1`) plus
   * the `sm` Edit button (`min-h-10`). Items are `items-center`, so
   * row height is dominated by the two-line text block (~48).
   */
  headerRowHeight: 48,
  /**
   * "Last report" Card: padding md (p-4 = 32 total) + label (~14) +
   * gap-1 (4) + text-title-sm (~20).
   */
  lastReportCardHeight: 70,
  /**
   * Action Card row: padding md (p-4 = 32) + max(40px icon, title 24
   * + gap 4 + description 20 = 48) → 32 + 48 = 80.
   */
  actionCardHeight: 80,
} as const;

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const MS_PER_MONTH = 30 * MS_PER_DAY;
const MS_PER_YEAR = 365 * MS_PER_DAY;

export function formatRelativeTime(
  iso: string | null,
  now: Date = new Date(),
): string {
  if (!iso) return 'No reports yet';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'No reports yet';

  const diffMs = now.getTime() - then;
  if (diffMs < MS_PER_MINUTE) return 'Just now';
  if (diffMs < MS_PER_HOUR) {
    const minutes = Math.floor(diffMs / MS_PER_MINUTE);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (diffMs < MS_PER_DAY) {
    const hours = Math.floor(diffMs / MS_PER_HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (diffMs < MS_PER_WEEK) {
    const days = Math.floor(diffMs / MS_PER_DAY);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (diffMs < MS_PER_MONTH) {
    const weeks = Math.floor(diffMs / MS_PER_WEEK);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }
  if (diffMs < MS_PER_YEAR) {
    const months = Math.floor(diffMs / MS_PER_MONTH);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }
  const years = Math.floor(diffMs / MS_PER_YEAR);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
