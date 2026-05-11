# Finalized Report Detail

> **Prompt for design tool:** When a draft is finalized, the user lands on a dedicated report detail screen. This is a read-only view of the completed report. The layout mirrors the Report tab (StatBar → WeatherStrip → Summary → IssuesCard → etc.) but is displayed in a full-screen context rather than a tab. At the top is a ScreenHeader with back arrow + project name + "Daily" type label. Below that is an inline "… Actions" button (NOT a header trailing icon — styled as a secondary button) that opens a modal menu with View PDF / Save PDF / Share PDF / Delete Report options. Edit tab is stripped in v3 P1, so there is no tab bar; just a single Report view. Actions button controls the PDF and delete flows.

**Route:** `app/(app)/projects/[projectId]/reports/[reportId].tsx`
**Reference screenshot:** ../../../apps/docs/public/screenshots/10-saved-report.png
**v3 source:** apps/mobile-v3/app/(app)/projects/[projectId]/reports/[reportId].tsx
**Mobile-old source:** [`docs/v3/_work/mobile-old-source-dump.md`](../../_work/mobile-old-source-dump.md) — `===== FILE: apps/mobile-old/components/reports/detail/ReportDetailTabBar.tsx =====` (line 2700), `ReportActionsMenu.tsx` (line 2314)

## Purpose

Display a finalized report in a pristine, read-only view. The user can review the generated content, export/share as PDF, or delete the report. The Actions menu unifies all secondary actions (PDF view/save/share, delete) into one coherent modal.

## Layout (top → bottom)

1. **ScreenHeader** — back arrow + "Report" or project name title + backLabel "Projects".

2. **Type label** — e.g., "Daily" (text-sm text-muted-foreground), positioned below header or inline.

3. **Actions button row** — `mx-5 mt-3` flex-row justify-end:
   - Secondary button `btn-report-actions` (or labeled "… Actions") with icon (MoreVertical or ellipsis). On press, open ReportActionsMenu modal.

4. **Report content** (ScrollView flex-1, `px-5` contentContainerStyle paddingBottom=100):
   - Identical composition to ReportTabPane: StatBar → WeatherStrip → Summary → IssuesCard → WorkersCard → MaterialsCard → NextStepsCard → SummarySectionCard list.
   - **No CompletenessCard** (report is already finalized, so completeness is not relevant).
   - **No "Edit manually" button** (Edit tab stripped in P1).

## Components

| Component | Type | Props / state |
|-----------|------|---|
| `ScreenHeader` | UI | title (project name or "Report"), onBack handler. |
| `Actions button` | Pressable | Opens ReportActionsMenu modal. |
| `ReportView` | Functional | `report: GeneratedSiteReport` (read-only). |
| `ReportActionsMenu` | Modal | Props: visible, onClose, onViewPdf, onSavePdf, onSharePdf, onDelete, isSaving, isExporting, isDeleting. Renders 4 secondary button rows. |

## Interactions

- **Back button**: Navigate back to reports list (or project home).
- **Actions button**: Open `ReportActionsMenu` modal.
  - **View PDF**: `onViewPdf()` → PdfPreviewModal appears (see 11-pdf-preview.md).
  - **Save PDF**: `onSavePdf()` → exports PDF to device storage, then SavedReportSheet appears with full path + Open / Share / Done buttons.
  - **Share PDF**: `onSharePdf()` → uses system share sheet to send PDF via email, messaging, etc.
  - **Delete Report**: `onDelete()` → confirmation dialog, then DELETE request, then navigate back to reports list.

## Data shown

- **Report header**: Project name, report type (Daily / Weekly / etc.), creation date (if shown).
- **Report body**: Full content per 08-report-tab.md (all card types, no edit UI).

## Visual tokens

Use Unistyles tokens only:
- Header: `theme.colors.background` (bg), `theme.colors.foreground` (title).
- Actions button: secondary variant (`theme.colors.card` bg, `theme.colors.foreground` text).
- Report content: same tokens as 08-report-tab.md.
- Spacing: `mx-5 mt-3` (button row), `px-5` (report content), `gap-3` (card list).

## Acceptance checklist

- [ ] ScreenHeader shows project name + back button.
- [ ] Type label ("Daily") appears below header.
- [ ] Actions button opens ReportActionsMenu modal.
- [ ] ReportActionsMenu has 4 rows: View PDF, Save PDF, Share PDF, Delete Report.
- [ ] View PDF → PdfPreviewModal appears.
- [ ] Save PDF → PDF exported + SavedReportSheet shown with full path.
- [ ] Share PDF → system share sheet invoked.
- [ ] Delete Report → confirmation dialog → DELETE request → back to reports list.
- [ ] isSaving / isExporting / isDeleting disabled states work (buttons show loading text, are disabled).
- [ ] Report body renders all card types (StatBar, WeatherStrip, IssuesCard, etc.) in correct order.
- [ ] No Edit tab or manual-edit button is visible (Edit tab stripped in P1).
- [ ] testID present: `btn-report-actions`, `btn-report-view-pdf`, `btn-report-save-pdf`, `btn-report-share-pdf`, `btn-report-delete`.
