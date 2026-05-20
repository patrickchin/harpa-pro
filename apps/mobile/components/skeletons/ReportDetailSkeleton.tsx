/**
 * ReportDetailSkeleton — loading state for the saved-report detail
 * screen header + body. Ported verbatim from
 * `../haru3-reports/apps/mobile/components/skeletons/ReportDetailSkeleton.tsx`
 * on branch `dev`.
 */
import { View } from 'react-native';
import { Skeleton, SkeletonRow } from '@/components/primitives/Skeleton';

export function ReportDetailSkeleton() {
  return (
    <View className="flex-1 px-5 pt-4 gap-5" testID="report-detail-skeleton">
      {/* Title area */}
      <View className="gap-2">
        <Skeleton width="75%" height={22} />
        <Skeleton width="45%" height={14} />
      </View>

      {/* Weather strip */}
      <SkeletonRow>
        <Skeleton width={20} height={20} circle />
        <Skeleton width="40%" height={14} />
      </SkeletonRow>

      {/* Summary section card */}
      <View className="rounded-lg border border-border bg-card p-4 gap-3">
        <Skeleton width="30%" height={16} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="90%" height={14} />
        <Skeleton width="60%" height={14} />
      </View>

      {/* Workers card */}
      <View className="rounded-lg border border-border bg-card p-4 gap-3">
        <Skeleton width="25%" height={16} />
        <SkeletonRow>
          <Skeleton width={14} height={14} circle />
          <Skeleton width="50%" height={14} />
        </SkeletonRow>
        <SkeletonRow>
          <Skeleton width={14} height={14} circle />
          <Skeleton width="45%" height={14} />
        </SkeletonRow>
      </View>

      {/* Materials card */}
      <View className="rounded-lg border border-border bg-card p-4 gap-3">
        <Skeleton width="30%" height={16} />
        <Skeleton width="80%" height={14} />
        <Skeleton width="70%" height={14} />
      </View>
    </View>
  );
}
