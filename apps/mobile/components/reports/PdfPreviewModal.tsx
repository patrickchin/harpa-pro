/**
 * PdfPreviewModal — fullscreen modal that renders a generated PDF
 * in-app.
 *
 * Ported from
 * `../haru3-reports/apps/mobile/components/reports/PdfPreviewModal.tsx`
 * on branch `dev` (commit dbaa4c1) and adapted for v4 import paths
 * (`@harpa/report-core`, `@/components/primitives/*`). iOS uses
 * `react-native-webview` to render the local PDF; Android can't
 * render local PDFs in WebView, so it uses `react-native-pdf` with
 * an "Open externally" fallback.
 */
import { ActivityIndicator, Modal, Platform, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import Pdf from 'react-native-pdf';
import { Share2 } from 'lucide-react-native';
import { WebView } from 'react-native-webview';

import { Button } from '@/components/primitives/Button';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import {
  openSavedReportPdf,
  saveReportPdf,
  shareSavedReportPdf,
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
  const [isSharing, setIsSharing] = useState(false);
  const [pdfResult, setPdfResult] = useState<ExportedReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setPdfResult(null);
      setErrorMessage(null);
      setIsGenerating(false);
      setIsSharing(false);
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
            err instanceof Error ? err.message : "Couldn't generate PDF.",
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

  const handleShare = async () => {
    if (!pdfResult || !report) return;
    setIsSharing(true);
    try {
      await shareSavedReportPdf({
        pdfUri: pdfResult.pdfUri,
        reportTitle: report.report.meta.title,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Couldn't share PDF.",
      );
    } finally {
      setIsSharing(false);
    }
  };

  // On Android, WebView can't render local PDFs directly. We render the
  // PDF in-app via `react-native-pdf` and offer an "Open externally"
  // button as a fallback for users who prefer their system viewer.
  const handleOpenExternally = async () => {
    if (!pdfResult) return;
    try {
      await openSavedReportPdf(pdfResult.pdfUri);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Couldn't open PDF.",
      );
    }
  };

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
              trailing={
                pdfResult ? (
                  <Button
                    variant="secondary"
                    size="default"
                    accessibilityLabel="Share PDF"
                    onPress={handleShare}
                    disabled={isSharing}
                  >
                    <View className="flex-row items-center gap-1.5">
                      <Share2 size={14} color={colors.foreground} />
                      <Text className="text-sm font-semibold text-foreground">
                        {isSharing ? 'Sharing…' : 'Share'}
                      </Text>
                    </View>
                  </Button>
                ) : null
              }
            />
          </View>

          {isGenerating ? (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator size="large" color={colors.foreground} />
              <Text className="text-base text-muted-foreground">
                Generating PDF…
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
            Platform.OS === 'ios' ? (
              <WebView
                testID="pdf-preview"
                source={{ uri: pdfResult.pdfUri }}
                style={{ flex: 1 }}
                originWhitelist={['file://*']}
                allowFileAccess
                startInLoadingState
                renderLoading={() => (
                  <View className="absolute inset-0 items-center justify-center bg-background">
                    <ActivityIndicator size="large" color={colors.foreground} />
                  </View>
                )}
              />
            ) : (
              <View className="flex-1" testID="pdf-preview">
                <Pdf
                  source={{ uri: pdfResult.pdfUri }}
                  style={{ flex: 1, backgroundColor: colors.card }}
                  trustAllCerts={false}
                  onError={(err) => {
                    setErrorMessage(
                      err instanceof Error
                        ? err.message
                        : "Couldn't display PDF.",
                    );
                  }}
                />
                <View className="px-5 py-3">
                  <Button
                    variant="secondary"
                    size="default"
                    onPress={handleOpenExternally}
                    accessibilityLabel="Open in external PDF viewer"
                    testID="btn-pdf-open-externally"
                  >
                    Open externally
                  </Button>
                </View>
              </View>
            )
          ) : null}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
