/**
 * GenerateReportDialogs — scaffold for the dialog stack consumed by the
 * Generate Report screen.
 *
 * Ported (subset) from
 * `../haru3-reports/apps/mobile/components/reports/generate/GenerateReportDialogs.tsx`
 * on branch `dev`. P3.6 ships the dialogs the Notes tab can surface:
 *  - delete-note confirm (mounts when `notes.deleteIndex !== null`)
 *  - attachment picker sheet (mounts when `ui.attachmentSheetVisible`)
 *  - file-upload error (mounts when `ui.fileUploadError !== null`)
 *  - finalize-report confirm (mounts when `draft.isFinalizeConfirmVisible`)
 *
 * The canonical source also wires `ImagePreviewModal` + the draft
 * delete-error dialog — those depend on `useImagePreviewProps` and
 * `useReportDraftPersistence`, which land in P3.7.
 */
import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import {
  getActionErrorDialogCopy,
  getDeleteNoteDialogCopy,
  getFinalizeReportDialogCopy,
} from '@/lib/app-dialog-copy';
import { useGenerateReport } from './GenerateReportProvider';

export function GenerateReportDialogs() {
  const { generation, draft, notes, ui, handlePickAttachment, photo } =
    useGenerateReport();

  const hasReport = generation.hasReport;
  const finalizeConfirmCopy = getFinalizeReportDialogCopy();
  const deleteNoteCopy = getDeleteNoteDialogCopy();

  const fileUploadErrorDialog = ui.fileUploadError
    ? getActionErrorDialogCopy({
        title: 'Upload Failed',
        fallbackMessage: 'Could not attach the file to this report.',
        message: ui.fileUploadError,
      })
    : null;

  const closeAttachmentSheet = () => ui.setAttachmentSheetVisible(false);
  const cancelFinalize = () => draft.setIsFinalizeConfirmVisible(false);

  return (
    <>
      <AppDialogSheet
        visible={draft.isFinalizeConfirmVisible}
        title={finalizeConfirmCopy.title}
        message={finalizeConfirmCopy.message}
        noticeTone={finalizeConfirmCopy.tone}
        noticeTitle={finalizeConfirmCopy.noticeTitle}
        canDismiss={!draft.isFinalizing}
        onClose={() => {
          if (!draft.isFinalizing) cancelFinalize();
        }}
        actions={[
          {
            label: draft.isFinalizing
              ? 'Finalizing...'
              : finalizeConfirmCopy.confirmLabel,
            variant: finalizeConfirmCopy.confirmVariant,
            // TODO(P3.7): wire useReportDraftPersistence().finalizeReport().
            onPress: cancelFinalize,
            disabled: draft.isFinalizing || !hasReport,
            accessibilityLabel: 'Confirm finalize report',
          },
          {
            label: finalizeConfirmCopy.cancelLabel ?? 'Cancel',
            variant: 'quiet',
            onPress: cancelFinalize,
            disabled: draft.isFinalizing,
            accessibilityLabel: 'Cancel finalize report',
          },
        ]}
      />

      <AppDialogSheet
        visible={notes.deleteIndex !== null}
        title={deleteNoteCopy.title}
        message={deleteNoteCopy.message}
        noticeTone={deleteNoteCopy.tone}
        noticeTitle={deleteNoteCopy.noticeTitle}
        onClose={() => notes.setDeleteIndex(null)}
        actions={[
          {
            label: deleteNoteCopy.confirmLabel,
            variant: deleteNoteCopy.confirmVariant,
            onPress: notes.confirmDelete,
            accessibilityLabel: 'Confirm delete note',
            align: 'start',
          },
          {
            label: deleteNoteCopy.cancelLabel ?? 'Cancel',
            variant: 'quiet',
            onPress: () => notes.setDeleteIndex(null),
            accessibilityLabel: 'Cancel deleting note',
          },
        ]}
      />

      <AppDialogSheet
        visible={fileUploadErrorDialog !== null}
        title={fileUploadErrorDialog?.title ?? 'Upload Failed'}
        message={fileUploadErrorDialog?.message ?? ''}
        noticeTone={fileUploadErrorDialog?.tone ?? 'danger'}
        noticeTitle={fileUploadErrorDialog?.noticeTitle}
        onClose={() => ui.setFileUploadError(null)}
        actions={
          fileUploadErrorDialog
            ? [
                {
                  label: fileUploadErrorDialog.confirmLabel,
                  variant: fileUploadErrorDialog.confirmVariant,
                  onPress: () => ui.setFileUploadError(null),
                  accessibilityLabel: 'Dismiss file upload error',
                  testID: 'btn-dismiss-file-upload-error',
                },
              ]
            : []
        }
      />

      <AppDialogSheet
        visible={ui.attachmentSheetVisible}
        title="Add attachment"
        onClose={closeAttachmentSheet}
        actions={[
          {
            label: 'Document',
            variant: 'secondary',
            onPress: () => {
              closeAttachmentSheet();
              handlePickAttachment('document');
            },
            accessibilityLabel: 'Pick a document',
          },
          {
            label: 'Photo Library',
            variant: 'secondary',
            onPress: () => {
              closeAttachmentSheet();
              handlePickAttachment('image');
            },
            accessibilityLabel: 'Pick a photo from library',
          },
          {
            label: 'Camera',
            variant: 'secondary',
            onPress: () => {
              closeAttachmentSheet();
              void photo.handleCameraCapture();
            },
            accessibilityLabel: 'Take a photo with the camera',
          },
          {
            label: 'Cancel',
            variant: 'quiet',
            onPress: closeAttachmentSheet,
            accessibilityLabel: 'Cancel attachment picker',
          },
        ]}
      />
    </>
  );
}
