# Photo Grid Unification & Fullscreen Viewer Redesign

**Date:** 2026-05-28  
**Branch:** `agents/client-side-thumbnail-upload`

---

## Problem

1. **Inconsistent grid behaviour.** `ImageNoteCard` (single-photo timeline note) renders a fixed 110 px tile beside body text — out of proportion with the 3-col `PhotoBatchGrid` that batch notes and `ReportPhotos` already use. A user sees different tile sizes depending on whether a note has one photo or many.
2. **Fullscreen modal is functional but visually plain.** White header, translucent close circle, no zoom, no chrome-toggle, no blurred placeholder — far below modern photo-viewer expectations.
3. **Thumbnail not surfaced as placeholder.** When the fullscreen modal opens, `expo-image` has nothing to show while it fetches the full 2 MB image. The thumbnail (~15–40 KB) is already in disk-cache from the grid tile but is not passed to the modal.

---

## Goals

- Every photo tile, everywhere in the app, is 1/3 the available row width.
- Single-photo notes in the timeline adopt the same `PhotoBatchGrid` path as batch notes.
- The fullscreen modal adopts a Twitter/X-inspired design: pure black backdrop, translucent overlay header, pinch-to-zoom, double-tap zoom, tap-to-toggle chrome, and the thumbnail as an instant blurred placeholder.
- `thumbnailFileId` flows through every call site that opens the fullscreen modal so the placeholder is always available.

---

## Non-goals

- Re-encoding thumbnails at a higher resolution (stay at 256² q=0.7).
- Swipe-down-to-dismiss gesture.
- Thumbnail strip footer (Instagram/Apple Photos pattern).

---

## Architecture

### Surfaces changed

| Surface | File | Change |
|---|---|---|
| Single-photo timeline note | `apps/mobile/components/notes/ImageNoteCard.tsx` | Replace bespoke 110 px tile + sidebar text layout with `<PhotoBatchGrid attachments={[one]}>` + body text below in a column. |
| Batch-photo timeline note | `apps/mobile/components/notes/PhotoNoteCard.tsx` | No structural change — already uses `PhotoBatchGrid`. |
| Report detail photo strip | `apps/mobile/components/reports/detail/ReportPhotos.tsx` | No structural change — already 3-col `flex-wrap`. Wire `thumbnailFileId` into the `onOpenPhoto` callback payload. |
| `ImagePreviewPhoto` type | `apps/mobile/components/files/ImagePreviewModal.tsx` | Add `thumbnailFileId?: string \| null`. |
| Fullscreen modal | `apps/mobile/components/files/ImagePreviewModal.tsx` | Full visual redesign (see Fullscreen section). |
| `ZoomableImage` primitive | `apps/mobile/components/ui/ZoomableImage.tsx` | New component — wraps Reanimated pinch + double-tap zoom, exposes `onZoomChange(scale)` so the parent can lock/unlock horizontal paging. |
| Plumbing callers | `ReportNotesPane`, `GenerateReportDialogs`, `ReportTabPane`, `ReportPhotos` | Pass `thumbnailFileId` through to `ImagePreviewModal.photos[]`. |

---

## 1. Single-photo note (ImageNoteCard → PhotoBatchGrid)

`ImageNoteCard` today renders a fixed 110 px `<PhotoTile>` to the left of body text. This creates a two-column layout that breaks the visual rhythm of the 3-col grid that multi-photo notes use.

**New layout:**

```
┌─────────────────────────────────────────┐
│ Author · 12 min ago              ⋮      │
│ ┌─────┐ ┌─────┐ ┌─────┐               │
│ │     │ │     │ │     │   (1 photo,   │
│ │ img │ │     │ │     │   2 empty)    │
│ └─────┘ └─────┘ └─────┘               │
│ Optional body text below               │
└─────────────────────────────────────────┘
```

`ImageNoteCard` measures its card interior width via `onLayout` (same pattern as `PhotoNoteCard`) and passes it to `<PhotoBatchGrid containerWidth={...} attachments={[one]}>`. Body text moves below the grid in a `<Text>` block, matching the `PhotoNoteCard` layout.

The `entry.attachments` path already handles single-file notes through `buildAttachments(entry)` — `ImageNoteCard` can call the same helper and then render through `PhotoBatchGrid`.

Because `ImageNoteCard` and `PhotoNoteCard` now share a layout, the former can be simplified significantly. If the two become identical at the data level, they can be merged into a single `PhotoNoteCard` — evaluate during implementation.

---

## 2. Thumbnail as fullscreen placeholder

### Data flow

```
Grid tile (PhotoTile)
  └─ useFileSignedUrl(thumbnailFileId ?? fileId)
       └─ expo-image disk cache is populated

onPress → opens ImagePreviewModal with photos=[{fileId, thumbnailFileId, ...}]
  └─ ImagePreviewBody
       ├─ useFileSignedUrl(fileId) → full image (network)
       └─ useFileSignedUrl(thumbnailFileId) → placeholder (cache hit, instant)
            └─ CachedImage source={fullUrl} placeholder={thumbUrl} transition={200}
```

Since the grid already fetched the thumbnail signed URL, `useFileSignedUrl(thumbnailFileId)` resolves synchronously from React Query's in-memory cache, making the blurred placeholder appear before the modal's opening animation finishes.

### `ImagePreviewPhoto` type update

```ts
export interface ImagePreviewPhoto {
  fileId?: string | null;
  thumbnailFileId?: string | null;   // NEW
  uri?: string | null;
  title?: string;
  cacheKey?: string | null;
}
```

### Caller wiring

All callers that build a `photos[]` array must populate `thumbnailFileId` for each entry. The three callers are:

1. `ReportNotesPane` → `PhotoNoteCard.onOpen` → `GenerateReportDialogs` gallery
2. `ReportPhotos.onOpenPhoto` callback
3. `ImageNoteCard` (after refactor, routed through `PhotoBatchGrid.onOpenFile`)

---

## 3. Fullscreen modal redesign (Twitter/X style)

### Visual design

- **Backdrop:** pure black `#000`, edge-to-edge. Modal `presentationStyle="fullScreen"`, `StatusBar style="light"`.
- **Header (overlay, fade-able):**
  - Absolute-positioned, top of screen, full width.
  - Background: `bg-black/60` (no blur dependency for now; `expo-blur` can be added later).
  - Left: round close button (`bg-white/15` circle, `X` icon in `colors.background`).
  - Center: photo caption (note body text), single line, ellipsized, `text-white` 14 sp.
  - Right: `1 / N` page counter in gallery mode, `text-white/60` 13 sp. Hidden in single-photo mode.
  - Below main row: author name + relative time (`"You · 12 min ago"`), `text-white/50` 12 sp.
- **Chrome toggle:** tap anywhere on the image (not on the header) toggles header opacity 1 ↔ 0 with `withTiming(150)`. Implemented via a `Pressable` covering the full viewport below the header, whose `onPress` flips a Reanimated shared value.
- **Photo rendering:** each photo in the `FlatList` is wrapped in `<ZoomableImage>`.
- **StatusBar:** hidden when chrome is toggled off; restores on close. Driven by same shared value.

### ZoomableImage primitive

New file: `apps/mobile/components/ui/ZoomableImage.tsx`

Responsibilities:
- Accepts `source`, `placeholder`, `width`, `height`, `contentFit`, `cacheKey`.
- Drives `scale`, `translateX`, `translateY` via Reanimated shared values.
- **Pinch-to-zoom:** `Gesture.Pinch()` from `react-native-gesture-handler`. Clamps scale `[1, 4]`. On pinch end, if scale < 1.1 snap back to 1 with `withSpring`.
- **Double-tap zoom:** `Gesture.Tap({ numberOfTaps: 2 })`. Toggles scale between 1 and 2.5. Offsets are reset to (0, 0) on snap-back.
- **Pan while zoomed:** `Gesture.Pan()` simultaneous with pinch. Clamped to keep image within viewport bounds.
- **onZoomChange(isZoomed: boolean):** callback fired when scale crosses the 1.1 threshold, used by the parent to disable horizontal paging.
- Horizontal paging in the `FlatList` is disabled when any item reports `isZoomed = true` via a shared ref.

Note: a similar gesture setup exists in `apps/mobile/screens/camera-capture.tsx` for the pinch-zoom viewfinder. Extract the pinch math into a `usePinchZoom` hook in `apps/mobile/lib/gestures/` to share with `ZoomableImage`.

### Transition

The modal opens with `animationType="slide"` (bottom-up) to match the Twitter/X sheet feel, replacing the current `animationType="fade"`.

---

## 4. Testing

### Unit/integration tests to update

| Test file | What changes |
|---|---|
| `ImageNoteCard.test.tsx` | Remove assertions on 110 px tile + sidebar layout; assert `PhotoBatchGrid` is rendered with one attachment at 1/3 width; assert body text renders below grid. |
| `PhotoBatchGrid.test.tsx` | No changes needed (already covers 1-item case). |
| `ReportPhotos.test.tsx` | Assert `thumbnailFileId` is passed through to the `onOpenPhoto` callback. |
| `ImagePreviewModal.test.tsx` | Assert `thumbnailFileId` signed URL is passed as `placeholder` to `CachedImage`; assert chrome toggles on tap; assert gallery counter shows in multi-photo mode. |

### New tests

| Test file | What it covers |
|---|---|
| `ZoomableImage.test.tsx` | Scale shared value clamps; double-tap toggles; pan stays in bounds; `onZoomChange` fires at threshold. Uses mocked Reanimated + GH gestures. |
| `ImagePreviewModal.test.tsx` | Horizontal scroll disabled when `isZoomed = true`. |

---

## 5. Open questions (resolved)

| Question | Decision |
|---|---|
| Thumbnail resolution | Keep 256² q=0.7 (current) |
| Backdrop colour | Pure black (`#000`) |
| Swipe-down-to-dismiss | Out of scope |
| Chrome design | Twitter/X: translucent overlay, tap-to-toggle |
| Single-photo tile size | 1/3 of row (via `PhotoBatchGrid`) |
| Empty slot placeholders | None — just tile-sized, left-aligned |

---

## 6. Risks

1. **Pinch + pan on Android.** Reanimated 3 + GH v2 gesture composition can have edge cases on Android. Mitigate by keeping `ZoomableImage` a dedicated primitive with isolated tests, and manually testing on Android before merge.
2. **React Query cache timing.** If the grid tile was never rendered for a given photo (e.g. deep link into the fullscreen), `useFileSignedUrl(thumbnailFileId)` will incur a network fetch. The placeholder will be absent for that initial open but will work on subsequent opens. Acceptable.
3. **`usePinchZoom` extraction.** Camera capture uses a gesture setup that may not be easily extracted without regression. If extraction is too risky, duplicate the logic in `ZoomableImage` and leave a TODO for later consolidation.
