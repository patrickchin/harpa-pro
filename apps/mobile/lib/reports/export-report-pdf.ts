/**
 * Stub for PDF export pipeline. The canonical implementation lives in
 * `../haru3-reports/apps/mobile/lib/export-report-pdf.ts` (Expo Print
 * → Expo Sharing → expo-file-system). v4 hasn't ported the Expo Print
 * pipeline yet; this stub matches the canonical surface so
 * `use-report-pdf-actions.ts` + `SavedReportSheet` + `PdfPreviewModal`
 * compile and surface a deterministic "deferred to P4" error path.
 *
 * TODO(P4): port the real Expo Print / Sharing implementation from
 * canonical alongside the file storage + R2 wiring in P4.
 */
import type { GeneratedSiteReport } from '@harpa/report-core';

export interface ExportedReport {
  pdfUri: string;
  pdfFilename: string;
  locationDescription?: string;
  shareErrorMessage?: string;
}

export interface ExportReportOptions {
  siteName: string | null;
}

const NOT_IMPLEMENTED = 'Saving PDFs lands in P4 — Expo Print not yet wired.';

export async function saveReportPdf(
  _report: GeneratedSiteReport,
  _options: ExportReportOptions,
): Promise<ExportedReport> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function exportReportPdf(
  _report: GeneratedSiteReport,
  _options: ExportReportOptions,
): Promise<ExportedReport> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function shareSavedReportPdf(_args: {
  pdfUri: string;
  reportTitle: string;
}): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function openSavedReportPdf(_pdfUri: string): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

export interface SavedReportDetails {
  title: string;
  fullPath: string;
  locationDescription: string;
  openHint: string;
  shareHint: string;
}

export function getSavedReportDetails(args: {
  locationDescription: string;
  pdfUri: string;
}): SavedReportDetails {
  const fullPath = args.pdfUri.replace(/^file:\/\//, '');
  const filename = fullPath.split('/').pop() ?? 'report.pdf';
  return {
    title: filename,
    fullPath,
    locationDescription: args.locationDescription,
    openHint: 'Tap “Open PDF” to view in the system viewer.',
    shareHint: 'Tap “Share PDF” to send it to another app.',
  };
}
