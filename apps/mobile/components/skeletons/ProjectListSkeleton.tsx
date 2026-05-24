/**
 * ProjectListSkeleton — loading state for the projects list screen.
 *
 * Layout-shift policy (see docs/v4/arch-mobile-skeletons.md): this
 * skeleton mirrors the FlatList contentContainerStyle used by
 * `projects-list.tsx` so the first row lands on the same Y when
 * content arrives. The "Add new project" Pressable is rendered by
 * the screen in both states and is not duplicated here.
 */
import { View } from 'react-native';
import { Skeleton, SkeletonRow } from '@/components/primitives/Skeleton';
import { useLayoutShiftProbe } from '@/lib/layout-shift-probe';

/** Matches the Card layout in the projects FlatList. */
function ProjectCardSkeleton({ probeId }: { probeId?: string }) {
  const onLayout = useLayoutShiftProbe(probeId ?? 'projects-list:row');
  return (
    <View
      className="rounded-lg border border-border bg-card p-4 gap-3"
      onLayout={probeId ? onLayout : undefined}
    >
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

/**
 * Full-screen skeleton shown while the project list query hydrates.
 *
 * Outer container replicates the FlatList contentContainerStyle
 * (paddingHorizontal:20, paddingTop:16, paddingBottom:16, gap:12)
 * exactly so the first card lands on the same Y in both states.
 */
export function ProjectListSkeleton() {
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 16,
        gap: 12,
      }}
      testID="projects-list-skeleton"
    >
      <ProjectCardSkeleton probeId="projects-list:first-row" />
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
    </View>
  );
}
