/**
 * Dev mirror — Saved report screen with state toggles.
 *
 * Mirrors the route at
 * `app/(app)/projects/[project]/reports/[number]/index.tsx` with
 * mocked report data + PDF action stubs. Toggle between
 *   - `loading`     → ReportDetailSkeleton
 *   - `error`       → "Failed to load report" with Retry
 *   - `draft`       → live report with Edit tab visible
 *   - `finalized`   → live report with Edit tab hidden + Unfinalize
 * to eyeball every visible state without spinning a real API.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/primitives/Button';
import { SavedReport, type SavedReportStatus } from '@/screens/saved-report';
import { SAMPLE_GENERATED_REPORT } from '@/lib/dev-fixtures/sample-report';
import type { UseReportPdfActionsReturn } from '@/lib/use-report-pdf-actions';

type Mode = 'loading' | 'error' | 'draft' | 'finalized';

const STUB_PDF_ACTIONS: UseReportPdfActionsReturn = {
  isExporting: false,
  isOpeningSavedPdf: false,
  isSharingSavedPdf: false,
  isSaving: false,
  savedReportSheet: null,
  savedReportSheetError: null,
  savedReportDetails: null,
  closeSavedReportSheet: () => undefined,
  handleSavePdf: async () => undefined,
  handleOpenSavedPdf: async () => undefined,
  handleShareSavedPdf: async () => undefined,
  handleSharePdf: async () => undefined,
};

export default function DevSavedReport() {
  const [mode, setMode] = useState<Mode>('draft');

  const isLoading = mode === 'loading';
  const loadError = mode === 'error' ? new Error('Network unavailable.') : null;
  const reportStatus: SavedReportStatus =
    mode === 'finalized' ? 'finalized' : 'draft';

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row flex-wrap gap-2 px-5 py-3 border-b border-border">
        {(['loading', 'error', 'draft', 'finalized'] as Mode[]).map((m) => (
          <Button
            key={m}
            variant={mode === m ? 'default' : 'outline'}
            size="sm"
            onPress={() => setMode(m)}
          >
            {m}
          </Button>
        ))}
      </View>

      <View className="flex-1">
        <SavedReport
          report={mode === 'error' || mode === 'loading' ? null : SAMPLE_GENERATED_REPORT}
          reportStatus={reportStatus}
          projectName="Highland Tower"
          noteRows={[]}
          isLoading={isLoading}
          loadError={loadError}
          hasValidRouteParams
          refreshing={false}
          onRefresh={() => undefined}
          onBack={() => undefined}
          onRetry={() => setMode('draft')}
          onBackToProjects={() => undefined}
          onChangeReport={() => undefined}
          isAutoSaving={false}
          lastSavedAt={null}
          canUnfinalize={mode === 'finalized'}
          canDelete
          onConfirmDelete={() => undefined}
          onConfirmUnfinalize={() => setMode('draft')}
          isDeleting={false}
          isUnfinalizing={false}
          pdfActions={STUB_PDF_ACTIONS}
        />
      </View>
    </View>
  );
}
