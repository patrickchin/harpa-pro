/**
 * GenerateNotes screen body — props-only, no data fetching.
 *
 * Ported (subset) from
 * `../haru3-reports/apps/mobile/app/projects/[projectId]/reports/generate.tsx`
 * on branch `dev`. v4 uses `projectSlug` + per-project `number` route
 * params instead of `projectId` / `reportId`. P3.6 ships the Notes
 * pane; P3.7 ports the Report tab (read-only `ReportView` + completeness
 * skeleton + generating/error states); Edit lands in P3.8.
 *
 * Header / tab bar / pager / dialogs all read from
 * `GenerateReportProvider` via context. Routes inject data (notes,
 * loading, generated report, callbacks) through provider props; dev
 * mirrors + tests do the same with canned values.
 */
import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { MoreVertical } from 'lucide-react-native';

import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { colors } from '@/lib/design-tokens/colors';
import { getDeleteDraftDialogCopy } from '@/lib/app-dialog-copy';
import { DebugTabPane } from '@/components/reports/generate/DebugTabPane';
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
   * Default = true; routes wire `useProjectQuery().myRole`.
   */
  canWrite?: boolean;
  onBack?: () => void;
  /**
   * Called when the user confirms deleting the draft report. When set
   * and `canWrite` is true, the header shows a "more options" button
   * that opens a confirm sheet. Routes wire this to
   * `useDeleteReportMutation` and route back to the reports list.
   */
  onDeleteDraft?: () => void;
  /** True while the delete mutation is in flight (disables the button). */
  isDeletingDraft?: boolean;
  /** Profile button slot — rendered in the screen header. */
  actions?: ReactNode;
};

export function GenerateNotes({
  canWrite = true,
  onBack,
  onDeleteDraft,
  isDeletingDraft = false,
  actions,
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
          <GenerateNotesLayout
            canWrite={canWrite}
            onBack={onBack}
            onDeleteDraft={onDeleteDraft}
            isDeletingDraft={isDeletingDraft}
            actions={actions}
          />
        </GenerateReportProvider>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface LayoutProps {
  canWrite: boolean;
  onBack?: () => void;
  onDeleteDraft?: () => void;
  isDeletingDraft: boolean;
  actions?: ReactNode;
}

/**
 * Inner body — split out so it can call `useGenerateReport()` from
 * inside the provider. Pure layout: header, action row, tab bar,
 * horizontal pager of panes, bottom input bar, dialog stack.
 */
function GenerateNotesLayout({
  canWrite,
  onBack,
  onDeleteDraft,
  isDeletingDraft,
  actions,
}: LayoutProps) {
  const { reportTitle, tabs } = useGenerateReport();
  const { width: windowWidth } = useWindowDimensions();
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const deleteDraftCopy = getDeleteDraftDialogCopy();

  const showDeleteOption = canWrite && Boolean(onDeleteDraft);

  // Pager is purely visual for now — tab switching uses the tab bar.
  // Horizontal drag-to-switch lands with the full provider hook port
  // (Pitfall 3 — translation, not rewrite).
  const activeIndex =
    tabs.active === 'notes'
      ? 0
      : tabs.active === 'report'
        ? 1
        : tabs.active === 'edit'
          ? 2
          : 3;

  return (
    <>
      <View className="px-5 pt-4 pb-2">
        <ScreenHeader
          title={reportTitle}
          onBack={onBack}
          backLabel="Reports"
          actions={actions}
          trailing={
            showDeleteOption ? (
              <Pressable
                testID="btn-draft-options"
                accessibilityRole="button"
                accessibilityLabel="Draft options"
                onPress={() => setIsDeleteConfirmVisible(true)}
                disabled={isDeletingDraft}
                className="min-h-touch min-w-touch items-center justify-center px-2"
              >
                <MoreVertical size={20} color={colors.foreground} />
              </Pressable>
            ) : null
          }
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
        <DebugTabPane width={windowWidth} />
      </ScrollView>

      {canWrite ? <GenerateReportInputBar /> : null}

      <GenerateReportDialogs />

      <AppDialogSheet
        visible={isDeleteConfirmVisible}
        title={deleteDraftCopy.title}
        message={deleteDraftCopy.message}
        noticeTone={deleteDraftCopy.tone}
        noticeTitle={deleteDraftCopy.noticeTitle}
        canDismiss={!isDeletingDraft}
        onClose={() => {
          if (!isDeletingDraft) setIsDeleteConfirmVisible(false);
        }}
        actions={[
          {
            label: isDeletingDraft ? 'Deleting...' : deleteDraftCopy.confirmLabel,
            variant: deleteDraftCopy.confirmVariant,
            onPress: () => {
              if (isDeletingDraft) return;
              onDeleteDraft?.();
            },
            disabled: isDeletingDraft,
            accessibilityLabel: 'Confirm delete draft',
            testID: 'dialog-action-confirm-delete-draft',
            align: 'start',
          },
          {
            label: deleteDraftCopy.cancelLabel ?? 'Cancel',
            variant: 'quiet',
            onPress: () => setIsDeleteConfirmVisible(false),
            disabled: isDeletingDraft,
            accessibilityLabel: 'Cancel delete draft',
          },
        ]}
      />
    </>
  );
}

export default GenerateNotes;
