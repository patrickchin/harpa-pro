/**
 * ReportDetailHeader — title + Actions button row for the saved-report
 * screen.
 *
 * Title rule (see `docs/v4/design-report-title-consistency.md`):
 *   title = report.meta.title?.trim() || `Report #N`
 *
 * The finalized header is intentionally lean: no subtitle, no
 * report-type eyebrow, no standalone visit-date pill. The visit date
 * already appears in the StatBar within the report body just below,
 * so a duplicate subtitle here would be noise.
 */
import { Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react-native';

import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { Button } from '@/components/primitives/Button';
import { colors } from '@/lib/design-tokens/colors';
import type { GeneratedSiteReport } from '@harpa/report-core';

interface ReportDetailHeaderProps {
  report: GeneratedSiteReport;
  onBack: () => void;
  onOpenActions: () => void;
  actionsDisabled: boolean;
  tabs: ReactNode;
  actions?: ReactNode;
  /** Per-project report number — drives the title fallback + testID. */
  reportNumber?: number | null;
}

export function ReportDetailHeader({
  report,
  onBack,
  onOpenActions,
  actionsDisabled,
  tabs,
  actions,
  reportNumber,
}: ReportDetailHeaderProps) {
  const numStr = reportNumber ?? 'x';
  const rawTitle = report.report.meta.title?.trim();
  const title =
    rawTitle && rawTitle.length > 0
      ? rawTitle
      : reportNumber !== null && reportNumber !== undefined
        ? `Report #${reportNumber}`
        : 'Report';

  return (
    <View className="px-5 py-4">
      <ScreenHeader
        title={title}
        onBack={onBack}
        backLabel="Reports"
        actions={actions}
        titleTestID={`report-title-${numStr}`}
      />

      <View
        testID="report-header-controls"
        className="mt-3 flex-row items-center gap-2"
      >
        {tabs}
        <Button
          variant="secondary"
          size="default"
          accessibilityLabel="Open report actions menu"
          testID="btn-report-actions"
          onPress={onOpenActions}
          disabled={actionsDisabled}
          className="shrink-0"
        >
          <View className="flex-row items-center gap-1.5">
            <MoreHorizontal size={16} color={colors.foreground} />
            <Text className="text-sm font-semibold text-foreground">
              Actions
            </Text>
          </View>
        </Button>
      </View>
    </View>
  );
}
