/**
 * ReportDetailTabBar — two-tab bar (Report / Notes) with an optional
 * notes-count badge. Originally three-tab including an Edit tab; the
 * Edit tab was removed when saved-report editing moved to a per-card
 * full-screen modal — see
 * `docs/superpowers/specs/2026-06-03-report-edit-modal-redesign-design.md`.
 */
import { Pressable, Text, View } from 'react-native';
import { FileText, MessageSquare } from 'lucide-react-native';

import { colors } from '@/lib/design-tokens/colors';

export type ReportDetailTab = 'report' | 'notes';

interface ReportDetailTabBarProps {
  activeTab: ReportDetailTab;
  onChange: (tab: ReportDetailTab) => void;
  notesCount?: number;
  /**
   * Whether the Notes tab is shown inline. Finalised reports hide the
   * Notes tab and surface the notes screen via the Actions menu
   * instead.
   */
  showNotesTab?: boolean;
}

export function ReportDetailTabBar({
  activeTab,
  onChange,
  notesCount,
  showNotesTab = true,
}: ReportDetailTabBarProps) {
  const notesLabel =
    typeof notesCount === 'number' && notesCount > 0
      ? `Notes (${notesCount})`
      : 'Notes';

  return (
    <View className="mx-5 mb-2 flex-row rounded-lg border border-border bg-card p-1">
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
      {showNotesTab ? (
        <Pressable
          testID="btn-tab-notes"
          onPress={() => onChange('notes')}
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
            activeTab === 'notes' ? 'bg-foreground' : ''
          }`}
        >
          <MessageSquare
            size={16}
            color={
              activeTab === 'notes'
                ? colors.primary.foreground
                : colors.muted.foreground
            }
            style={{ marginTop: 1 }}
          />
          <Text
            className={`text-sm font-semibold ${
              activeTab === 'notes'
                ? 'text-primary-foreground'
                : 'text-muted-foreground'
            }`}
          >
            {notesLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
