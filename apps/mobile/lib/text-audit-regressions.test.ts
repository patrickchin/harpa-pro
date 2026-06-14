import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const mobileRoot = process.cwd();

const clearedCopyFindings: Array<{ file: string; oldText: string }> = [
  { file: 'app/(auth)/onboarding.tsx', oldText: 'Please enter your full name.' },
  { file: 'app/(auth)/onboarding.tsx', oldText: 'Please enter your company name.' },
  { file: 'app/(auth)/onboarding.tsx', oldText: 'Failed to save profile.' },
  { file: 'app/(auth)/sign-in/email.tsx', oldText: 'Please enter a valid email address.' },
  { file: 'screens/onboarding.tsx', oldText: 'Saving...' },
  { file: 'app/(app)/account.tsx', oldText: 'Could not save profile.' },
  { file: 'screens/profile.tsx', oldText: 'Loading your account details...' },
  {
    file: 'screens/usage.tsx',
    oldText: 'No usage data yet. Generate your first report to see stats here.',
  },
  { file: 'components/account/AvatarUploader.tsx', oldText: 'Could not upload avatar' },
  {
    file: 'components/account/AvatarUploader.tsx',
    oldText: 'Photo library permission denied',
  },
  {
    file: 'components/account/UsageLimitDialog.tsx',
    oldText: "You've used ${usedLimit} ${kindLabel} this month.",
  },
  {
    file: 'components/account/UsageLimitDialog.tsx',
    oldText:
      'Your limit resets on ${resetLabel}. To keep working before then, please upgrade your plan or contact support.',
  },
  { file: 'app/(app)/projects/new.tsx', oldText: 'Failed to create project.' },
  { file: 'screens/project-new.tsx', oldText: 'Project Name' },
  { file: 'screens/project-new.tsx', oldText: 'Project Address' },
  { file: 'screens/project-new.tsx', oldText: 'Client Name' },
  { file: 'screens/project-new.tsx', oldText: 'Create Project' },
  { file: 'screens/project-edit.tsx', oldText: 'Edit Project' },
  { file: 'screens/project-edit.tsx', oldText: 'Project Name' },
  { file: 'screens/project-edit.tsx', oldText: 'Project Address' },
  { file: 'screens/project-edit.tsx', oldText: 'Client Name' },
  { file: 'screens/project-edit.tsx', oldText: 'Use delete carefully' },
  { file: 'screens/project-edit.tsx', oldText: 'Delete Project' },
  { file: 'screens/project-edit.tsx', oldText: 'Save Changes' },
  { file: 'screens/project-edit.tsx', oldText: 'Failed to delete project.' },
  { file: 'screens/projects-list.tsx', oldText: 'Add new project' },
  {
    file: 'app/(app)/projects/[project]/reports/[number]/generate.tsx',
    oldText: 'Could not delete the note. Please try again.',
  },
  {
    file: 'app/(app)/projects/[project]/reports/[number]/generate.tsx',
    oldText: 'Could not update the note. Please try again.',
  },
  {
    file: 'app/(app)/projects/[project]/reports/[number]/generate.tsx',
    oldText: 'Could not save the note. Please try again.',
  },
  {
    file: 'app/(app)/projects/[project]/reports/[number]/generate.tsx',
    oldText: "photo${outcome.total === 1 ? '' : 's'}",
  },
  {
    file: 'app/(app)/projects/[project]/reports/[number]/generate.tsx',
    oldText: 'Could not pick photos.',
  },
  {
    file: 'app/(app)/projects/[project]/reports/[number]/generate.tsx',
    oldText: "photo${allUris.length === 1 ? '' : 's'}",
  },
  { file: 'screens/report-notes.tsx', oldText: 'Failed to load notes' },
  { file: 'screens/saved-report.tsx', oldText: 'Failed to load report' },
  { file: 'screens/generate-notes.tsx', oldText: 'Deleting...' },
  { file: 'components/notes/NoteTimeline.tsx', oldText: 'Could not load notes:' },
  { file: 'screens/report-debug.tsx', oldText: 'Failed to load debug data.' },
  {
    file: 'components/reports/MaterialsCard.tsx',
    oldText: "material${materials.length === 1 ? '' : 's'}",
  },
  { file: 'components/reports/PdfPreviewModal.tsx', oldText: 'Could not generate PDF.' },
  { file: 'components/reports/PdfPreviewModal.tsx', oldText: 'Could not share the PDF.' },
  { file: 'components/reports/PdfPreviewModal.tsx', oldText: 'Could not open the PDF.' },
  { file: 'components/reports/PdfPreviewModal.tsx', oldText: 'Could not display PDF.' },
  { file: 'components/reports/PdfPreviewModal.tsx', oldText: 'Generating PDF...' },
  { file: 'components/reports/PdfPreviewModal.tsx', oldText: 'Sharing...' },
  {
    file: 'components/reports/detail/SavedReportSheet.tsx',
    oldText: 'Could not generate PDF.',
  },
  {
    file: 'components/reports/detail/SavedReportSheet.tsx',
    oldText: 'PDF Failed',
  },
  { file: 'components/reports/detail/SavedReportSheet.tsx', oldText: 'Opening PDF...' },
  { file: 'components/reports/detail/SavedReportSheet.tsx', oldText: 'Sharing PDF...' },
  { file: 'components/reports/detail/ReportActionsMenu.tsx', oldText: 'Saving PDF...' },
  { file: 'components/reports/detail/ReportActionsMenu.tsx', oldText: 'Sharing PDF...' },
  { file: 'components/reports/detail/ReportActionsMenu.tsx', oldText: 'Unfinalizing...' },
  { file: 'components/reports/detail/ReportActionsMenu.tsx', oldText: 'Deleting...' },
  { file: 'components/reports/detail/ReportActionsMenu.tsx', oldText: 'View Notes' },
  { file: 'components/reports/detail/ReportActionsMenu.tsx', oldText: 'Unfinalize Report' },
  { file: 'components/reports/detail/ReportActionsMenu.tsx', oldText: 'Delete Report' },
  {
    file: 'components/reports/generate/GenerateReportDialogs.tsx',
    oldText: 'Upload Failed',
  },
  {
    file: 'components/reports/generate/GenerateReportDialogs.tsx',
    oldText: 'Could not attach the file to this report.',
  },
  {
    file: 'components/reports/generate/GenerateReportDialogs.tsx',
    oldText: 'Photo Library',
  },
  {
    file: 'components/reports/generate/GenerateReportInputBar.tsx',
    oldText: 'Type a site note...',
  },
  {
    file: 'components/reports/generate/ReportTabPane.tsx',
    oldText: 'Generating your report from the notes collected so far...',
  },
  {
    file: 'components/reports/generate/ReportTabPane.tsx',
    oldText: 'Updating the draft with your newest notes...',
  },
  { file: 'screens/camera-capture.tsx', oldText: 'Save to gallery: on' },
  { file: 'screens/camera-capture.tsx', oldText: 'Save to gallery: off' },
  { file: 'screens/camera-capture.tsx', oldText: 'Keep editing' },
  { file: 'app/(camera)/capture.tsx', oldText: "label: 'OK'" },
  { file: 'lib/dialogs/DialogSheetProvider.tsx', oldText: "label: 'OK'" },
  { file: 'lib/reports/use-report-pdf-actions.ts', oldText: 'Could not generate PDF.' },
  {
    file: 'lib/reports/use-report-pdf-actions.ts',
    oldText: 'Could not open the saved PDF.',
  },
  {
    file: 'lib/reports/use-report-pdf-actions.ts',
    oldText: 'Could not share the saved PDF.',
  },
  { file: 'lib/reports/use-report-pdf-actions.ts', oldText: 'Export Failed' },
  {
    file: 'lib/reports/export-report-pdf.ts',
    oldText: 'Could not open the saved PDF. Use Share PDF to choose another app.',
  },
  { file: 'lib/api/client.ts', oldText: 'Failed to parse JSON response' },
  { file: 'app/_layout.tsx', oldText: 'Something went wrong' },
];

describe('mobile text audit regressions', () => {
  it.each(clearedCopyFindings)('$file no longer contains "$oldText"', ({ file, oldText }) => {
    const source = readFileSync(join(mobileRoot, file), 'utf8');

    expect(source).not.toContain(oldText);
  });
});
