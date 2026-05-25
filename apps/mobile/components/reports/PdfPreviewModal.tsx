/**
 * PdfPreviewModal — fullscreen modal that renders a generated PDF
 * in-app. Ported (with v4 deferrals) from
 * `../haru3-reports/apps/mobile/components/reports/PdfPreviewModal.tsx`
 * on branch `dev`.
 *
 * The canonical version uses `react-native-webview` (iOS) /
 * `react-native-pdf` (Android) to render the PDF and pulls
 * `saveReportPdf` / `shareSavedReportPdf` / `openSavedReportPdf` from
 * Expo Print + Sharing. None of those packages are installed in the
 * v4 mobile app yet, so this port keeps the modal chrome + the
 * generating / error states wired through the `useReportPdfActions`
 * stub backend, and surfaces a "deferred" notice in place of the PDF
 * pixels.
 *
 * TODO(P4): swap the placeholder for `react-native-webview` /
 * `react-native-pdf` + the real Expo Print pipeline once those land.
 */
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

import { Button } from '@/components/primitives/Button';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import {
  saveReportPdf,
  type ExportedReport,
} from '@/lib/reports/export-report-pdf';
import { colors } from '@/lib/design-tokens/colors';
import type { GeneratedSiteReport } from '@harpa/report-core';

interface PdfPreviewModalProps {
  visible: boolean;
  report: GeneratedSiteReport | undefined;
  siteName?: string | null;
  onClose: () => void;
}

export function PdfPreviewModal({
  visible,
  report,
  siteName,
  onClose,
}: PdfPreviewModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfResult, setPdfResult] = useState<ExportedReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setPdfResult(null);
      setErrorMessage(null);
      setIsGenerating(false);
      return;
    }

    if (!report) return;

    let cancelled = false;
    setIsGenerating(true);
    setErrorMessage(null);

    saveReportPdf(report, { siteName: siteName ?? null })
      .then((result) => {
        if (!cancelled) setPdfResult(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Could not generate PDF.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsGenerating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, report, siteName]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView
          className="flex-1 bg-background"
          edges={['top', 'bottom']}
        >
          <View className="px-5 pb-2 pt-2">
            <ScreenHeader
              title="PDF Preview"
              onBack={onClose}
              backLabel="Close"
            />
          </View>

          {isGenerating ? (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator size="large" color={colors.foreground} />
              <Text className="text-base text-muted-foreground">
                Generating PDF...
              </Text>
            </View>
          ) : errorMessage ? (
            <View className="flex-1 items-center justify-center px-5">
              <InlineNotice tone="danger" title="PDF generation failed">
                {errorMessage}
              </InlineNotice>
              <Button
                variant="secondary"
                size="default"
                className="mt-4"
                onPress={onClose}
              >
                Close
              </Button>
            </View>
          ) : pdfResult ? (
            <View
              className="flex-1 items-center justify-center px-5"
              testID="pdf-preview"
            >
              {/* TODO(P4): replace with WebView / react-native-pdf
                  once those packages port. */}
              <InlineNotice tone="info" title="PDF preview pending P4">
                PDF was generated at {pdfResult.pdfUri}. Inline rendering
                lands once `react-native-webview` + `react-native-pdf`
                are wired in P4.
              </InlineNotice>
              <Button
                variant="secondary"
                size="default"
                className="mt-4"
                onPress={onClose}
              >
                Close
              </Button>
            </View>
          ) : null}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
