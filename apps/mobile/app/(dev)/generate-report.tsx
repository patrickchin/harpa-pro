/**
 * Dev mirror — Generate Report (Report tab) with state toggles.
 *
 * Mirrors the route at
 * `app/(app)/projects/[projectSlug]/reports/[number]/generate.tsx`
 * with mocked report state. Toggle between no-report / generating /
 * live-report / generation-error / finalize-error to eyeball the
 * Report tab without needing a real draft or API call.
 */
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/primitives/Button';
import { GenerateNotes } from '@/screens/generate-notes';
import { SAMPLE_GENERATED_REPORT } from '@/lib/dev-fixtures/sample-report';
import type { GeneratedSiteReport } from '@harpa/report-core';

type Mode =
  | 'no-report'
  | 'generating'
  | 'live-report'
  | 'generation-error'
  | 'finalize-error';

const MODES: readonly Mode[] = [
  'no-report',
  'generating',
  'live-report',
  'generation-error',
  'finalize-error',
];

export default function DevGenerateReport() {
  const [mode, setMode] = useState<Mode>('live-report');

  const report: GeneratedSiteReport | null =
    mode === 'live-report' || mode === 'finalize-error'
      ? SAMPLE_GENERATED_REPORT
      : null;

  const handleRegenerate = useCallback(() => {
    // Dev-mirror no-op: state is driven by the toggle row above.
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
        isGeneratingReport={mode === 'generating'}
        generationError={
          mode === 'generation-error'
            ? 'Generation failed: provider returned 500.'
            : null
        }
        finalizeError={
          mode === 'finalize-error'
            ? 'Finalize failed: please retry.'
            : null
        }
        onRegenerate={handleRegenerate}
        initialTab="report"
      />
    </View>
  );
}
