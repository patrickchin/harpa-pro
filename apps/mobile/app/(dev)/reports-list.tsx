/**
 * Dev mirror — Reports list with state toggles.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { ReportsList } from '@/screens/reports-list';
import type { ReportListItem } from '@/lib/project-reports-list';
import { Button } from '@/components/primitives/Button';

const SAMPLE: ReportListItem[] = [
  {
    id: 'r1',
    slug: 'rpt_aaa1',
    number: 3,
    status: 'draft',
    visitDate: new Date().toISOString(),
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'r2',
    slug: 'rpt_bbb2',
    number: 2,
    status: 'finalized',
    visitDate: new Date(Date.now() - 86_400_000).toISOString(),
    createdAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
  {
    id: 'r3',
    slug: 'rpt_ccc3',
    number: 1,
    status: 'finalized',
    visitDate: new Date(Date.now() - 86_400_000 * 7).toISOString(),
    createdAt: new Date(Date.now() - 86_400_000 * 7).toISOString(),
    updatedAt: new Date(Date.now() - 86_400_000 * 7).toISOString(),
  },
];

type Mode = 'populated' | 'empty' | 'loading' | 'creating';

export default function DevReportsList() {
  const [mode, setMode] = useState<Mode>('populated');
  return (
    <View className="flex-1 bg-background">
      <View className="flex-row flex-wrap gap-2 px-5 py-3 border-b border-border">
        {(['populated', 'empty', 'loading', 'creating'] as Mode[]).map((m) => (
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
      <ReportsList
        reports={mode === 'empty' || mode === 'loading' ? [] : SAMPLE}
        projectName="Highland Tower"
        canCreate
        isLoading={mode === 'loading'}
        refreshing={false}
        isCreating={mode === 'creating'}
        onRefresh={() => undefined}
        onBack={() => undefined}
        onCreate={() => undefined}
        onOpenReport={() => undefined}
      />
    </View>
  );
}
