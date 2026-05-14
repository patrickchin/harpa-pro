/**
 * ProjectMembersSkeleton — loading state for the Members screen.
 */
import { View } from 'react-native';
import { Skeleton, SkeletonRow } from '@/components/primitives/Skeleton';

function MemberRowSkeleton() {
  return (
    <View className="rounded-lg border border-border bg-card p-3 flex-row items-center gap-3">
      <Skeleton width={40} height={40} circle />
      <View className="flex-1 gap-2">
        <Skeleton width="55%" height={14} />
        <Skeleton width="35%" height={12} />
      </View>
      <Skeleton width={48} height={20} radius={6} />
    </View>
  );
}

export function ProjectMembersSkeleton() {
  return (
    <View className="px-5 pt-2 gap-3">
      <MemberRowSkeleton />
      <MemberRowSkeleton />
      <MemberRowSkeleton />
    </View>
  );
}
