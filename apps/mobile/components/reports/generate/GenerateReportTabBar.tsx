/**
 * GenerateReportTabBar — Notes / Report switcher with optional Debug.
 *
 * Ported from
 * `../haru3-reports/apps/mobile/components/reports/generate/GenerateReportTabBar.tsx`
 * on branch `dev`. The report-JSON inspector remains behind a developer
 * flag and is not part of the default user-facing surface.
 *
 * Tailwind classes copied verbatim (NativeWind v4, Pitfall 3).
 */
import { ActivityIndicator, Keyboard, Pressable, Text, View } from 'react-native';
import { Bug, FileText, MessageSquare } from 'lucide-react-native';

import { useGenerateReport } from '@/features/generate/GenerateReportProvider';
import type { TabKey } from './tabs';
import { colors } from '@/lib/design-tokens/colors';
import { getGenerateReportTabLabel } from '@/lib/reports/generate-report-ui';
import { useDeveloperFlags } from '@/lib/config/dev-flags';

export function GenerateReportTabBar() {
  const { tabs, notes, generation } = useGenerateReport();
  const notesCount = notes.totalCount;
  const { showGenerateDebugTab } = useDeveloperFlags();

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
      {showGenerateDebugTab ? (
        <Pressable
          testID="btn-tab-debug"
          onPress={() => select('debug')}
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
            tabs.active === 'debug' ? 'bg-secondary border-b-2 border-accent' : ''
          }`}
        >
          <Bug
            size={16}
            color={tabs.active === 'debug' ? colors.foreground : colors.muted.foreground}
            style={{ marginTop: 1 }}
          />
          <Text
            className={`text-sm font-semibold ${
              tabs.active === 'debug' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {getGenerateReportTabLabel('debug', notesCount)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
