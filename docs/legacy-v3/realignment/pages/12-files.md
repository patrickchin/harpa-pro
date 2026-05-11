# Files (Attachments)

> **Prompt for design tool:** Files attached to a report or project are displayed as a grid of FileCard components. Each card shows a thumbnail for images (48×48 with image preview) or a file-type icon (PDF, document) for other types. Below the thumbnail is the file name (1 line, truncated) and a small capture date. Optionally, a trash icon allows deleting the file. Tapping a card opens an ImagePreviewModal (for images) or file viewer. Upload status badges (uploading spinner, failed red X) overlay the thumbnail while an upload is in progress or has failed. A retry button and discard button appear below a failed upload card.

**Route:** `app/(app)/projects/[projectId]/reports/[reportId]` (files section) or inline in report draft
**Reference screenshot:** ../../../apps/docs/public/screenshots/12-files.png
**v3 source:** apps/mobile-v3/components/files/FileCard.tsx, FilePicker.tsx
**Mobile-old source:** (?) — grounding dump search for FileCard or attachment UI

## Purpose

Display and manage file attachments (photos, PDFs, documents) associated with a report or project. Each card represents one file; tapping opens a preview. Upload status and retry/discard actions are integrated into the card UI.

## Layout (top → bottom)

Per-card layout (in a grid, typically 2 columns):

1. **Thumbnail wrapper** (48×48 `rounded-md overflow-hidden bg-surface-muted`):
   - **For images**: `<Image source={{ uri: thumbnailUrl }} contentFit="cover" />`
   - **For non-images**: Icon view (centered) with PDF icon (FileText) or generic File icon, color muted-foreground.
   - **Upload overlay** (if uploading): ActivityIndicator overlay in center of thumbnail.
   - **Failed badge** (if failed): Red X icon + "Failed" label (or just red X) in top-right corner of thumbnail.

2. **File info** (flex-1, text column right of thumbnail):
   - **Name** (1 line, truncated): text-base font-medium text-foreground (`numberOfLines={1}`).
   - **Date** (below name): text-sm text-muted-foreground (e.g., "May 11").

3. **Delete button** (optional, if `onDelete` prop provided):
   - Top-right corner of card: small Pressable with X icon (16px, color destructive), `hitSlop={8}`, `testID="btn-delete-file-{id}"`.

4. **Retry / discard chips** (if upload failed):
   - Below the card: secondary button "Retry" + quiet button "Discard". testID `btn-retry-upload`, `btn-discard-upload`.

## Components

| Component | Type | Props / state |
|-----------|------|---|
| `FileCard` | Functional memo | `file: FileCardFile` (id, fileName, mimeType, category, storagePath, createdAt), `thumbnailUrl?: string`, `onPress?: () => void`, `onDelete?: () => void`. |
| `FilePicker` | Functional | (?) — opens native file picker (photos, camera, documents). Returns selected file metadata. |
| `ImagePreviewModal` | Modal | `visible: boolean`, `imageUri: string`, `onClose: () => void`. Full-screen image viewer with pinch-to-zoom. |
| `UploadTraySheet` | Sheet | Shows queued + in-progress uploads. Each with progress bar, retry/discard buttons. |

## Interactions

- **Tap card**: If `onPress`, open preview modal (ImagePreviewModal for images, file viewer for others).
- **Tap delete (X)**: Confirmation dialog → DELETE file request → remove from list.
- **Tap retry** (on failed upload): Re-upload the file.
- **Tap discard** (on failed upload): Remove the failed upload from queue.
- **Tap FilePicker button** ("+ Add file" or paperclip): Native picker → select image/photo/document → upload via multipart form data.

## Data shown

- **Thumbnail**: Image preview (if available) or icon (PDF / document type).
- **File name**: Original file name, truncated to 1 line.
- **Date**: Capture or creation date in short format (e.g., "May 11").
- **Upload status**: "uploading" (spinner overlay), "failed" (red X overlay), "success" (checkmark or just gone).
- **Upload progress**: (optional) percentage or progress bar on card or separate tray.

## Visual tokens

Use Unistyles tokens only:
- Card background: `theme.colors.card` (default) / `theme.colors.surfaceMuted` (hover/pressed?).
- Border: `theme.colors.border` (1px, rounded-lg).
- Thumbnail background (non-image): `theme.colors.surfaceMuted`.
- Icon color: `theme.colors.mutedForeground` (default icon), `theme.colors.destructive` (delete X, failed badge).
- Text: `theme.colors.foreground` (file name), `theme.colors.mutedForeground` (date, hint).
- Spacing: `gap-sm` between elements, `padding-sm` inside card.
- Radii: `theme.radii.lg` (card), `theme.radii.md` (thumbnail).
- Overlay: `transparent` with activity indicator or X icon during upload states.

## Acceptance checklist

- [ ] FileCard displays image thumbnail (48×48) or file icon depending on mimeType.
- [ ] File name displays with 1-line truncation.
- [ ] Date displays in short format (e.g., "May 11").
- [ ] Delete button (X) appears in top-right if onDelete prop provided.
- [ ] Tapping card calls onPress and opens preview modal.
- [ ] Upload spinner overlays thumbnail while uploading.
- [ ] Failed state shows red X badge in top-right of thumbnail.
- [ ] Retry / Discard buttons appear below failed upload card.
- [ ] testID present: `btn-open-file-{id}`, `btn-delete-file-{id}`.
- [ ] Grid layout (2 columns) is responsive and fills width.
- [ ] Images load from thumbnailUrl; non-images show generic icon.
- [ ] FilePicker integration: tap "+ Add file" → native picker → queue upload.
- [ ] (?) Mime type detection (image/*, application/pdf, etc.) for icon selection.
