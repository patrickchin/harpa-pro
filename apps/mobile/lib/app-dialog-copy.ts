/**
 * App-dialog copy factories. Pure data — no RN dependencies — used by
 * the call sites that mount `AppDialogSheet`. Ported from
 * `../haru3-reports/apps/mobile/lib/app-dialog-copy.ts` on branch
 * `dev`.
 */
export type AppDialogActionVariant = 'default' | 'secondary' | 'destructive' | 'quiet';

export type AppDialogTone = 'info' | 'success' | 'warning' | 'danger';

export interface AppDialogCopy {
  title: string;
  message: string;
  tone: AppDialogTone;
  noticeTitle: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant: AppDialogActionVariant;
}

export function getDeleteDraftDialogCopy(): AppDialogCopy {
  return {
    title: 'Delete Draft',
    message: 'This draft report will be removed. This cannot be undone.',
    tone: 'danger',
    noticeTitle: 'Permanent action',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    confirmVariant: 'destructive',
  };
}

export function getDeleteProjectDialogCopy(): AppDialogCopy {
  return {
    title: 'Delete Project',
    message:
      'This project and all its reports will be permanently deleted. This cannot be undone.',
    tone: 'danger',
    noticeTitle: 'Permanent action',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    confirmVariant: 'destructive',
  };
}

export function getDeleteReportDialogCopy(): AppDialogCopy {
  return {
    title: 'Delete Report',
    message: 'This report will be permanently deleted. This cannot be undone.',
    tone: 'danger',
    noticeTitle: 'Permanent action',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    confirmVariant: 'destructive',
  };
}

export function getFinalizeReportDialogCopy(): AppDialogCopy {
  return {
    title: 'Finalize Report',
    message:
      'Once finalized, this report will be marked as final and locked from further AI regeneration. You can still export and share it.',
    tone: 'warning',
    noticeTitle: 'Confirm finalization',
    confirmLabel: 'Finalize Report',
    cancelLabel: 'Cancel',
    confirmVariant: 'default',
  };
}

export function getRemoveMemberDialogCopy(name: string): AppDialogCopy {
  return {
    title: 'Remove Member',
    message: `${name} will be removed from this project and will lose access to its reports.`,
    tone: 'danger',
    noticeTitle: 'This cannot be undone',
    confirmLabel: 'Remove',
    cancelLabel: 'Cancel',
    confirmVariant: 'destructive',
  };
}

export function getDeleteVoiceNoteDialogCopy(): AppDialogCopy {
  return {
    title: 'Delete Voice Note',
    message: 'Are you sure you want to delete this voice note? This cannot be undone.',
    tone: 'danger',
    noticeTitle: 'Permanent action',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    confirmVariant: 'destructive',
  };
}

export function getDeleteNoteDialogCopy(): AppDialogCopy {
  return {
    title: 'Delete Note',
    message: 'Are you sure you want to delete this note? This cannot be undone.',
    tone: 'danger',
    noticeTitle: 'Permanent action',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    confirmVariant: 'destructive',
  };
}

export function getDeleteFileDialogCopy(filename: string): AppDialogCopy {
  return {
    title: 'Delete File',
    message: `Are you sure you want to delete "${filename}"? This cannot be undone.`,
    tone: 'danger',
    noticeTitle: 'Permanent action',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    confirmVariant: 'destructive',
  };
}

export function getActionErrorDialogCopy({
  title,
  fallbackMessage,
  message,
}: {
  title: string;
  fallbackMessage: string;
  message?: string;
}): AppDialogCopy {
  return {
    title,
    message: message?.trim() || fallbackMessage,
    tone: 'danger',
    noticeTitle: 'Action failed',
    confirmLabel: 'Done',
    confirmVariant: 'secondary',
  };
}
