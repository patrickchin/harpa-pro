/**
 * ReportsListSkeleton — loading state for the project reports screen.
 */
import { View } from 'react-native';
import { Skeleton, SkeletonRow } from '@/components/primitives/Skeleton';

function ReportRowSkeleton() {
  return (
    <View className="mx-5 mt-3 rounded-lg border border-border bg-card p-3 flex-row items-center gap-3">
      <Skeleton width={40} height={40} radius={8} />
      <View className="flex-1 gap-2">
        <SkeletonRow>
          <Skeleton width="65%" height={16} />
          <Skeleton width={42} height={18} radius={6} />
        </SkeletonRow>
        <Skeleton width="40%" height={12} />
      </View>
    </View>
  );
}

export function ReportsListSkeleton() {
  return (
    <View>
      <ReportRowSkeleton />
      <ReportRowSkeleton />
      <ReportRowSkeleton />
      <ReportRowSkeleton />
    </View>
  );
}
