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
import type { ReportNoteRow } from '@/components/reports/detail/ReportNotesPane';

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

// Seeded note rows so the Notes tab + ReportPhotos block render every
// row kind in the dev mirror (text + voice + photo + document). The
// photo + voice + document rows depend on `useFileSignedUrl` which
// makes a network call — in fixture mode the call returns `null` so
// the rows render their empty-state placeholders, which is exactly
// what we want for a static design eyeball.
const SAMPLE_NOTE_ROWS: ReadonlyArray<ReportNoteRow> = [
  {
    id: 'note-text-1',
    kind: 'text',
    body: 'Crane operator reported a wind-stop alarm at 14:02 — pause and reassess.',
    createdAt: new Date(Date.now() - 1_000 * 60 * 30).toISOString(),
    authorName: 'Site Lead',
    fileId: null,
  },
  {
    id: 'note-voice-1',
    kind: 'voice',
    body: 'Concrete pour on slab B is on track. Two cubes taken for testing.',
    createdAt: new Date(Date.now() - 1_000 * 60 * 50).toISOString(),
    authorName: 'Foreman',
    fileId: 'fil_voice_dev_1',
  },
  {
    id: 'note-photo-1',
    kind: 'photo',
    body: 'East elevation rebar tied off.',
    createdAt: new Date(Date.now() - 1_000 * 60 * 75).toISOString(),
    authorName: 'Site Lead',
    fileId: 'fil_photo_dev_1',
  },
  {
    id: 'note-document-1',
    kind: 'document',
    body: 'Daily inspection sheet.pdf',
    createdAt: new Date(Date.now() - 1_000 * 60 * 100).toISOString(),
    authorName: 'PM',
    fileId: 'fil_doc_dev_1',
  },
];

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
          noteRows={SAMPLE_NOTE_ROWS}
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
