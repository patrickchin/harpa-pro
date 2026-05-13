/**
 * Date formatting utilities.
 *
 * Ported formatDate from canonical source at
 * `../haru3-reports/apps/mobile/lib/report-helpers.ts` (re-exported
 * from @harpa/report-core). v4 doesn't have report-core yet, so the
 * helper lives here directly.
 */

/**
 * Format a date (ISO-8601 string or Date object) to human-readable format.
 * @example formatDate('2024-03-15T10:30:00.000Z') → 'Mar 15, 2024'
 */
export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  
  // Use UTC methods to avoid timezone-based date shifts
  const month = monthNames[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  
  return `${month} ${day}, ${year}`;
}
