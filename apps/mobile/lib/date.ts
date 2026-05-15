/**
 * Date formatting utilities.
 *
 * Mirrors the canonical `formatDate` from
 * `@harpa/report-core/src/report-helpers.ts`. Re-exported here so
 * non-report screens can import dates without depending on the
 * report-core package boundary.
 */

/**
 * Format a date (ISO-8601 string or Date object) to human-readable format.
 * Returns em-dash ('—') for null, undefined, or invalid input.
 * @example formatDate('2024-03-15T10:30:00.000Z') → 'Mar 15, 2024'
 * @example formatDate(null) → '—'
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (value == null) {
    return '—';
  }
  
  const date = typeof value === 'string' ? new Date(value) : value;
  
  // Check if date is invalid
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  
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
