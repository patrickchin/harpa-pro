# PDF Preview Modal

> **Prompt for design tool:** When the user taps "View PDF" from the Actions menu, a full-screen modal appears showing the generated PDF. On iOS, a WebView renders the file directly. On Android, `react-native-pdf` is used with a footer "Open externally" button. A header bar shows "PDF Preview" title + "Close" back label on the left and a Share button on the right. While the PDF is generating, an ActivityIndicator + "Generating PDF…" message is shown. On error, an InlineNotice (danger) displays the error + a Close button.

**Route:** Modal triggered from saved report detail screen (10-saved-report.md)
**Reference screenshot:** ../../../apps/docs/public/screenshots/11-pdf.png
**v3 source:** (?) — not yet ported to v3
**Mobile-old source:** [`docs/v3/_work/mobile-old-source-dump.md`](../../_work/mobile-old-source-dump.md) — `===== FILE: apps/mobile-old/components/reports/PdfPreviewModal.tsx =====` (line 2101), `SavedReportSheet.tsx` (line 2447)

## Purpose

Display the generated PDF report in-app. User can view the formatted PDF, share it, or open it in an external app (Android fallback). The modal manages PDF generation state (loading, success, error).

## Layout (top → bottom)

1. **ScreenHeader** (inside modal):
   - Left: "Close" back label with chevron-left (back button behavior).
   - Center/right: "PDF Preview" title (or omit title and show only back + right button).
   - Right: Share button with Share2 icon. On press, open system share sheet for the PDF file.

2. **Loading state** (if `isGenerating`):
   - Center-aligned column: ActivityIndicator (large, color foreground) + Text "Generating PDF…" (text-base text-muted-foreground).

3. **Error state** (if `errorMessage` truthy):
   - InlineNotice tone="danger" with error text.
   - Close button below (secondary, full-width, "Close").

4. **Success state** (if `pdfResult` exists):
   - **iOS**: WebView component with source={{ uri: pdfResult.pdfUri }} + originWhitelist={["file://*"]} + scalesPageToFit={true}.
   - **Android**: `Pdf` component (react-native-pdf) with source={{ uri: pdfResult.pdfUri }} + fitWidth={true} + renderActivityIndicator={() => <ActivityIndicator />}. Footer row with "Open externally" secondary button.

5. **Footer spacer** (SafeAreaView bottom safe area).

## Components

| Component | Type | Props / state |
|-----------|------|---|
| `PdfPreviewModal` | Modal | `visible: boolean`, `report: GeneratedSiteReport | undefined`, `siteName?: string | null`, `onClose: () => void`. Manages isGenerating, pdfResult, errorMessage state. |
| `ScreenHeader` | UI | Back button + Share button. |
| `WebView` (iOS) | Native | `source={{ uri: pdfUri }}`, `originWhitelist={["file://*"]}`, `scalesPageToFit={true}`. |
| `Pdf` (Android) | Native | `source={{ uri: pdfUri }}`, `fitWidth={true}`, `renderActivityIndicator`. |
| `Share2` button | Pressable | Opens system share sheet for PDF. |
| `Open externally` (Android) | Button | `onPress={handleOpenExternally}()`. |

## Interactions

- **Close button**: `onClose()` → dismiss modal, reset state.
- **Share button**: `handleShare()` → shareSavedReportPdf({ pdfUri, reportTitle }) → system share sheet.
- **Open externally (Android)**: `handleOpenExternally()` → opens PDF in default viewer app.
- **useEffect on visible**: If `visible` is true and `report` exists, trigger `saveReportPdf(report, { siteName })`. Cleanup on unmount or visible=false.

## Data shown

- **PDF file**: Generated from report data via `saveReportPdf()` helper. File saved to app cache/documents directory.
- **Loading state**: "Generating PDF…" text + spinner.
- **Error state**: Error message text (e.g., "Could not generate PDF.").
- **Success**: Rendered PDF content on-screen.

## Visual tokens

Use Unistyles tokens only:
- Modal background: `theme.colors.background`.
- Header: `theme.colors.foreground` (title), icons color foreground.
- Loading/error text: `theme.colors.mutedForeground`.
- InlineNotice: danger tone.
- Buttons: secondary variant.
- Spacing: Safe area insets on iOS.

## Acceptance checklist

- [ ] Modal opens on "View PDF" tap.
- [ ] Header shows "PDF Preview" title + Close back button + Share icon.
- [ ] Loading state shows ActivityIndicator + "Generating PDF…" while saveReportPdf() is pending.
- [ ] Error state displays error message in InlineNotice (danger) + Close button.
- [ ] Success state: WebView on iOS, Pdf component on Android.
- [ ] Share button opens system share sheet with PDF attachment.
- [ ] Close button dismisses modal and resets state.
- [ ] (Android only) "Open externally" button opens PDF in default viewer.
- [ ] useEffect cleanup cancels in-flight PDF generation if component unmounts or visible becomes false.
- [ ] Hermes release build on iOS has access to globalThis.crypto for UUID generation (no fallback that breaks PostgREST).

## SavedReportSheet (bonus: post-Save PDF)

After "Save PDF" completes, `SavedReportSheet` modal appears (optional sub-state of the PDF flow).

- **Header**: Title ("PDF Saved" or "Preparing PDF…" / "PDF Failed").
- **Generating state**: ActivityIndicator + "Generating PDF for {reportTitle}…".
- **Error state**: InlineNotice (danger) + Retry button + Dismiss button.
- **Success state**:
  - InlineNotice (success) "Saved to app documents: {locationDescription}".
  - Card with FolderOpen icon + "Full path" label + full file path (text-sm text-muted-foreground).
  - Hints: "Open it now or send it somewhere else" + openHint + shareHint text.
  - Buttons (full-width):
    - Primary "Open PDF" (`btn-saved-pdf-open`, FileText icon) → `handleOpen()` or system file app.
    - Secondary "Share PDF" (`btn-saved-pdf-share`, Share2 icon) → system share sheet.
    - Quiet "Done" (`btn-saved-pdf-done`) → dismiss modal.
  - Optional error banner if Open / Share fails.
- **Disabled states**: isOpening / isSharing / isDeleting disable buttons and hide close button.
- testIDs: `btn-saved-pdf-done`.
