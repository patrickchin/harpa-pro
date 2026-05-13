/**
 * ProjectListSkeleton — loading state for the projects list screen.
 *
 * Ported from
 * `../haru3-reports/apps/mobile/components/skeletons/ProjectListSkeleton.tsx`
 * on branch `dev`.
 */
import { View } from 'react-native';
import { Skeleton, SkeletonRow } from '@/components/primitives/Skeleton';

/** Matches the Card layout in the projects FlatList. */
function ProjectCardSkeleton() {
  return (
    <View className="rounded-lg border border-border bg-surface-emphasis p-4 gap-3">
      <SkeletonRow>
        <Skeleton width="60%" height={18} />
        <Skeleton width={48} height={12} />
      </SkeletonRow>
      <SkeletonRow>
        <Skeleton width={14} height={14} circle />
        <Skeleton width="50%" height={14} />
      </SkeletonRow>
      <SkeletonRow>
        <Skeleton width={12} height={12} circle />
        <Skeleton width="35%" height={12} />
      </SkeletonRow>
    </View>
  );
}

/** Skeleton for the "Add new project" dashed card. */
function NewProjectCardSkeleton() {
  return (
    <View className="flex-row items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted p-4">
      <Skeleton width={40} height={40} radius={8} />
      <View className="flex-1 gap-2">
        <Skeleton width="45%" height={16} />
        <Skeleton width="70%" height={12} />
      </View>
    </View>
  );
}

/** Full-screen skeleton shown while the project list query hydrates. */
export function ProjectListSkeleton() {
  return (
    <View className="flex-1 px-5 pt-4 gap-3">
      <NewProjectCardSkeleton />
      <View style={{ height: 12 }} />
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
    </View>
  );
}
