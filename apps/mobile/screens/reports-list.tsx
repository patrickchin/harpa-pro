/**
 * ReportsList screen body — props-only, no data fetching.
 *
 * Ported from `../haru3-reports/apps/mobile/app/projects/[projectId]/reports/index.tsx`
 * on branch `dev`. v4 contract differences: reports have a per-project
 * `number` + `slug`, status enum is `draft|finalized` (not `final`),
 * and the list response is `{ items: Report[] }`.
 *
 * Optimistic-create flow lives in the route wrapper.
 */
import {
  View,
  Text,
  SectionList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Plus, FileText, ClipboardList } from 'lucide-react-native';
import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Card } from '@/components/primitives/Card';
import { EmptyState } from '@/components/primitives/EmptyState';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { ReportsListSkeleton } from '@/components/skeletons/ReportsListSkeleton';
import { colors } from '@/lib/design-tokens/colors';
import {
  buildReportsSections,
  getReportMeta,
  getReportTitle,
  type ReportListItem,
} from '@/lib/project-reports-list';

export type ReportsListProps = {
  reports: ReadonlyArray<ReportListItem>;
  projectName: string | null;
  canCreate: boolean;
  isLoading: boolean;
  refreshing: boolean;
  isCreating: boolean;
  onRefresh: () => void;
  onBack: () => void;
  onCreate: () => void;
  onOpenReport: (report: ReportListItem) => void;
};

export function ReportsList({
  reports,
  projectName,
  canCreate,
  isLoading,
  refreshing,
  isCreating,
  onRefresh,
  onBack,
  onCreate,
  onOpenReport,
}: ReportsListProps) {
  const sections = buildReportsSections(reports);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-4 pb-2">
        <ScreenHeader
          title="Reports"
          subtitle={projectName ?? undefined}
          onBack={onBack}
          backLabel="Overview"
        />
      </View>

      {canCreate && !isLoading ? (
        <View className="px-5 pt-3">
          <Pressable
            testID="btn-new-report"
            onPress={() => {
              if (!isCreating) onCreate();
            }}
            disabled={isCreating}
            accessibilityRole="button"
            accessibilityLabel="Create new report"
          >
            <View
              className="flex-row items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted p-3"
              style={{ opacity: isCreating ? 0.6 : 1 }}
            >
              <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                {isCreating ? (
                  <ActivityIndicator size={16} color={colors.foreground} />
                ) : (
                  <Plus size={20} color={colors.foreground} />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-foreground">
                  New report
                </Text>
                <Text className="text-sm text-muted-foreground">
                  Start a draft for this project.
                </Text>
              </View>
            </View>
          </Pressable>
        </View>
      ) : null}

      {isLoading ? (
        <ReportsListSkeleton />
      ) : reports.length === 0 ? (
        <View className="px-5 pt-4">
          <EmptyState
            icon={<ClipboardList size={28} color={colors.muted.foreground} />}
            title="No reports yet"
            description="Start the first report for this project and the drafts/final reports will appear here."
          />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 16, paddingTop: 8 }}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderSectionHeader={({ section }) =>
            section.title ? (
              <View className="px-5 pt-4">
                <Text className="text-label uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <View className="px-5 pt-3">
              <Pressable
                testID={`report-row-${item.status}-${index}`}
                onPress={() => onOpenReport(item)}
                accessibilityRole="button"
              >
                <Card
                  variant={item.status === 'draft' ? 'emphasis' : 'default'}
                  padding="sm"
                  className="flex-row items-center gap-3"
                >
                  <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                    <FileText size={20} color={colors.muted.foreground} />
                  </View>
                  <View className="min-w-0 flex-1 gap-1">
                    <View className="min-w-0 flex-row items-start gap-2">
                      <Text
                        className="flex-1 text-lg font-semibold text-foreground"
                        numberOfLines={2}
                      >
                        {getReportTitle(item)}
                      </Text>
                      {item.status === 'draft' ? (
                        <View className="mt-0.5 shrink-0 rounded-md border border-warning-border bg-warning-soft px-2 py-1">
                          <Text className="text-xs font-semibold uppercase text-warning-text">
                            Draft
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="text-sm text-muted-foreground">
                      {getReportMeta(item)}
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

export default ReportsList;
