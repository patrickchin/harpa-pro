/**
 * Date formatting utilities.
 *
 * Mirrors the canonical report-date formatting rules. Re-exported
 * here so non-report screens can share the same formatting helper.
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

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/**
 * Format a date as a human-friendly relative time when recent, falling
 * back to an absolute calendar date for older values. Used for note
 * timeline entries and other "when did this happen" surfaces.
 *
 * @example formatRelativeOrDate(now)           → 'Just now'
 * @example formatRelativeOrDate(5m ago)        → '5 minutes ago'
 * @example formatRelativeOrDate(3h ago)        → '3 hours ago'
 * @example formatRelativeOrDate(2d ago)        → '2 days ago'
 * @example formatRelativeOrDate(2w ago)        → 'Mar 15, 2024'
 * @example formatRelativeOrDate(null)          → '—'
 */
export function formatRelativeOrDate(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (value == null) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return formatDate(date);
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
  return formatDate(date);
}

/**
 * Formats an ISO/epoch timestamp for display in a note card's header.
 * Uses the device locale so 12h/24h follows the user's settings.
 * Returns "" for invalid / empty inputs so callers can do
 * `{value ? <Text>{formatCapturedAt(value)}</Text> : null}`.
 *
 * Mirrors the canonical `apps/mobile/lib/format-date.ts` helper.
 *
 * @example formatCapturedAt(1715990400000) → 'May 18, 2024, 12:00 PM' (en-US)
 */
export function formatCapturedAt(
  value: string | number | Date | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
