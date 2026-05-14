/**
 * ProjectHome screen body — props-only, no data fetching.
 *
 * Ported from `../haru3-reports/apps/mobile/app/projects/[projectId]/index.tsx`
 * on branch `dev`. JSX + Tailwind classes copied; v4 uses `clientName`
 * (camelCase) and `myRole` from the project response. Stats are now
 * server-computed (`Project.stats`), so the body component takes them
 * directly as props rather than re-aggregating client-side.
 */
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import {
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  FolderOpen,
  HardHat,
  MapPin,
  Pencil,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { StatTile } from '@/components/primitives/StatTile';
import { ProjectOverviewSkeleton } from '@/components/skeletons/ProjectOverviewSkeleton';
import { colors } from '@/lib/design-tokens/colors';
import { formatRelativeTime } from '@/lib/project-overview';

export type ProjectHomeProjectInfo = {
  name: string;
  clientName: string | null;
  address: string | null;
  myRole: 'owner' | 'editor' | 'viewer';
  stats: {
    totalReports: number;
    drafts: number;
    lastReportAt: string | null;
  };
};

export type ProjectHomeProps = {
  project: ProjectHomeProjectInfo | null;
  isLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  onPressEdit: () => void;
  onPressReports: () => void;
  onPressMembers: () => void;
  copiedKey: string | null;
  onCopy: (value: string, key: string) => void;
};

type OverviewAction = {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  onPress?: () => void;
  comingSoon?: boolean;
  testID?: string;
};

export function ProjectHome({
  project,
  isLoading,
  refreshing,
  onRefresh,
  onBack,
  onPressEdit,
  onPressReports,
  onPressMembers,
  copiedKey,
  onCopy,
}: ProjectHomeProps) {
  const siteName = project?.name?.trim() || 'Project';
  const stats = project?.stats ?? { totalReports: 0, drafts: 0, lastReportAt: null };
  const lastReportRelative = formatRelativeTime(stats.lastReportAt);
  const canEdit = project?.myRole === 'owner' || project?.myRole === 'editor';

  const actions: OverviewAction[] = [
    {
      key: 'reports',
      title: 'Reports',
      description:
        stats.totalReports === 0
          ? 'No reports yet'
          : `${stats.totalReports} report${stats.totalReports === 1 ? '' : 's'} · Last ${lastReportRelative.toLowerCase()}`,
      icon: ClipboardList,
      onPress: onPressReports,
      testID: 'btn-open-reports',
    },
    {
      key: 'documents',
      title: 'Documents',
      description: 'Drawings, permits, contracts',
      icon: FolderOpen,
      comingSoon: true,
    },
    {
      key: 'materials-equipment',
      title: 'Materials & Equipment',
      description: 'Track materials, tools, and machinery',
      icon: HardHat,
      comingSoon: true,
    },
    {
      key: 'members',
      title: 'Members',
      description: 'Invite teammates to this project',
      icon: Users,
      onPress: onPressMembers,
      testID: 'btn-open-members',
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-4 pb-3">
        <ScreenHeader
          title={siteName}
          onBack={onBack}
          backLabel="Projects"
        />
      </View>

      {isLoading ? (
        <ProjectOverviewSkeleton />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 24,
            gap: 16,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View className="flex-row items-center justify-between gap-3">
            {project?.clientName || project?.address ? (
              <View className="min-w-0 flex-1 gap-1">
                {project.clientName ? (
                  <Pressable
                    onPress={() => onCopy(project.clientName!, 'client')}
                    accessibilityRole="button"
                    accessibilityLabel={`Copy client: ${project.clientName}`}
                    testID="btn-copy-client"
                    className="flex-row items-center gap-2 active:opacity-60"
                    hitSlop={8}
                  >
                    <Text className="flex-1 text-body font-medium text-foreground">
                      {project.clientName}
                    </Text>
                    {copiedKey === 'client' ? (
                      <Check size={14} color={colors.muted.foreground} />
                    ) : (
                      <Copy size={14} color={colors.muted.foreground} />
                    )}
                  </Pressable>
                ) : null}
                {project.address ? (
                  <Pressable
                    onPress={() => onCopy(project.address!, 'address')}
                    accessibilityRole="button"
                    accessibilityLabel={`Copy address: ${project.address}`}
                    testID="btn-copy-address"
                    className="flex-row items-center gap-2 active:opacity-60"
                    hitSlop={8}
                  >
                    <MapPin size={14} color={colors.muted.foreground} />
                    <Text className="flex-1 text-body text-muted-foreground">
                      {project.address}
                    </Text>
                    {copiedKey === 'address' ? (
                      <Check size={14} color={colors.muted.foreground} />
                    ) : (
                      <Copy size={14} color={colors.muted.foreground} />
                    )}
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View className="flex-1" />
            )}
            {canEdit ? (
              <Button
                variant="outline"
                size="sm"
                onPress={onPressEdit}
                className="shrink-0 flex-row items-center gap-1.5"
                accessibilityLabel="Edit project details"
                testID="btn-edit-project"
              >
                <Pencil size={14} color={colors.foreground} />
                <Text className="text-sm font-semibold text-foreground">
                  Edit
                </Text>
              </Button>
            ) : null}
          </View>

          <View className="flex-row gap-3">
            <StatTile value={stats.totalReports} label="Total reports" />
            <StatTile
              value={stats.drafts}
              label="Drafts"
              tone={stats.drafts > 0 ? 'warning' : 'default'}
            />
          </View>

          <Card variant="muted" padding="md" className="gap-1">
            <Text className="text-label text-muted-foreground">
              Last report
            </Text>
            <Text className="text-title-sm text-foreground">
              {lastReportRelative}
            </Text>
          </Card>

          <View className="gap-3">
            {actions.map((action) => {
              const Icon = action.icon;
              const isDisabled = action.comingSoon || !action.onPress;
              return (
                <Pressable
                  key={action.key}
                  onPress={action.onPress}
                  disabled={isDisabled}
                  testID={action.testID}
                  accessibilityRole="button"
                  accessibilityLabel={action.title}
                  accessibilityState={{ disabled: isDisabled }}
                >
                  <Card
                    variant={action.comingSoon ? 'muted' : 'default'}
                    padding="md"
                    className="flex-row items-center gap-3"
                  >
                    <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                      <Icon size={20} color={colors.muted.foreground} />
                    </View>
                    <View className="min-w-0 flex-1 gap-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-lg font-semibold text-foreground">
                          {action.title}
                        </Text>
                        {action.comingSoon ? (
                          <View className="rounded-md border border-border bg-card px-2 py-0.5">
                            <Text className="text-xs font-semibold uppercase text-muted-foreground">
                              Soon
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text className="text-sm text-muted-foreground">
                        {action.description}
                      </Text>
                    </View>
                    {!isDisabled ? (
                      <ChevronRight size={18} color={colors.muted.foreground} />
                    ) : null}
                  </Card>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

export default ProjectHome;
