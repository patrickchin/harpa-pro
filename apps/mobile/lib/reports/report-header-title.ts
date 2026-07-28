const REPORT_ID_PREFIX =
  /^(?:site\s+visit|report)\s*#?\d+(?:\s*[—–:-]\s*|\s*$)/i;
const SITE_VISIT_PREFIX =
  /^site\s+visit(?:\s*[—–:-]\s*|\s*$)/i;

export function getReportHeaderControlTitle(
  reportNumber: number | null | undefined,
): string {
  return reportNumber === null || reportNumber === undefined
    ? 'Site Visit'
    : `Site Visit #${reportNumber}`;
}

export function getReportHeaderTitle(
  rawTitle: string | null | undefined,
): string {
  const title = rawTitle?.trim();
  if (!title) return 'Report';

  const descriptiveTitle = title
    .replace(REPORT_ID_PREFIX, '')
    .replace(SITE_VISIT_PREFIX, '')
    .trim();

  return descriptiveTitle || 'Report';
}
