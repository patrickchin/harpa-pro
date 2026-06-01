/**
 * PDF export pipeline for generated site reports.
 *
 * Ported from `../haru3-reports/apps/mobile/lib/export-report-pdf.ts`
 * on branch `dev` (commit dbaa4c1) and adapted for v4 import paths
 * (`@harpa/report-core`, `lib/reports/report-to-html`). Pipeline:
 *
 *   1. `reportToHtml(report)` → HTML string
 *   2. `expo-print` `printToFileAsync` → temp PDF in OS scratch
 *   3. Move the temp PDF + matching HTML into
 *      `cache/Harpa Pro/reports/<site>/<date>-<slug>.{pdf,html}`
 *   4. `expo-sharing` `shareAsync` for the share flow,
 *      `expo-linking` `openURL` for the open flow.
 *
 * `useReportPdfActions` is the only direct consumer; `PdfPreviewModal`
 * calls `saveReportPdf` then renders the resulting `pdfUri` inline.
 */
import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { GeneratedSiteReport } from '@harpa/report-core';

import { reportToHtml, type PdfBranding } from './report-to-html';

const reportsDir = new Directory(Paths.cache, 'Harpa Pro', 'reports');
const OPEN_PDF_ERROR_MESSAGE =
  'Could not open the saved PDF. Use Share PDF to choose another app.';

function sanitizeFilename(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60);
}

function ensureReportsDir(): void {
  reportsDir.create({ intermediates: true, idempotent: true });
}

function ensureSiteReportsDir(siteName?: string | null): Directory {
  ensureReportsDir();
  const siteDirectory = new Directory(reportsDir, getSiteDirectoryName(siteName));
  siteDirectory.create({ intermediates: true, idempotent: true });
  return siteDirectory;
}

export interface ExportedReport {
  pdfUri: string;
  pdfFilename: string;
  htmlUri?: string;
  locationDescription?: string;
  shareErrorMessage?: string;
}

export interface ExportReportOptions {
  siteName: string | null;
}

interface ShareSavedReportPdfOptions {
  pdfUri: string;
  reportTitle: string;
}

export interface SavedReportDetails {
  title: string;
  locationDescription: string;
  fullPath: string;
  openHint: string;
  shareHint: string;
}

interface GeneratedPdfArtifacts {
  html: string;
  htmlFilename: string;
  pdfFilename: string;
  tempPdfFile: File;
}

interface ReportSaveTargets {
  siteDirectoryName: string;
  pdfFilename: string;
  htmlFilename: string;
  pdfFile: File;
  htmlFile: File;
}

function getSavedReportFullPath(pdfUri: string): string {
  if (!pdfUri.startsWith('file://')) {
    return decodeURIComponent(pdfUri);
  }

  try {
    return decodeURIComponent(new URL(pdfUri).pathname);
  } catch {
    return pdfUri;
  }
}

function getReportDatePrefix(report: GeneratedSiteReport): string {
  const visitDate = report.report.meta.visitDate?.trim();

  if (visitDate && /^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    return visitDate;
  }

  if (visitDate) {
    const parsedDate = new Date(visitDate);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().slice(0, 10);
    }
  }

  return new Date().toISOString().slice(0, 10);
}

function getSiteDirectoryName(siteName?: string | null): string {
  return sanitizeFilename(siteName?.trim() ?? '') || 'site-reports';
}

function describeDocumentsSave(_siteDirectoryName: string, pdfFilename: string): string {
  return `PDF saved for sharing: ${pdfFilename}`;
}

function getPdfShareOptions(reportTitle: string) {
  return {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: reportTitle,
  } as const;
}

function getShareUnavailableMessage(_pdfUri: string): string {
  if (Platform.OS === 'web') {
    return 'PDF export is not supported on web.';
  }

  return 'The PDF was generated, but sharing is not available on this device.';
}

export function getSavedReportDetails({
  locationDescription,
  pdfUri,
}: {
  locationDescription: string;
  pdfUri: string;
}): SavedReportDetails {
  return {
    title: 'PDF Saved',
    locationDescription,
    fullPath: getSavedReportFullPath(pdfUri),
    openHint: "Open PDF uses your device's PDF handler for the saved file.",
    shareHint: 'Share PDF sends the same file to another app.',
  };
}

export async function openSavedReportPdf(pdfUri: string): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Opening saved PDFs is not supported on web.');
  }

  const pdfFile = new File(pdfUri);
  const openUri =
    Platform.OS === 'android' && pdfFile.contentUri ? pdfFile.contentUri : pdfUri;

  try {
    await Linking.openURL(openUri);
  } catch {
    throw new Error(OPEN_PDF_ERROR_MESSAGE);
  }
}

export async function shareSavedReportPdf({
  pdfUri,
  reportTitle,
}: ShareSavedReportPdfOptions): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(getShareUnavailableMessage(pdfUri));
  }

  await Sharing.shareAsync(pdfUri, getPdfShareOptions(reportTitle));
}

async function generateReportPdfArtifacts(
  report: GeneratedSiteReport,
  branding?: PdfBranding,
): Promise<GeneratedPdfArtifacts> {
  const html = reportToHtml(report, branding);
  const { uri: tempUri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  const basename = sanitizeFilename(report.report.meta.title) || 'report';
  const datePrefix = getReportDatePrefix(report);
  const filenameBase = `${datePrefix}-${basename}`;

  return {
    html,
    htmlFilename: `${filenameBase}.html`,
    pdfFilename: `${filenameBase}.pdf`,
    tempPdfFile: new File(tempUri),
  };
}

function getReportSaveTargets(
  report: GeneratedSiteReport,
  options: ExportReportOptions,
): ReportSaveTargets {
  const basename = sanitizeFilename(report.report.meta.title) || 'report';
  const datePrefix = getReportDatePrefix(report);
  const filenameBase = `${datePrefix}-${basename}`;
  const pdfFilename = `${filenameBase}.pdf`;
  const htmlFilename = `${filenameBase}.html`;
  const siteDirectoryName = getSiteDirectoryName(options.siteName);
  const siteDirectory = ensureSiteReportsDir(options.siteName);

  return {
    siteDirectoryName,
    pdfFilename,
    htmlFilename,
    pdfFile: new File(siteDirectory, pdfFilename),
    htmlFile: new File(siteDirectory, htmlFilename),
  };
}

/**
 * Generate a PDF from a report and save it to the app's cache directory
 * for sharing with other apps. Returns the URIs for both the PDF and HTML files.
 */
export async function saveReportPdf(
  report: GeneratedSiteReport,
  options: ExportReportOptions,
  branding?: PdfBranding,
): Promise<ExportedReport> {
  if (Platform.OS === 'web') {
    throw new Error('Saving PDFs is not supported on web.');
  }

  const { html, tempPdfFile } = await generateReportPdfArtifacts(report, branding);
  const { siteDirectoryName, pdfFilename, pdfFile, htmlFile } = getReportSaveTargets(
    report,
    options,
  );
  let movedToDestination = false;

  try {
    if (pdfFile.exists) {
      pdfFile.delete();
    }

    tempPdfFile.move(pdfFile);
    movedToDestination = true;

    if (htmlFile.exists) {
      htmlFile.delete();
    }

    htmlFile.create({ intermediates: true });
    htmlFile.write(html);

    return {
      pdfUri: pdfFile.uri,
      pdfFilename,
      htmlUri: htmlFile.uri,
      locationDescription: describeDocumentsSave(siteDirectoryName, pdfFilename),
    };
  } finally {
    if (!movedToDestination && tempPdfFile.exists) {
      tempPdfFile.delete();
    }
  }
}

/**
 * Save a report PDF locally and then open the native share sheet.
 */
export async function exportReportPdf(
  report: GeneratedSiteReport,
  options: ExportReportOptions,
  branding?: PdfBranding,
): Promise<ExportedReport> {
  const result = await saveReportPdf(report, options, branding);

  try {
    await shareSavedReportPdf({
      pdfUri: result.pdfUri,
      reportTitle: report.report.meta.title,
    });
  } catch (error) {
    return {
      ...result,
      shareErrorMessage:
        error instanceof Error ? error.message : getShareUnavailableMessage(result.pdfUri),
    };
  }

  return result;
}
