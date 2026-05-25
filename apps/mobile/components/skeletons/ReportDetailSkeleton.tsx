/**
 * ReportDetailSkeleton — loading state for the saved-report detail
 * screen body (below the header chrome).
 *
 * Layout-shift policy (see docs/v4/arch-mobile-skeletons.md): this
 * skeleton mirrors the wrapper + card structure used by
 * `<ReportView />` so the first card lands on the same Y when the
 * loaded report arrives. The screen owns the outer header chrome
 * (back button + title + visit-date pill + Actions button area) in
 * both states — see `saved-report.tsx` — so it is not duplicated
 * here.
 *
 * Card padding / spacing reference (must stay in sync with
 * `components/reports/ReportView.tsx` + child cards):
 *   outer wrapper          → `<View className="gap-3">`
 *   StatBar tiles          → 3× compact (min-h-82) flex-1 cards
 *   WeatherStrip           → Card padding="md" (p-4) + gap-3
 *   Summary / Workers /
 *   Materials              → Card padding="lg" (p-5)
 *   SectionHeader icon box → 36×36 (h-9 w-9) with mt-0.5
 */
import { View, type DimensionValue } from 'react-native';
import { Skeleton, SkeletonRow } from '@/components/primitives/Skeleton';
import { useLayoutShiftProbe } from '@/lib/util/layout-shift-probe';

function StatTileSkeleton() {
  return (
    <View className="min-h-[82px] flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-3">
      <Skeleton width="50%" height={22} />
      <Skeleton width="70%" height={12} />
    </View>
  );
}

function SectionHeaderSkeleton({
  titleWidth,
  subtitleWidth,
}: {
  titleWidth: DimensionValue;
  subtitleWidth?: DimensionValue;
}) {
  return (
    <View className="flex-row items-start gap-3">
      <View className="mt-0.5 h-9 w-9 rounded-sm border border-border bg-card" />
      <View className="flex-1 gap-1">
        <Skeleton width={titleWidth} height={14} />
        {subtitleWidth ? <Skeleton width={subtitleWidth} height={12} /> : null}
      </View>
    </View>
  );
}

export function ReportDetailSkeleton() {
  const summaryProbe = useLayoutShiftProbe('report-detail:summary-card');
  const workersProbe = useLayoutShiftProbe('report-detail:workers-card');

  return (
    <View className="gap-3 px-5" testID="report-detail-skeleton">
      {/* StatBar — 3 compact tiles (matches `<StatBar />`). */}
      <View className="flex-row gap-3">
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
      </View>

      {/* WeatherStrip — Card padding="md" (p-4) with gap-3. */}
      <View className="gap-3 rounded-lg border border-border bg-card p-4">
        <SkeletonRow>
          <Skeleton width={14} height={14} circle />
          <Skeleton width="55%" height={14} />
        </SkeletonRow>
        <View className="flex-row flex-wrap items-center gap-2">
          <View className="flex-row items-center gap-1.5 rounded-md bg-surface-muted px-3 py-2">
            <Skeleton width={14} height={14} circle />
            <Skeleton width={60} height={14} />
          </View>
          <View className="flex-row items-center gap-1.5 rounded-md bg-surface-muted px-3 py-2">
            <Skeleton width={14} height={14} circle />
            <Skeleton width={60} height={14} />
          </View>
        </View>
      </View>

      {/* Summary — Card padding="lg" (p-5). */}
      <View
        className="rounded-lg border border-border bg-card p-5"
        onLayout={summaryProbe}
      >
        <SectionHeaderSkeleton titleWidth="30%" />
        <View className="mt-4 gap-2">
          <Skeleton width="100%" height={14} />
          <Skeleton width="92%" height={14} />
          <Skeleton width="60%" height={14} />
        </View>
      </View>

      {/* Workers — Card padding="lg" (p-5). Rows mirror the per-role
          bar tile (gap-1.5 + bg-surface-muted px-3 py-3). */}
      <View
        className="rounded-lg border border-border bg-card p-5"
        onLayout={workersProbe}
      >
        <SectionHeaderSkeleton titleWidth="25%" subtitleWidth="45%" />
        <View className="mt-4 gap-3">
          <View className="gap-1.5 rounded-md bg-surface-muted px-3 py-3">
            <View className="flex-row items-center justify-between">
              <Skeleton width="50%" height={16} />
              <Skeleton width={20} height={16} />
            </View>
            <Skeleton width="100%" height={8} radius={4} />
          </View>
          <View className="gap-1.5 rounded-md bg-surface-muted px-3 py-3">
            <View className="flex-row items-center justify-between">
              <Skeleton width="45%" height={16} />
              <Skeleton width={20} height={16} />
            </View>
            <Skeleton width="80%" height={8} radius={4} />
          </View>
        </View>
      </View>

      {/* Materials — Card padding="lg" (p-5). */}
      <View className="rounded-lg border border-border bg-card p-5">
        <SectionHeaderSkeleton titleWidth="30%" subtitleWidth="55%" />
        <View className="mt-4 gap-3">
          <View className="gap-1 rounded-md bg-surface-muted px-3 py-3">
            <Skeleton width="80%" height={16} />
            <Skeleton width="40%" height={12} />
          </View>
          <View className="gap-1 rounded-md bg-surface-muted px-3 py-3">
            <Skeleton width="70%" height={16} />
            <Skeleton width="35%" height={12} />
          </View>
        </View>
      </View>
    </View>
  );
}
