/**
 * Dev mirror — Generate Report (Edit tab) with state toggles.
 *
 * Mirrors the route at
 * `app/(app)/projects/[projectSlug]/reports/[number]/generate.tsx`
 * with a mock report + a local `useState` driving `onSetReport`.
 * Toggle between no-report / live-report / autosaving / saved to
 * eyeball the empty state, the inline editor, and the autosave
 * status row without needing a real draft or the autosave hook.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/primitives/Button';
import { GenerateNotes } from '@/screens/generate-notes';
import { SAMPLE_GENERATED_REPORT } from '@/lib/dev-fixtures/sample-report';
import type { GeneratedSiteReport } from '@harpa/report-core';

type Mode = 'no-report' | 'live-report' | 'autosaving' | 'saved';

const MODES: readonly Mode[] = ['no-report', 'live-report', 'autosaving', 'saved'];

export default function DevGenerateEdit() {
  const [mode, setMode] = useState<Mode>('live-report');
  const [report, setReport] = useState<GeneratedSiteReport | null>(
    SAMPLE_GENERATED_REPORT,
  );

  useEffect(() => {
    if (mode === 'no-report') {
      setReport(null);
      return;
    }
    setReport((prev) => prev ?? SAMPLE_GENERATED_REPORT);
  }, [mode]);

  const isAutoSaving = mode === 'autosaving';
  const lastSavedAt = useMemo(
    () => (mode === 'saved' || mode === 'autosaving' ? Date.now() : null),
    [mode],
  );

  const handleSetReport = useCallback((next: GeneratedSiteReport) => {
    setReport(next);
  }, []);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row flex-wrap gap-2 px-5 py-3 border-b border-border">
        {MODES.map((m) => (
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
      <GenerateNotes
        projectSlug="prj_dev"
        reportNumber={1}
        notes={[]}
        notesLoading={false}
        reportTitle="Highland Tower — Visit 1"
        canWrite
        onBack={() => undefined}
        report={report}
        onSetReport={handleSetReport}
        isAutoSaving={isAutoSaving}
        lastSavedAt={lastSavedAt}
        initialTab="edit"
      />
    </View>
  );
}
