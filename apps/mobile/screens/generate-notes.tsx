/**
 * GenerateNotes screen body — props-only, no data fetching.
 *
 * Ported (subset) from
 * `../haru3-reports/apps/mobile/app/projects/[projectId]/reports/generate.tsx`
 * on branch `dev`. v4 uses `projectSlug` + per-project `number` route
 * params instead of `projectId` / `reportId`. P3.6 ships the Notes
 * pane as the only interactive surface; Report/Edit are mounted as
 * empty placeholders (filled in by P3.7/P3.8).
 *
 * Header / tab bar / pager / dialogs all read from
 * `GenerateReportProvider` via context. Routes inject data (notes,
 * loading, callbacks) through provider props; dev mirrors + tests do
 * the same with canned values.
 */
import {
  KeyboardAvoidingView,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { EditTabPane } from '@/components/reports/generate/EditTabPane';
import { GenerateReportActionRow } from '@/components/reports/generate/GenerateReportActionRow';
import { GenerateReportDialogs } from '@/components/reports/generate/GenerateReportDialogs';
import { GenerateReportInputBar } from '@/components/reports/generate/GenerateReportInputBar';
import {
  GenerateReportProvider,
  useGenerateReport,
  type GenerateReportProviderProps,
} from '@/components/reports/generate/GenerateReportProvider';
import { GenerateReportTabBar } from '@/components/reports/generate/GenerateReportTabBar';
import { NotesTabPane } from '@/components/reports/generate/NotesTabPane';
import { ReportTabPane } from '@/components/reports/generate/ReportTabPane';

export type GenerateNotesProps = Omit<GenerateReportProviderProps, 'children'> & {
  /**
   * Whether the current user has write access. When false the action
   * row + input bar are hidden (matches canonical `projectCan.writeReport`).
   * P3.6 default = true; P3.7 routes will wire useProjectRole.
   */
  canWrite?: boolean;
  onBack?: () => void;
};

export function GenerateNotes({
  canWrite = true,
  onBack,
  ...providerProps
}: GenerateNotesProps) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <GenerateReportProvider {...providerProps}>
          <GenerateNotesLayout canWrite={canWrite} onBack={onBack} />
        </GenerateReportProvider>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface LayoutProps {
  canWrite: boolean;
  onBack?: () => void;
}

/**
 * Inner body — split out so it can call `useGenerateReport()` from
 * inside the provider. Pure layout: header, action row, tab bar,
 * horizontal pager of panes, bottom input bar, dialog stack.
 */
function GenerateNotesLayout({ canWrite, onBack }: LayoutProps) {
  const { reportTitle, tabs } = useGenerateReport();
  const { width: windowWidth } = useWindowDimensions();

  // Pager is purely visual in P3.6 — tab switching uses the tab bar.
  // Horizontal drag-to-switch lands in P3.7 along with the wider
  // pipeline state needed to keep tab transitions in sync.
  const activeIndex =
    tabs.active === 'notes' ? 0 : tabs.active === 'report' ? 1 : 2;

  return (
    <>
      <View className="px-5 pt-4 pb-2">
        <ScreenHeader
          title={reportTitle}
          onBack={onBack}
          backLabel="Reports"
        />
      </View>

      {canWrite ? <GenerateReportActionRow /> : null}

      <GenerateReportTabBar />

      <ScrollView
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentOffset={{ x: activeIndex * windowWidth, y: 0 }}
        className="flex-1"
        nestedScrollEnabled
        testID="generate-pager"
      >
        <NotesTabPane width={windowWidth} />
        <ReportTabPane width={windowWidth} />
        <EditTabPane width={windowWidth} />
      </ScrollView>

      {canWrite ? <GenerateReportInputBar /> : null}

      <GenerateReportDialogs />
    </>
  );
}

export default GenerateNotes;
