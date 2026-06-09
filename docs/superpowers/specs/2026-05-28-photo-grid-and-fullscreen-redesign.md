# Photo Grid Unification & Fullscreen Viewer Redesign

**Date:** 2026-05-28
**Branch:** `agents/client-side-thumbnail-upload`
**Revision:** v2.1 (incorporates spec reviews of v1 and v2)
**Status:** ✅ Shipped

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
| `apps/mobile/components/notes/NoteTimeline.tsx` | Remove `ImageNoteCard` import (routing for `entry.source === 'image'` → `PhotoNoteCard` is already in place). |
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

## 2. Delete `ImageNoteCard` (routing already done in `NoteTimeline`)

`NoteTimeline.tsx` already routes `entry.source === 'image'` to `PhotoNoteCard`. The legacy `ImageNoteCard` is dead code that is no longer reached for new notes but still ships and still mounts its own `ImagePreviewModal` (which would not receive `thumbnailFileId`).

**Remaining work:**
- Delete `apps/mobile/components/notes/ImageNoteCard.tsx`.
- Delete `apps/mobile/components/notes/ImageNoteCard.test.tsx`.
- Remove the import in `NoteTimeline.tsx`.
- Scrub stale docstring references (e.g. `lib/notes/attachments.ts` doc comment, `components/notes/ImageNoteCard.tsx` reference inside `PhotoTile.tsx` comment, anywhere else `rg ImageNoteCard` finds).

`PhotoNoteCard`'s props are a strict superset of `ImageNoteCard`'s (`entry`, `sourceIndex`, `authorName` identical; rest optional). `buildAttachments(entry)` in `lib/notes/attachments.ts` already returns a 1-element array for legacy single-`fileId` image notes. Header rendering via `NoteCardHeader` is identical. There is no behaviour migration — only file removal.

> **Vocabulary note.** `NoteEntry.source` (`'image' | 'voice' | 'text'`) is the runtime discriminant on the client; `ReportNoteRow.kind` (`'photo' | …`) is the API-layer projection. This spec uses `source === 'image'` for client-side filtering and `kind === 'photo'` only where the API row type appears (`ReportPhotos`).

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

**Change:** add an optional `placeholderCacheKey` prop. Merge it into the placeholder **only** when the placeholder is a URI-shaped object. All other shapes pass through untouched.

`expo-image`'s `placeholder` prop accepts: `number` (require'd asset), `string` (blurhash or URL), arrays, `{ uri }`, `{ blurhash }`, `{ thumbhash }`. The merge guard must preserve every non-`{uri}` shape verbatim — otherwise a careless implementation produces `{ blurhash: '…', cacheKey: '…' }`, which `expo-image` accepts but is meaningless.

Implementation sketch:

```ts
const composedPlaceholderBase = placeholder ?? (blurhash ? { blurhash } : undefined);
const composedPlaceholder =
  placeholderCacheKey
  && composedPlaceholderBase
  && typeof composedPlaceholderBase === 'object'
  && !Array.isArray(composedPlaceholderBase)
  && 'uri' in composedPlaceholderBase
    ? { ...composedPlaceholderBase, cacheKey: placeholderCacheKey }
    : composedPlaceholderBase;
```

`ImagePreviewBody` passes `placeholderCacheKey={thumbnailFileId}`. `PhotoTile` and other blurhash/asset callers continue to work unchanged.

The disk cache survives modal close/reopen. Without this change, the placeholder works on first open (signed URL is hot in React Query) but every reopen re-decodes from network.

---

## 6. Fullscreen modal redesign (Twitter/X style)

### Visual design

- **Modal:** `<Modal animationType="fade" presentationStyle="fullScreen" statusBarTranslucent visible={...}>`. `statusBarTranslucent` is required on Android so toggling `<StatusBar hidden>` inside the modal doesn't shift the layout.
- **Backdrop:** pure black `#000`.
- **StatusBar:** declarative — render `<StatusBar style="light" hidden={!chromeVisible} />` from `expo-status-bar` inside `<PreviewContent>`. Reference-counted by `expo-status-bar`, so unmount automatically restores the caller's previous state. **Never call imperative `StatusBar.setHidden` here** — it leaks across modal close.
- **Header (translucent, fade-able overlay):**
  - Absolute-positioned, top of screen, full width, `bg-black/60`.
  - Left: round close button, `bg-white/15`, `X` icon `colors.background`.
  - Center: caption (note body) — `text-white text-sm` 1 line ellipsized. Below it: author + relative time in `text-white/50 text-xs`. Title gets `accessibilityRole="header"`.
  - Right: `1 / N` counter only in gallery mode, `text-white/60 text-xs`. Hidden when `photos.length === 1`.
- **No `ScreenHeader` reuse.** Custom overlay row; a11y labels preserved (close button keeps `accessibilityLabel="Close image preview"`).
- **Chrome toggle:** single-tap on the image fades the header opacity 0 ↔ 1 with `withTiming(150)`. `chromeVisible` is a React `useState<boolean>` (drives both the Reanimated header opacity via `useDerivedValue` and the declarative `<StatusBar hidden>`).
- **Single + double tap arbitration:** see §7 gesture tree.

### Modal entrance

Keep `animationType="fade"`. The Twitter-style slide-up does not behave consistently on Android RN; a Reanimated entering animation is more work than the polish justifies. **Cut from scope.**

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

### Gesture composition tree

RNGH v2 requires explicit composition. The implementer should build the tree exactly as follows:

```ts
const singleTap = Gesture.Tap()
  .numberOfTaps(1)
  .requireExternalGestureToFail(doubleTap, pinch);
const doubleTap = Gesture.Tap().numberOfTaps(2);
const pinch = Gesture.Pinch();
const pan = Gesture.Pan().enabled(scale > 1);

const composed = Gesture.Race(
  Gesture.Exclusive(doubleTap, singleTap),
  Gesture.Simultaneous(pinch, pan),
);
```

Reasoning:
- `Exclusive(doubleTap, singleTap)` — double-tap wins if two taps land in time.
- `Simultaneous(pinch, pan)` — two-finger pinch may also pan; one finger pan continues from the centroid when the second lifts.
- `Race(taps, zoomGroup)` — a finger-down that escalates to pinch cancels the pending tap; a clean tap blocks the zoom group.
- `singleTap.requireExternalGestureToFail(doubleTap, pinch)` — single-tap chrome toggle only fires when neither gesture is going to claim the touch.

Reanimated callbacks: `pinch.onUpdate(({ scale: s, focalX, focalY }) => { … })` runs on the UI thread; communicate to the JS `chromeVisible` toggle and parent `onZoomChange` via `runOnJS`.

---

## 8. Horizontal paging that doesn't fight the zoom gesture

The current `FlatList horizontal pagingEnabled` is fragile when a child gesture wants exclusive ownership. Toggling `scrollEnabled` mid-gesture is a known RNGH v2 footgun on Android.

**Chosen approach: `react-native-pager-view`.**

### Install

`react-native-pager-view` is **not** currently in `apps/mobile/package.json` or `pnpm-lock.yaml`. It is **not** transitively pulled by Expo SDK 55. Install via the Expo-aware command so the SDK-pinned version is resolved correctly:

```bash
cd apps/mobile
npx expo install react-native-pager-view
```

`npx expo install` reads SDK 55's bundled-modules manifest and picks a version compatible with RN 0.83.6 + Reanimated 4.2 + RNGH 2.30 + Fabric/New Arch. Raw `pnpm add` would skip that check.

Because this is a new native module, the plan must:
- Bump the EAS dev-client build (custom dev clients need the new native lib).
- Confirm `apps/mobile/app.json` `newArchEnabled` matches PagerView v6.x's Fabric expectations.
- Smoke-test on Android *and* iOS dev-client before merge.

### Wiring

Replace the `FlatList` in `PreviewContent` with:

```tsx
<PagerView
  initialPage={startIndex}
  scrollEnabled={!anyZoomed}
  onPageSelected={(e) => setCurrentIndex(e.nativeEvent.position)}
  style={{ flex: 1 }}
>
  {photos.map((p) => (
    <View key={p.fileId ?? p.uri}>
      <ZoomableImage ... onZoomChange={(z) => onChildZoomChange(p.fileId, z)} />
    </View>
  ))}
</PagerView>
```

### "any zoomed" coordination — `useState`, not `useRef`

A `useRef` mutation does not re-render the `PagerView`, so `scrollEnabled` would never flip. Use React state:

```ts
const [anyZoomed, setAnyZoomed] = useState(false);
const zoomedSet = useRef<Set<string>>(new Set());

const onChildZoomChange = useCallback((key: string, isZoomed: boolean) => {
  if (isZoomed) zoomedSet.current.add(key);
  else zoomedSet.current.delete(key);
  setAnyZoomed(zoomedSet.current.size > 0);
}, []);
```

`ZoomableImage.onZoomChange` calls through `runOnJS` so it flips the JS-side state from the Reanimated worklet. PagerView re-renders ~twice per zoom in/out — negligible. Do **not** use a `useRef<boolean>` flag; do **not** use a `SharedValue<boolean>` + animated `scrollEnabled` (added mechanism with no win since the gesture starts on JS thread anyway).

---

## 9. Testing

### Unit/integration tests to update

| Test file | What changes |
|---|---|
| `PhotoBatchGrid.test.tsx` | Add a 1-attachment case asserting `tileSize ≈ containerWidth/3` and not full-width. Update the 320-px-container expected size to match the new formula. |
| `NoteTimeline.test.tsx` | Verify the existing `entry.source === 'image'` → `PhotoNoteCard` route still holds after the `ImageNoteCard` import is removed (regression guard only — no behaviour change). |
| `ImagePreviewModal.test.tsx` | Assert `thumbnailFileId` URL is passed as `placeholder` to `CachedImage` with `placeholderCacheKey={thumbnailFileId}`. Assert single-tap toggles header opacity. Assert pager `scrollEnabled` flips when zoom changes. |
| `ReportPhotos.test.tsx` | No callback change (per step 3). |
| `CachedImage.test.tsx` (if absent, add) | `placeholderCacheKey` is merged into the placeholder source. |

### New tests

| Test file | What it covers |
|---|---|
| `ZoomableImage.test.tsx` | Scale clamps `[1, 4]`. Double-tap toggles 1 ↔ 2.5. Pan stays in bounds. `onZoomChange` fires at threshold. |
| `gallery-thumbnail-placeholder.integration.test.tsx` | **Pitfall 13 / R5 — default-wiring test.** Mount a `PhotoBatchGrid` with a single attachment against a real `QueryClient` and a captured-fetch mock. Assert the cache contains the thumbnail URL. Mount `ImagePreviewModal` against the **same** `QueryClient` and assert `useFileSignedUrl(thumbnailFileId)` returns `data` synchronously and is forwarded to `CachedImage.placeholder` with `placeholderCacheKey={thumbnailFileId}`. **No fake hook.** **No `queryClient.setQueryData` priming** — the cache must be populated by the real grid mount running the real hook. **Assert the captured fetch was called exactly once for the thumbnail URL during grid mount and zero additional times after modal mount.** That's the load-bearing assertion. |

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

1. **`react-native-pager-view` is a new native module.** Installed via `npx expo install` (§8). Requires a fresh EAS dev-client build before this branch can be smoke-tested. Verify `apps/mobile/app.json` `newArchEnabled` against PagerView v6.x's Fabric expectations.
2. **Reanimated 3 + RNGH v2 pinch/pan/tap composition on Android.** `ZoomableImage` uses the explicit gesture tree from §7. Manual Android QA covering: two-finger pinch ending with one finger lifting (should transition to single-finger pan, not cancel), double-tap on the edge of the image (focal point clamping), single-tap during a slow swipe (should not toggle chrome), pager swipe interrupting a pinch.
3. **React Query cache cold-start.** If the modal is opened without a prior grid mount (deep link, share-sheet), the thumbnail hook will incur a network fetch and the placeholder will be absent for that first open. Acceptable.
4. **`CachedImage` placeholder cache-key change is a load-bearing edit.** Other call sites pass `placeholder` as a blurhash, asset, or array. The shape guard in §5 (`typeof === 'object' && !Array.isArray && 'uri' in placeholder`) preserves every non-`{uri}` shape verbatim. Covered by a new `CachedImage.test.tsx` blurhash-passthrough case.
5. **Default-wiring test must run the real hook.** The integration test in §9 forbids `setQueryData` priming and fake hooks. If a future contributor relaxes this to "make the test faster", Pitfall 13 silently returns.
