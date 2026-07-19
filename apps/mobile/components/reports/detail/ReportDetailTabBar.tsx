/**
 * ReportDetailTabBar — two-tab bar. Drafts use Report / Notes and
 * finalized reports use Report / Review. Originally three-tab including an Edit tab; the
 * Edit tab was removed when saved-report editing moved to a per-card
 * full-screen modal — see
 * `docs/superpowers/specs/2026-06-03-report-edit-modal-redesign-design.md`.
 */
import { Pressable, Text, View } from 'react-native';
import { FileText, MessageSquare } from 'lucide-react-native';

import { colors } from '@/lib/design-tokens/colors';

export type ReportDetailTab = 'report' | 'notes' | 'review';

interface ReportDetailTabBarProps {
  activeTab: ReportDetailTab;
  onChange: (tab: ReportDetailTab) => void;
  secondaryTab: 'notes' | 'review';
  secondaryCount?: number;
}

export function ReportDetailTabBar({
  activeTab,
  onChange,
  secondaryTab,
  secondaryCount,
}: ReportDetailTabBarProps) {
  const secondaryName = secondaryTab === 'review' ? 'Review' : 'Notes';
  const secondaryLabel =
    typeof secondaryCount === 'number' && secondaryCount > 0
      ? `${secondaryName} (${secondaryCount})`
      : secondaryName;

  return (
    <View className="min-w-0 flex-1 flex-row rounded-lg border border-border bg-card p-1">
      <Pressable
        testID="btn-tab-report"
        onPress={() => onChange('report')}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          activeTab === 'report' ? 'bg-foreground' : ''
        }`}
      >
        <FileText
          size={16}
          color={
            activeTab === 'report'
              ? colors.primary.foreground
              : colors.muted.foreground
          }
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            activeTab === 'report'
              ? 'text-primary-foreground'
              : 'text-muted-foreground'
          }`}
        >
          Report
        </Text>
      </Pressable>
      <Pressable
        testID={`btn-tab-${secondaryTab}`}
        onPress={() => onChange(secondaryTab)}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          activeTab === secondaryTab ? 'bg-foreground' : ''
        }`}
      >
        <MessageSquare
          size={16}
          color={
            activeTab === secondaryTab
              ? colors.primary.foreground
              : colors.muted.foreground
          }
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            activeTab === secondaryTab
              ? 'text-primary-foreground'
              : 'text-muted-foreground'
          }`}
        >
          {secondaryLabel}
        </Text>
      </Pressable>
    </View>
  );
}
