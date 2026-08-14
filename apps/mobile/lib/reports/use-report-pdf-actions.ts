/**
 * useReportPdfActions — ported from
 * `../haru3-reports/apps/mobile/hooks/useReportPdfActions.ts` on
 * branch `dev`.
 *
 * Owns the PDF action state machine (saving / sharing / opening /
 * error) and the `SavedReportSheet` controlled state. Delegates to
 * `lib/reports/export-report-pdf.ts` for the actual pipeline
 * (expo-print + expo-sharing + expo-file-system).
 */
import { useState } from 'react';

import {
  exportReportPdf,
  getSavedReportDetails,
  openSavedReportPdf,
  saveReportPdf,
  shareSavedReportPdf,
} from '@/lib/reports/export-report-pdf';
import {
  getActionErrorDialogCopy,
  type AppDialogCopy,
} from '@/lib/dialogs/app-dialog-copy';
import { displayReportTitle } from '@/lib/reports/report-body';
import { reports } from '@harpa/api-contract';

export interface SavedReportSheetState {
  status: 'generating' | 'ready' | 'error';
  locationDescription?: string;
  pdfUri?: string;
  reportTitle: string;
  errorMessage?: string;
}

interface UseReportPdfActionsArgs {
  displayReport: reports.ReportBody | null;
  siteName: string | null;
  onExportError: (copy: AppDialogCopy & { kind: 'error' }) => void;
}

export function useReportPdfActions({
  displayReport,
  siteName,
  onExportError,
}: UseReportPdfActionsArgs) {
  const [isExporting, setIsExporting] = useState(false);
  const [isOpeningSavedPdf, setIsOpeningSavedPdf] = useState(false);
  const [isSharingSavedPdf, setIsSharingSavedPdf] = useState(false);
  const [savedReportSheet, setSavedReportSheet] =
    useState<SavedReportSheetState | null>(null);
  const [savedReportSheetError, setSavedReportSheetError] = useState<
    string | null
  >(null);

  const isSaving = savedReportSheet?.status === 'generating';

  const closeSavedReportSheet = () => {
    setSavedReportSheet(null);
    setSavedReportSheetError(null);
    setIsOpeningSavedPdf(false);
    setIsSharingSavedPdf(false);
  };

  const handleSavePdf = async () => {
    if (!displayReport) return;
    setSavedReportSheetError(null);

    setSavedReportSheet({
      status: 'generating',
      reportTitle: displayReportTitle(displayReport),
    });

    try {
      const result = await saveReportPdf(displayReport, { siteName });
      setSavedReportSheet({
        status: 'ready',
        locationDescription:
          result.locationDescription ?? `Saved as ${result.pdfFilename}.`,
        pdfUri: result.pdfUri,
        reportTitle: displayReportTitle(displayReport),
      });
    } catch (e) {
      setSavedReportSheet({
        status: 'error',
        reportTitle: displayReportTitle(displayReport),
        errorMessage: e instanceof Error ? e.message : "Couldn't generate PDF.",
      });
    }
  };

  const handleOpenSavedPdf = async () => {
    if (!savedReportSheet || !savedReportSheet.pdfUri) return;
    setIsOpeningSavedPdf(true);
    setSavedReportSheetError(null);

    try {
      await openSavedReportPdf(savedReportSheet.pdfUri);
      closeSavedReportSheet();
    } catch (error) {
      setSavedReportSheetError(
        error instanceof Error
          ? error.message
          : "Couldn't open the saved PDF.",
      );
    } finally {
      setIsOpeningSavedPdf(false);
    }
  };

  const handleShareSavedPdf = async () => {
    if (!savedReportSheet || !savedReportSheet.pdfUri) return;
    setIsSharingSavedPdf(true);
    setSavedReportSheetError(null);

    try {
      await shareSavedReportPdf({
        pdfUri: savedReportSheet.pdfUri,
        reportTitle: savedReportSheet.reportTitle,
      });
      closeSavedReportSheet();
    } catch (error) {
      setSavedReportSheetError(
        error instanceof Error
          ? error.message
          : "Couldn't share the saved PDF.",
      );
    } finally {
      setIsSharingSavedPdf(false);
    }
  };

  const handleSharePdf = async () => {
    if (!displayReport) return;
    setIsExporting(true);
    setSavedReportSheetError(null);
    try {
      const result = await exportReportPdf(displayReport, { siteName });

      if (result.shareErrorMessage) {
        setSavedReportSheet({
          status: 'ready',
          locationDescription:
            result.locationDescription ?? `Saved as ${result.pdfFilename}.`,
          pdfUri: result.pdfUri,
          reportTitle: displayReportTitle(displayReport),
        });
        setSavedReportSheetError(result.shareErrorMessage);
      }
    } catch (e) {
      onExportError({
        kind: 'error',
        ...getActionErrorDialogCopy({
          title: "Couldn't export PDF",
          fallbackMessage: "Couldn't generate PDF.",
          message: e instanceof Error ? e.message : "Couldn't generate PDF.",
        }),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const savedReportDetails =
    savedReportSheet?.status === 'ready' &&
    savedReportSheet.locationDescription &&
    savedReportSheet.pdfUri
      ? getSavedReportDetails({
          locationDescription: savedReportSheet.locationDescription,
          pdfUri: savedReportSheet.pdfUri,
        })
      : null;

  return {
    isExporting,
    isOpeningSavedPdf,
    isSharingSavedPdf,
    isSaving,
    savedReportSheet,
    savedReportSheetError,
    savedReportDetails,
    closeSavedReportSheet,
    handleSavePdf,
    handleOpenSavedPdf,
    handleShareSavedPdf,
    handleSharePdf,
  };
}

export type UseReportPdfActionsReturn = ReturnType<typeof useReportPdfActions>;
