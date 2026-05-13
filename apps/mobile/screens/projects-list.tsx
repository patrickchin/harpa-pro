/**
 * ProjectsList screen body — props-only, no data fetching.
 *
 * Ported from
 * `../haru3-reports/apps/mobile/app/(tabs)/projects.tsx` on branch
 * `dev`. JSX + Tailwind classes copied verbatim; data layer
 * (useLocalProjects) replaced with props + generated hooks wiring in
 * the real route.
 */
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { Plus, MapPin, Clock, HardHat } from 'lucide-react-native';
import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { EmptyState } from '@/components/primitives/EmptyState';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { ProjectListSkeleton } from '@/components/skeletons/ProjectListSkeleton';
import { formatDate } from '@/lib/date';
import { colors } from '@/lib/design-tokens/colors';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export type ProjectRow = {
  id: string;
  name: string;
  role: string; // 'owner' | 'admin' | 'editor' | 'viewer'
  address: string | null;
  updatedAt: string; // ISO-8601
};

export type ProjectsListProps = {
  projects: ReadonlyArray<ProjectRow>;
  isLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onPressProject: (id: string) => void;
  onPressNewProject: () => void;
};

export function ProjectsList({
  projects,
  isLoading,
  refreshing,
  onRefresh,
  onPressProject,
  onPressNewProject,
}: ProjectsListProps) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 py-4">
        <ScreenHeader title="Projects" />
      </View>

      {isLoading ? (
        <ProjectListSkeleton />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 16,
            gap: 12,
          }}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            projects.length === 0 ? null : (
              <View style={{ marginBottom: 12 }}>
                <Pressable
                  testID="btn-new-project"
                  onPress={onPressNewProject}
                  accessibilityRole="button"
                  accessibilityLabel="Add new project"
                >
                  <View className="flex-row items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted p-4">
                    <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                      <Plus size={20} color={colors.foreground} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-title-sm text-foreground">
                        Add new project
                      </Text>
                      <Text className="text-sm text-muted-foreground">
                        Create a destination for field notes and reports.
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </View>
            )
          }
          ListEmptyComponent={
            <EmptyState
              icon={<HardHat size={28} color={colors.muted.foreground} />}
              title="No projects yet"
              description="Create your first project so field notes and daily reports have a clear destination."
              action={
                <Button
                  testID="btn-new-project"
                  variant="hero"
                  size="lg"
                  onPress={onPressNewProject}
                  accessibilityLabel="Add new project"
                >
                  Add your first project
                </Button>
              }
            />
          }
          renderItem={({ item, index }) => (
            <View>
              <Pressable
                testID={`project-row-${index}`}
                onPress={() => onPressProject(item.id)}
              >
                <Card variant="emphasis" className="gap-3">
                  <View className="flex-row items-center justify-between">
                    <Text
                      className="min-w-0 flex-1 text-title-sm text-foreground"
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <Text className="ml-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {ROLE_LABELS[item.role] ?? item.role}
                    </Text>
                  </View>
                  {item.address && (
                    <View className="flex-row items-center gap-1.5">
                      <MapPin size={14} color={colors.muted.foreground} />
                      <Text className="text-body text-muted-foreground">
                        {item.address}
                      </Text>
                    </View>
                  )}
                  <View className="flex-row items-center gap-1.5">
                    <Clock size={12} color={colors.muted.foreground} />
                    <Text className="text-sm text-muted-foreground">
                      Updated: {formatDate(item.updatedAt)}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
