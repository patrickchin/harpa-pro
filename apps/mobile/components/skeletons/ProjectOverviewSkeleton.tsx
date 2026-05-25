/**
 * ProjectOverviewSkeleton — loading state for the project home screen.
 *
 * Layout-shift policy (see docs/v4/arch-mobile-skeletons.md): the
 * outer wrapper mirrors the loaded ScrollView's contentContainerStyle
 * (`PROJECT_OVERVIEW_LAYOUT`) and each placeholder reserves the same
 * vertical space as the corresponding real card so the
 * `project-overview:*` landmark probes land on the same Y in both
 * frames.
 */
import { View } from 'react-native';
import { Skeleton } from '@/components/primitives/Skeleton';
import { useLayoutShiftProbe } from '@/lib/util/layout-shift-probe';
import { PROJECT_OVERVIEW_LAYOUT } from '@/lib/project-overview';

export function ProjectOverviewSkeleton() {
  const headerProbe = useLayoutShiftProbe('project-overview:header');
  const firstCardProbe = useLayoutShiftProbe('project-overview:first-card');
  const lastCardProbe = useLayoutShiftProbe('project-overview:last-card');

  return (
    <View
      testID="project-overview-skeleton"
      style={{
        paddingHorizontal: PROJECT_OVERVIEW_LAYOUT.paddingHorizontal,
        paddingTop: PROJECT_OVERVIEW_LAYOUT.paddingTop,
        paddingBottom: PROJECT_OVERVIEW_LAYOUT.paddingBottom,
        gap: PROJECT_OVERVIEW_LAYOUT.gap,
      }}
    >
      <View
        onLayout={headerProbe}
        style={{ height: PROJECT_OVERVIEW_LAYOUT.headerRowHeight }}
        className="flex-row items-center justify-between gap-3"
      >
        <View className="min-w-0 flex-1 gap-1">
          <Skeleton width="60%" height={18} />
          <Skeleton width="80%" height={16} />
        </View>
        <Skeleton width={64} height={32} radius={8} />
      </View>

      <View onLayout={firstCardProbe} className="flex-row gap-3">
        <Skeleton
          width="48%"
          height={PROJECT_OVERVIEW_LAYOUT.statTileHeight}
          radius={8}
        />
        <Skeleton
          width="48%"
          height={PROJECT_OVERVIEW_LAYOUT.statTileHeight}
          radius={8}
        />
      </View>

      <Skeleton
        width="100%"
        height={PROJECT_OVERVIEW_LAYOUT.lastReportCardHeight}
        radius={8}
      />

      <View className="gap-3">
        <Skeleton
          width="100%"
          height={PROJECT_OVERVIEW_LAYOUT.actionCardHeight}
          radius={8}
        />
        <Skeleton
          width="100%"
          height={PROJECT_OVERVIEW_LAYOUT.actionCardHeight}
          radius={8}
        />
        <Skeleton
          width="100%"
          height={PROJECT_OVERVIEW_LAYOUT.actionCardHeight}
          radius={8}
        />
        <View onLayout={lastCardProbe}>
          <Skeleton
            width="100%"
            height={PROJECT_OVERVIEW_LAYOUT.actionCardHeight}
            radius={8}
          />
        </View>
      </View>
    </View>
  );
}
