/**
 * ProjectOverviewSkeleton — loading state for the project home screen.
 */
import { View } from 'react-native';
import { Skeleton, SkeletonRow } from '@/components/primitives/Skeleton';

export function ProjectOverviewSkeleton() {
  return (
    <View className="px-5 pt-2 gap-4">
      <SkeletonRow>
        <Skeleton width="60%" height={16} />
        <Skeleton width={56} height={28} radius={8} />
      </SkeletonRow>
      <View className="flex-row gap-3">
        <Skeleton width="48%" height={64} radius={8} />
        <Skeleton width="48%" height={64} radius={8} />
      </View>
      <Skeleton width="100%" height={56} radius={8} />
      <Skeleton width="100%" height={72} radius={8} />
      <Skeleton width="100%" height={72} radius={8} />
      <Skeleton width="100%" height={72} radius={8} />
      <Skeleton width="100%" height={72} radius={8} />
    </View>
  );
}
