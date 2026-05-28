# Photo Grid Unification & Fullscreen Viewer Redesign

**Date:** 2026-05-28
**Branch:** `agents/client-side-thumbnail-upload`
**Revision:** v2 (incorporates spec review of v1)

---

## Problem

1. **Inconsistent grid behaviour.** `ImageNoteCard` (single-photo timeline note) renders a fixed 110 px tile beside body text. Batch-photo notes use `PhotoBatchGrid` with 1/3-width tiles. Same content kind, two different layouts.
2. **`PhotoBatchGrid` collapses on small batches.** With 1 attachment it renders **1 column** of full-width tile; with 2 it renders 2 columns of half-width tiles. The grid is not actually a 3-col grid.
3. **Fullscreen modal is visually plain.** White header, translucent close circle, no zoom, no chrome toggle, no blurred placeholder.
4. **Thumbnail not surfaced as placeholder.** `expo-image` has nothing to render while it fetches the full image even though the thumbnail (~15–40 KB) is already in disk cache from the grid.

---

## Goals

- Every photo tile, everywhere in the app, is 1/3 the available row width — even when a note holds 1 or 2 photos.
- Image notes (single or batch) render through one component and one layout.
- The fullscreen modal adopts a Twitter/X-inspired design: pure black backdrop, translucent overlay header, pinch-zoom + double-tap-zoom, tap-to-toggle chrome, thumbnail as instant blurred placeholder.
- `thumbnailFileId` flows through every gallery builder so the placeholder is always available.

---

## Non-goals

- Re-encoding thumbnails at a higher resolution (stay at 256² q=0.7).
- Swipe-down-to-dismiss gesture.
- Thumbnail strip footer.
- New `usePinchZoom` shared hook (camera's 1-D zoom and viewer's 2-D zoom don't share enough to abstract).
- Refactoring `camera-capture.tsx` zoom code.

---

## Architecture

### Files changed

| File | Change |
|---|---|
| `apps/mobile/components/notes/PhotoBatchGrid.tsx` | Always use 3 columns (`cols = COLUMNS` unconditionally). With 1 or 2 attachments, `flex-wrap` produces 1 row of 1/3-width tiles left-aligned, empty space on the right. |
| `apps/mobile/components/notes/ImageNoteCard.tsx` | **Deleted.** |
| `apps/mobile/components/notes/ImageNoteCard.test.tsx` | **Deleted.** |
| `apps/mobile/components/notes/NoteTimeline.tsx` | Route `kind: 'image'` notes to `PhotoNoteCard` instead of `ImageNoteCard`. |
| `apps/mobile/components/notes/PhotoNoteCard.tsx` | No structural change. Becomes the sole renderer for image notes. |
| `apps/mobile/components/reports/detail/ReportPhotos.tsx` | No layout change (already 3-col). |
| `apps/mobile/features/generate/GenerateReportProvider.tsx` | Widen `photoGallery` item type to include `thumbnailFileId`. Populate from `att.thumbnailFileId`. |
| `apps/mobile/screens/report-notes.tsx` | Widen inline gallery item type; populate from `n.thumbnailFileId`. |
| `apps/mobile/screens/saved-report.tsx` | Widen inline gallery item type; populate from `n.thumbnailFileId`. |
| `apps/mobile/components/files/ImagePreviewModal.tsx` | Add `thumbnailFileId` to `ImagePreviewPhoto`. Full visual redesign (Twitter/X). |
| `apps/mobile/components/files/ZoomableImage.tsx` | **New.** Pinch + double-tap zoom + bounded pan. |
| `apps/mobile/components/ui/CachedImage.tsx` | Forward `cacheKey` into the `placeholder` source when the placeholder is a `{ uri }` object, so the thumbnail's disk-cache entry is reused. |

---

## 1. Make `PhotoBatchGrid` actually a 3-col grid

`PhotoBatchGrid.tsx` today:

```ts
const cols = Math.min(visible.length, COLUMNS);
const tileSize = Math.floor((containerWidth - GAP * (cols - 1)) / cols);
```

→ 1 attachment renders full-width; 2 renders half-width.

**Change to:**

```ts
const tileSize = Math.floor(
  (containerWidth - GAP * (COLUMNS - 1)) / COLUMNS,
);
```

`COLUMNS = 3` is then enforced by `flex-wrap` regardless of `attachments.length`. With 1 or 2 photos, the row has 1 or 2 tiles left-aligned and the rest is whitespace — matches the spec's mock.

Update `PhotoBatchGrid.test.tsx` accordingly (the existing 3-attachment test still passes; add a 1-attachment test asserting `tileSize ≈ containerWidth/3`).

---

## 2. Delete `ImageNoteCard`, route image notes through `PhotoNoteCard`

`PhotoNoteCard`'s prop interface is a strict superset of `ImageNoteCard`'s (`entry`, `sourceIndex`, `authorName` are identical; the rest of `PhotoNoteCard`'s props are optional). `buildAttachments(entry)` (`lib/notes/attachments.ts`) already returns a 1-element array for legacy single-`fileId` image notes. Header rendering (`NoteCardHeader`) is identical.

**Change `NoteTimeline.tsx`:** the switch that picks `ImageNoteCard` for `kind === 'image'` now picks `PhotoNoteCard`. Delete the import. Run grep for any other consumers of `ImageNoteCard` (e.g. storybook, screenshot tests) and update.

**Side benefit:** the locally-mounted `ImagePreviewModal` inside `ImageNoteCard` (which never received `thumbnailFileId`) goes away. All image-tile taps now flow through `NoteTimeline → onOpen(fileId, sourceIndex) → handleOpenPhoto` and into the gallery's shared modal — which does carry `thumbnailFileId`.

---

## 3. Thread `thumbnailFileId` through gallery builders

Three places build a `photoGallery` array fed into the shared `ImagePreviewModal`. All three need their item type widened.

### `ImagePreviewPhoto` (the type)

```ts
// components/files/ImagePreviewModal.tsx
export interface ImagePreviewPhoto {
  fileId?: string | null;
  thumbnailFileId?: string | null;   // NEW
  uri?: string | null;
  title?: string;
  cacheKey?: string | null;
}
```

### `features/generate/GenerateReportProvider.tsx`

Find the `photoGallery` builder (currently builds `{ fileId, title, cacheKey }`). Add `thumbnailFileId: att.thumbnailFileId ?? null`.

### `screens/report-notes.tsx`

Same change to the inline `photoGallery` builder. Source: `n.thumbnailFileId` (already present on `ReportNoteRow` — see `ReportNotesPane.tsx` row type).

### `screens/saved-report.tsx`

Same change.

### `onOpenPhoto` callback (not changed)

`ReportPhotos.onOpenPhoto({ fileId, title })` does **not** need a new field. The gallery already carries the full photo list; the callback just provides the `fileId` to scroll to. Don't widen this contract.

---

## 4. Thumbnail as fullscreen placeholder

### Data flow

```
Grid tile (PhotoTile)
  └─ useFileSignedUrl(thumbnailFileId)
       └─ React Query cache key: ["fileUrl", { id: thumbnailFileId }]
       └─ expo-image disk cache populated under cacheKey=thumbnailFileId

Tap → ImagePreviewModal opens with photos[currentIndex].thumbnailFileId
  └─ ImagePreviewBody
       ├─ useFileSignedUrl(fileId)            → full URL (network)
       └─ useFileSignedUrl(thumbnailFileId)   → cache hit, synchronous
            └─ CachedImage
                 source={fullUrl,    cacheKey: fileId}
                 placeholder={thumbUrl, cacheKey: thumbnailFileId}   ← see step 5
                 transition={200}
```

The placeholder hook must run only when `!uri && Boolean(thumbnailFileId)` (mirror the main hook's `enabled` flag) so local-URI previews (`uri` set, no `fileId`) don't fire a request.

---

## 5. `CachedImage` forwards `cacheKey` to the placeholder source

Today `CachedImage.tsx` merges `cacheKey` into the **main `source`** only. The `placeholder` source goes through unchanged, so `expo-image` won't reuse the disk-cache entry the grid populated for the thumbnail — it'll re-download the bytes from the signed URL.

**Change:** accept an optional `placeholderCacheKey` prop; when `placeholder` is `{ uri: string }`, merge `cacheKey: placeholderCacheKey` into it. `ImagePreviewBody` passes `placeholderCacheKey={thumbnailFileId}`.

This matters because the disk cache survives modal close/reopen. Without it the placeholder works on first open (signed URL is hot in RQ) but every reopen re-decodes from network.

---

## 6. Fullscreen modal redesign (Twitter/X style)

### Visual design

- **Backdrop:** pure black `#000`. Modal `presentationStyle="fullScreen"`, `StatusBar style="light"`.
- **Header (translucent, fade-able overlay):**
  - Absolute-positioned, top of screen, full width, `bg-black/60`.
  - Left: round close button, `bg-white/15`, `X` icon `colors.background`.
  - Center: caption (note body) — `text-white text-sm` 1 line ellipsized. Below it: author + relative time in `text-white/50 text-xs`. Title gets `accessibilityRole="header"`.
  - Right: `1 / N` counter only in gallery mode, `text-white/60 text-xs`. Hidden when `photos.length === 1`.
- **No `ScreenHeader` reuse.** Custom overlay row; a11y labels preserved (close button keeps `accessibilityLabel="Close image preview"`).
- **Chrome toggle:** single-tap on the image fades the header opacity 0 ↔ 1 with `withTiming(150)`. StatusBar `hidden` mirrors the same shared value.
- **Single + double tap arbitration:** `singleTap.requireExternalGestureToFail(doubleTap)` so the single-tap chrome toggle doesn't fire on the way to a double-tap-zoom.

### Modal entrance

Keep `animationType="fade"` (current). The Twitter-style slide-up does not behave consistently on Android RN; a Reanimated entering animation is more work than the polish justifies. **Cut from scope.**

### Caption alignment with single-tile mode

Single-photo notes (now routed through `PhotoNoteCard`) build a 1-item gallery. The caption is `entry.text ?? 'Photo'`. Same in `ReportPhotos` (uses `p.body?.trim() || 'Photo'`).

---

## 7. `ZoomableImage` primitive

New file: `apps/mobile/components/files/ZoomableImage.tsx` (not `ui/` — it's photo-viewer-specific).

### Responsibilities

- Wraps a `CachedImage` with Reanimated `scale`, `translateX`, `translateY` shared values.
- **Pinch** (`Gesture.Pinch`): updates `scale` with focal-point tracking. Clamps `[1, 4]`. On end, if `scale < 1.1` snap back to 1 + translations to 0 with `withSpring`.
- **Double-tap** (`Gesture.Tap.numberOfTaps(2)`): toggles between 1 and 2.5 with the tap focal point as the anchor.
- **Pan** (`Gesture.Pan`): active only while `scale > 1`. Translations clamped so the image edges never reveal backdrop.
- **`onZoomChange(isZoomed: boolean)` callback:** fires when `scale` crosses the 1.1 threshold. Used by the parent to coordinate with the horizontal pager (see step 8).

### Props

```ts
interface ZoomableImageProps {
  source: { uri: string };
  placeholder?: { uri: string };
  cacheKey?: string;
  placeholderCacheKey?: string;
  width: number;
  height: number;
  contentFit?: 'contain' | 'cover';
  onZoomChange?: (isZoomed: boolean) => void;
  accessibilityLabel?: string;
}
```

### Inline, don't extract

Camera-capture's pinch drives a 1-D normalized `[0, 1]` camera zoom anchored on `zoomStart` — fundamentally different math from 2-D scale + bounded pan. Sharing is ~3 lines of `Gesture.Pinch().onUpdate`. Inline the logic in `ZoomableImage`. **No shared `usePinchZoom` hook.**

---

## 8. Horizontal paging that doesn't fight the zoom gesture

The current `FlatList horizontal pagingEnabled` is fragile when a child gesture wants exclusive ownership. Toggling `scrollEnabled` mid-gesture is a known RNGH v2 footgun on Android.

**Chosen approach: `react-native-pager-view`.**

- Add the dependency (`pnpm --filter mobile add react-native-pager-view`). It is widely used (Expo SDK includes it) and has explicit zoom-aware semantics on both platforms (`scrollEnabled` toggling is reliable; `overdrag` and gesture arbitration are first-class).
- Replace the `FlatList` with `<PagerView initialPage={startIndex} onPageSelected={...} scrollEnabled={!anyZoomed}>`.
- A shared ref `const anyZoomedRef = useRef(false)` (or a Reanimated shared value if we want it animated) tracks "any visible item zoomed." `ZoomableImage.onZoomChange` flips it.

If `pnpm install` is undesirable, the fallback is `Gesture.Native(pagerRef)` composed with `pinch.simultaneousWithExternalGesture(nativeGesture)` — but this is a more delicate gesture-tree configuration and Android pager + pinch composition has open RNGH issues. PagerView is the safer call.

---

## 9. Testing

### Unit/integration tests to update

| Test file | What changes |
|---|---|
| `PhotoBatchGrid.test.tsx` | Add a 1-attachment case asserting `tileSize ≈ containerWidth/3` and not full-width. Update the 320-px-container expected size to match the new formula. |
| `NoteTimeline.test.tsx` | Image notes now route through `PhotoNoteCard`. |
| `ImagePreviewModal.test.tsx` | Assert `thumbnailFileId` URL is passed as `placeholder` to `CachedImage` with `placeholderCacheKey={thumbnailFileId}`. Assert single-tap toggles header opacity. Assert pager `scrollEnabled` flips when zoom changes. |
| `ReportPhotos.test.tsx` | No callback change (per step 3). |
| `CachedImage.test.tsx` (if absent, add) | `placeholderCacheKey` is merged into the placeholder source. |

### New tests

| Test file | What it covers |
|---|---|
| `ZoomableImage.test.tsx` | Scale clamps `[1, 4]`. Double-tap toggles 1 ↔ 2.5. Pan stays in bounds. `onZoomChange` fires at threshold. |
| `gallery-thumbnail-placeholder.integration.test.tsx` | **Pitfall 13 / R5 — default-wiring test.** Mount a `PhotoBatchGrid` with a single attachment against a `QueryClient` + captured-fetch mock. Assert React Query cache contains the thumbnail URL. Mount `ImagePreviewModal` against the **same** `QueryClient` and assert `useFileSignedUrl(thumbnailFileId)` returns `data` synchronously and is forwarded to `CachedImage.placeholder`. **No fake hook.** The whole value of this feature depends on the cache being shared. |

### Deletions

- `ImageNoteCard.test.tsx` deleted with the component.

---

## 10. Open questions (resolved)

| Question | Decision |
|---|---|
| Thumbnail resolution | Keep 256² q=0.7 |
| Backdrop colour | Pure black `#000` |
| Swipe-down-to-dismiss | Out of scope |
| Single + double tap arbitration | `singleTap.requireExternalGestureToFail(doubleTap)` |
| `usePinchZoom` extraction | Cut |
| Modal entrance animation | Keep `fade` |
| `ImageNoteCard` future | Delete |
| Horizontal pager | `react-native-pager-view` |
| `onOpenPhoto` callback widening | Cut (gallery already carries the data) |
| `ScreenHeader` reuse in modal | Replaced with custom overlay (a11y preserved) |

---

## 11. Risks

1. **`react-native-pager-view` install.** New native dep. Already part of `@react-navigation` peer deps in Expo apps, so likely no native-build implications, but verify against `apps/mobile/package.json` and `expo-dev-client` config before plan generation.
2. **Reanimated 3 + RNGH v2 pinch/pan/tap composition on Android.** `ZoomableImage` will need real device testing on Android before merge. Test plan covers logic, but gesture composition edge cases (e.g. two-finger pan that exits to single-finger pan after one finger lifts) require manual QA.
3. **React Query cache cold-start.** If the modal is opened without a prior grid mount (deep link, share-sheet), the thumbnail hook will incur a network fetch and the placeholder will be absent for that first open. Acceptable.
4. **`CachedImage` placeholder cache-key change is a load-bearing edit.** Other call sites pass `placeholder` (e.g. blurhash) and must not break. The change keys off `typeof placeholder === 'object' && 'uri' in placeholder` so blurhash placeholders are untouched.
