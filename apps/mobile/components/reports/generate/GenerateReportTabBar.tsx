/**
 * GenerateReportTabBar — Notes / Report / Edit tab switcher.
 *
 * Ported from
 * `../haru3-reports/apps/mobile/components/reports/generate/GenerateReportTabBar.tsx`
 * on branch `dev`. v4 drops the canonical `Debug` tab — the report-JSON
 * inspector that shipped in v3 lives behind a feature flag and isn't
 * part of the user-facing surface.
 *
 * Tailwind classes copied verbatim (NativeWind v4, Pitfall 3).
 */
import { ActivityIndicator, Keyboard, Pressable, Text, View } from 'react-native';
import { FileText, MessageSquare, Pencil } from 'lucide-react-native';

import { useGenerateReport } from './GenerateReportProvider';
import type { TabKey } from './tabs';
import { colors } from '@/lib/design-tokens/colors';
import { getGenerateReportTabLabel } from '@/lib/generate-report-ui';

export function GenerateReportTabBar() {
  const { tabs, notes, generation } = useGenerateReport();
  const notesCount = notes.totalCount;

  const select = (tab: TabKey) => {
    Keyboard.dismiss();
    tabs.set(tab);
  };

  return (
    <View className="mx-5 mt-3 mb-2 flex-row rounded-lg border border-border bg-card p-1">
      <Pressable
        testID="btn-tab-notes"
        onPress={() => select('notes')}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          tabs.active === 'notes' ? 'bg-secondary border-b-2 border-accent' : ''
        }`}
      >
        <MessageSquare
          size={16}
          color={tabs.active === 'notes' ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            tabs.active === 'notes' ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {getGenerateReportTabLabel('notes', notesCount)}
        </Text>
      </Pressable>
      <Pressable
        testID="btn-tab-report"
        onPress={() => select('report')}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          tabs.active === 'report' ? 'bg-secondary border-b-2 border-accent' : ''
        }`}
      >
        <FileText
          size={16}
          color={tabs.active === 'report' ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            tabs.active === 'report' ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {getGenerateReportTabLabel('report', notesCount)}
        </Text>
        {generation.isUpdating ? (
          <ActivityIndicator size="small" color={colors.foreground} />
        ) : null}
      </Pressable>
      <Pressable
        testID="btn-tab-edit"
        onPress={tabs.openEdit}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          tabs.active === 'edit' ? 'bg-secondary border-b-2 border-accent' : ''
        }`}
      >
        <Pencil
          size={16}
          color={tabs.active === 'edit' ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            tabs.active === 'edit' ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {getGenerateReportTabLabel('edit', notesCount)}
        </Text>
      </Pressable>
    </View>
  );
}
