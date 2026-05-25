/**
 * ReportsListSkeleton — loading state for the project reports screen.
 *
 * Layout-shift policy (see docs/v4/arch-mobile-skeletons.md): this
 * skeleton mirrors the SectionList wrapper used by `reports-list.tsx`
 * so the first row lands on the same Y when content arrives. The
 * "New report" Pressable is rendered by the screen in both states and
 * is not duplicated here.
 */
import { View } from 'react-native';
import { Skeleton, SkeletonRow } from '@/components/primitives/Skeleton';
import { useLayoutShiftProbe } from '@/lib/util/layout-shift-probe';

/**
 * Row wrapper height + card structure must match the real list:
 *   <View className="px-5 pt-3"><Card padding="sm" ...>
 * The Card uses `p-3` (12) + `border` (1) + 40px icon → row height
 * stays driven by the 40px icon plus padding.
 */
function ReportRowSkeleton({ probeId }: { probeId?: string }) {
  const onLayout = useLayoutShiftProbe(probeId ?? 'reports-list:row');
  return (
    <View className="px-5 pt-3" onLayout={probeId ? onLayout : undefined}>
      <View className="rounded-lg border border-border bg-card p-3 flex-row items-center gap-3">
        <Skeleton width={40} height={40} radius={8} />
        <View className="flex-1 gap-2">
          <SkeletonRow>
            <Skeleton width="65%" height={18} />
            <Skeleton width={42} height={18} radius={6} />
          </SkeletonRow>
          <Skeleton width="40%" height={14} />
        </View>
      </View>
    </View>
  );
}

function SectionHeaderSkeleton() {
  return (
    <View className="px-5 pt-4">
      <Skeleton width={72} height={12} />
    </View>
  );
}

export function ReportsListSkeleton() {
  // `paddingTop: 8` matches SectionList contentContainerStyle so the
  // first section header lands on the same Y in both states.
  return (
    <View style={{ paddingTop: 8 }} testID="reports-list-skeleton">
      <SectionHeaderSkeleton />
      <ReportRowSkeleton probeId="reports-list:first-row" />
      <ReportRowSkeleton />
      <ReportRowSkeleton />
      <ReportRowSkeleton />
    </View>
  );
}
