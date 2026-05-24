/**
 * ProjectMembersSkeleton — loading state for the Members screen.
 *
 * Layout-shift policy (see docs/v4/arch-mobile-skeletons.md): the
 * outer wrapper mirrors the loaded ScrollView's contentContainerStyle
 * (px-5, pt-2, pb-4, gap-3) and each placeholder reserves the same
 * vertical space as the corresponding real element so the
 * `project-members:*` landmark probes land on the same Y in both
 * frames.
 *
 * The order mirrors the loaded screen exactly:
 *   me row → (optional) add-member affordance → filter chip row →
 *   3 teammate rows
 */
import { View } from 'react-native';
import { Skeleton, SkeletonRow } from '@/components/primitives/Skeleton';
import { useLayoutShiftProbe } from '@/lib/layout-shift-probe';
import { PROJECT_MEMBERS_LAYOUT } from '@/lib/project-members-layout';

function MemberRowSkeleton({ probeId }: { probeId?: string }) {
  const onLayout = useLayoutShiftProbe(probeId ?? 'project-members:row');
  return (
    <View
      onLayout={probeId ? onLayout : undefined}
      // Mirrors `<Card padding="md" className="flex-row items-center gap-3">`
      // from MemberItem so row height matches exactly.
      className="rounded-lg border border-border bg-card p-4 flex-row items-center gap-3"
      style={{ minHeight: PROJECT_MEMBERS_LAYOUT.memberRowHeight }}
    >
      <Skeleton width={40} height={40} circle />
      <View className="min-w-0 flex-1 gap-0.5">
        <SkeletonRow className="gap-2">
          <Skeleton width="55%" height={20} />
          <Skeleton width={56} height={18} radius={6} />
        </SkeletonRow>
        <Skeleton width="40%" height={20} />
      </View>
    </View>
  );
}

function AddMemberAffordanceSkeleton() {
  return (
    <View
      // Mirrors the dashed "Add member" Pressable on the loaded screen.
      className="flex-row items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted p-3"
      style={{ opacity: 0.6 }}
    >
      <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
        <Skeleton width={20} height={20} radius={4} />
      </View>
      <View className="flex-1 gap-1">
        <Skeleton width="40%" height={18} />
        <Skeleton width="70%" height={14} />
      </View>
    </View>
  );
}

function FilterChipsSkeleton() {
  return (
    <View className="flex-row gap-2">
      {[28, 56, 56, 56].map((w, i) => (
        <View
          key={i}
          className="rounded-lg border border-border bg-card px-4 py-2"
        >
          <Skeleton width={w} height={16} />
        </View>
      ))}
    </View>
  );
}

export function ProjectMembersSkeleton({
  canManage = true,
}: {
  canManage?: boolean;
}) {
  return (
    <View
      testID="project-members-skeleton"
      style={{
        paddingHorizontal: PROJECT_MEMBERS_LAYOUT.paddingHorizontal,
        paddingTop: PROJECT_MEMBERS_LAYOUT.paddingTop,
        paddingBottom: PROJECT_MEMBERS_LAYOUT.paddingBottom,
        gap: PROJECT_MEMBERS_LAYOUT.gap,
      }}
    >
      <MemberRowSkeleton probeId="project-members:first-row" />
      {canManage ? <AddMemberAffordanceSkeleton /> : null}
      <FilterChipsSkeleton />
      <MemberRowSkeleton />
      <MemberRowSkeleton />
      <MemberRowSkeleton />
    </View>
  );
}
