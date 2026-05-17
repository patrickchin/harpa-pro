/**
 * Dev mirror — Usage screen with mode toggles.
 *
 * Mirrors `app/(app)/usage.tsx` with canned monthly history.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/primitives/Button';
import { Usage, type UsageMonthlyRow } from '@/screens/usage';

type Mode = 'populated' | 'loading' | 'empty' | 'single-month';

const SAMPLE_HISTORY: ReadonlyArray<UsageMonthlyRow> = [
  { month: '2024-11', reportsCount: 12, voiceNotesCount: 34 },
  { month: '2024-10', reportsCount: 8, voiceNotesCount: 21 },
  { month: '2024-09', reportsCount: 15, voiceNotesCount: 40 },
];

export default function DevUsage() {
  const [mode, setMode] = useState<Mode>('populated');

  const history: ReadonlyArray<UsageMonthlyRow> | null =
    mode === 'loading'
      ? null
      : mode === 'empty'
        ? []
        : mode === 'single-month'
          ? SAMPLE_HISTORY.slice(0, 1)
          : SAMPLE_HISTORY;

  const totals =
    mode === 'empty' || mode === 'loading'
      ? { reports: 0, voiceNotes: 0 }
      : history!.reduce(
          (acc, r) => ({
            reports: acc.reports + r.reportsCount,
            voiceNotes: acc.voiceNotes + r.voiceNotesCount,
          }),
          { reports: 0, voiceNotes: 0 },
        );

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row flex-wrap gap-2 px-5 py-3 border-b border-border">
        {(['populated', 'loading', 'empty', 'single-month'] as Mode[]).map((m) => (
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
        <Usage
          history={history}
          totals={totals}
          isLoading={mode === 'loading'}
          refreshing={false}
          onRefresh={() => undefined}
          onBack={() => undefined}
        />
      </View>
    </View>
  );
}
