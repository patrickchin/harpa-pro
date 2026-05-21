/**
 * ReportDetailHeader — title + visit-date pill + Actions button row
 * for the saved-report screen. Ported verbatim from
 * `../haru3-reports/apps/mobile/components/reports/detail/ReportDetailHeader.tsx`
 * on branch `dev`.
 */
import { Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { Calendar, MoreHorizontal } from 'lucide-react-native';

import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { Button } from '@/components/primitives/Button';
import { colors } from '@/lib/design-tokens/colors';
import { formatDate } from '@/lib/date';
import { toTitleCase } from '@harpa/report-core';
import type { GeneratedSiteReport } from '@harpa/report-core';

interface ReportDetailHeaderProps {
  report: GeneratedSiteReport;
  onBack: () => void;
  onOpenActions: () => void;
  actionsDisabled: boolean;
  actions?: ReactNode;
}

export function ReportDetailHeader({
  report,
  onBack,
  onOpenActions,
  actionsDisabled,
  actions,
}: ReportDetailHeaderProps) {
  return (
    <View className="px-5 py-4">
      <ScreenHeader
        title={report.report.meta.title}
        eyebrow={toTitleCase(report.report.meta.reportType)}
        onBack={onBack}
        backLabel="Reports"
        actions={actions}
      />

      <View className="mt-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          {report.report.meta.visitDate ? (
            <View className="flex-row items-center gap-1 rounded-md border border-border bg-card px-3 py-2">
              <Calendar size={14} color={colors.muted.foreground} />
              <Text className="text-sm font-semibold text-muted-foreground">
                {formatDate(report.report.meta.visitDate)}
              </Text>
            </View>
          ) : null}
        </View>
        <Button
          variant="secondary"
          size="default"
          accessibilityLabel="Open report actions menu"
          testID="btn-report-actions"
          onPress={onOpenActions}
          disabled={actionsDisabled}
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
