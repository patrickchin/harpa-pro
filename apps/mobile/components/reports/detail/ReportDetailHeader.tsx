/**
 * ReportDetailHeader — title + small `#N · {visit date}` subtitle +
 * Actions button row for the saved-report screen.
 *
 * Title rule (see `docs/v4/design-report-title-consistency.md`):
 *   title = report.meta.title?.trim() || `Report #N`
 *
 * The previous standalone visit-date pill and report-type eyebrow
 * have been folded into the subtitle so the title always anchors the
 * header (no more empty whitespace when `meta.title` is blank).
 */
import { Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react-native';

import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { Button } from '@/components/primitives/Button';
import { colors } from '@/lib/design-tokens/colors';
import { formatDate } from '@/lib/util/date';
import type { GeneratedSiteReport } from '@harpa/report-core';

interface ReportDetailHeaderProps {
  report: GeneratedSiteReport;
  onBack: () => void;
  onOpenActions: () => void;
  actionsDisabled: boolean;
  actions?: ReactNode;
  /** Per-project report number — drives the `#N` subtitle + testID. */
  reportNumber?: number | null;
}

export function ReportDetailHeader({
  report,
  onBack,
  onOpenActions,
  actionsDisabled,
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

  const visitDate = report.report.meta.visitDate;
  const subtitleParts: string[] = [];
  if (reportNumber !== null && reportNumber !== undefined) {
    subtitleParts.push(`#${reportNumber}`);
  }
  if (visitDate) {
    subtitleParts.push(formatDate(visitDate));
  }
  const subtitle =
    subtitleParts.length > 0 ? subtitleParts.join(' · ') : undefined;

  return (
    <View className="px-5 py-4">
      <ScreenHeader
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        backLabel="Reports"
        actions={actions}
        titleTestID={`report-title-${numStr}`}
      />

      <View className="mt-3 flex-row items-center justify-end">
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
