# Photo Grid and Fullscreen Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every photo surface use a 3-column thumbnail grid, thread
thumbnail ids into the fullscreen viewer, and replace the image preview modal
with a Twitter/X-style black viewer with thumbnail placeholder, paging, and
zoom gestures.

**Architecture:** Keep the existing client-side thumbnail upload pipeline
unchanged. The implementation is UI-only: fix `PhotoBatchGrid` sizing, delete
the dead single-image card, widen gallery item types with `thumbnailFileId`,
add a local `ZoomableImage` primitive, and swap the modal's `FlatList` for
`react-native-pager-view` coordinated by React state. Thumbnail placeholder
reuse depends on default `useFileSignedUrl` + React Query wiring, so tests must
exercise the real hook path rather than priming cache state.

**Tech Stack:** Expo SDK 55, React Native 0.83, NativeWind v4, `expo-image`,
`expo-status-bar`, React Query, Reanimated 4, RNGH 2, Vitest,
`react-test-renderer`, `react-native-pager-view`.

---

## File structure

- `apps/mobile/package.json` and `pnpm-lock.yaml` — add
  `react-native-pager-view` via `npx expo install`.
- `app.json` — verify New Architecture configuration; do not change unless
  Expo config reports an explicit incompatibility.
- `apps/mobile/components/notes/PhotoBatchGrid.tsx` — compute tile size from
  three columns unconditionally.
- `apps/mobile/components/notes/PhotoBatchGrid.test.tsx` — pin one-, two-,
  three-, and overflow-grid sizing.
- `apps/mobile/components/notes/ImageNoteCard.tsx` — delete.
- `apps/mobile/components/notes/ImageNoteCard.test.tsx` — delete.
- `apps/mobile/components/notes/NoteTimeline.tsx` — remove stale import if it
  exists; keep current `entry.source === 'image'` route to `PhotoNoteCard`.
- `apps/mobile/components/notes/NoteTimeline.test.tsx` — add a regression
  guard proving legacy single-file image notes render through
  `PhotoNoteCard`/`PhotoBatchGrid`.
- `apps/mobile/lib/notes/attachments.ts` — remove `ImageNoteCard` from code
  comments.
- `apps/mobile/components/notes/PhotoTile.tsx` — remove stale comment
  references if `rg ImageNoteCard apps/mobile` finds any.
- `docs/v4/arch-mobile.md`, `docs/v4/arch-mobile-skeletons.md`, and
  `docs/v4/arch-storage.md` — update architectural references from
  `ImageNoteCard`/old grid tile names to `PhotoNoteCard`,
  `PhotoBatchGrid`, and `PhotoTile`.
- `apps/mobile/components/ui/CachedImage.tsx` — add
  `placeholderCacheKey` and URI-shaped placeholder cache-key merging.
- `apps/mobile/components/ui/CachedImage.test.tsx` — create focused tests for
  source cache key, placeholder cache key, and blurhash pass-through.
- `apps/mobile/features/generate/GenerateReportProvider.tsx` — add
  `thumbnailFileId` to `PreviewSurface.photoGallery` and populate it from
  timeline attachments.
- `apps/mobile/screens/report-notes.tsx` — add `thumbnailFileId` to the inline
  gallery builder.
- `apps/mobile/screens/saved-report.tsx` — add `thumbnailFileId` to the inline
  gallery builder.
- `apps/mobile/components/files/ZoomableImage.tsx` — new photo-viewer-specific
  pinch, pan, double-tap, and single-tap wrapper around `CachedImage`.
- `apps/mobile/components/files/ZoomableImage.test.tsx` — create math and
  render tests for the zoom primitive.
- `apps/mobile/components/files/ImagePreviewModal.tsx` — add
  `thumbnailFileId`, use declarative `StatusBar`, render a translucent
  overlay header, use `PagerView`, pass thumbnail placeholders, and coordinate
  zoom state with paging state.
- `apps/mobile/components/files/ImagePreviewModal.test.tsx` — update modal
  tests for thumbnail placeholders, chrome toggle, pager state, and local URI
  behavior.
- `apps/mobile/components/files/gallery-thumbnail-placeholder.integration.test.tsx`
  — new default-wiring regression test for shared React Query thumbnail cache.

---

### Task 1: Add `react-native-pager-view`

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `pnpm-lock.yaml`
- Check: `app.json`

- [ ] **Step 1: Confirm dependency is currently absent**

Run from the repository root:

```bash
node -e "const pkg=require('./apps/mobile/package.json'); console.log(pkg.dependencies['react-native-pager-view'] ?? 'missing')"
```

Expected: `missing`.

- [ ] **Step 2: Install the SDK-compatible native module**

Run from `apps/mobile` so Expo chooses the SDK 55 compatible version:

```bash
cd apps/mobile
npx expo install react-native-pager-view
cd ../..
```

Expected: `apps/mobile/package.json` gains `react-native-pager-view` and
`pnpm-lock.yaml` changes.

- [ ] **Step 3: Verify Expo New Architecture config**

Run:

```bash
npx expo config --json > /tmp/harpa-mobile-expo-config.json
node - <<'NODE'
const cfg = require('/tmp/harpa-mobile-expo-config.json');
const value = cfg.newArchEnabled ?? cfg.expo?.newArchEnabled ?? 'not-set';
console.log(String(value));
NODE
rm /tmp/harpa-mobile-expo-config.json
```

Expected: `true` or `not-set`. If this prints `false`, stop and ask before
continuing because PagerView v6.x must be verified against the app's explicit
New Architecture setting.

- [ ] **Step 4: Run dependency sanity checks**

Run:

```bash
pnpm --filter @harpa/mobile typecheck
```

Expected: TypeScript passes. No mobile source has changed yet; failures here
are dependency-resolution failures that must be fixed before UI work.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml
git commit -m "chore(mobile): add pager view dependency" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Make `PhotoBatchGrid` always use three columns

**Files:**
- Modify: `apps/mobile/components/notes/PhotoBatchGrid.test.tsx`
- Modify: `apps/mobile/components/notes/PhotoBatchGrid.tsx`

- [ ] **Step 1: Add failing sizing tests**

In `PhotoBatchGrid.test.tsx`, add this helper near the existing tests:

```ts
function tileWidth(tree: ReturnType<typeof render>, testID: string): number {
  const node = tree.root.findAllByProps({ testID })
    .find((n) => typeof n.type !== 'function');
  expect(node).toBeDefined();
  const style = node!.props.style as
    | { width: number }
    | Array<{ width?: number }>;
  return Array.isArray(style)
    ? style.find((s) => s && typeof s.width === 'number')!.width!
    : style.width;
}
```

Then replace the body of `describe('PhotoBatchGrid sizing', () => { ... })`
with:

```ts
describe('PhotoBatchGrid sizing', () => {
  // GAP = 6, COLUMNS = 3 -> tileSize = floor((320 - 12) / 3) = 102.
  it('keeps a single attachment at one third of the container', () => {
    const tree = render(
      <PhotoBatchGrid attachments={[saved(0)]} containerWidth={320} />,
    );

    expect(tileWidth(tree, 'batch-grid-tile-0')).toBe(102);
  });

  it('keeps two attachments in the same three-column grid', () => {
    const tree = render(
      <PhotoBatchGrid attachments={[saved(0), saved(1)]} containerWidth={320} />,
    );

    expect(tileWidth(tree, 'batch-grid-tile-0')).toBe(102);
    expect(tileWidth(tree, 'batch-grid-tile-1')).toBe(102);
  });

  it('fits 3 tiles into a 320px container without clipping', () => {
    const items: Attachment[] = [saved(0), saved(1), saved(2)];
    const tree = render(
      <PhotoBatchGrid attachments={items} containerWidth={320} />,
    );

    expect(tileWidth(tree, 'batch-grid-tile-0')).toBe(102);
    expect(tileWidth(tree, 'batch-grid-tile-1')).toBe(102);
    expect(tileWidth(tree, 'batch-grid-tile-2')).toBe(102);
  });

  it('renders +N overflow on the 9th tile when more than 9 attachments', () => {
    const items = Array.from({ length: 11 }, (_, i) => saved(i));
    const tree = render(
      <PhotoBatchGrid attachments={items} containerWidth={320} />,
    );

    expect(
      tree.root.findAllByProps({ testID: 'batch-grid-tile-8' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'batch-grid-tile-9' }),
    ).toHaveLength(0);
    expect(tileWidth(tree, 'batch-grid-tile-8')).toBe(102);

    const overflow = tree.root.findByProps({
      testID: 'batch-grid-tile-8-overflow',
    });
    expect(JSON.stringify(overflow.props.children)).toContain('3');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
pnpm --filter @harpa/mobile test -- components/notes/PhotoBatchGrid.test.tsx
```

Expected: the new one- and two-attachment tests fail because the current grid
computes one or two columns.

- [ ] **Step 3: Implement the grid fix**

In `PhotoBatchGrid.tsx`, replace:

```ts
const cols = Math.min(visible.length, COLUMNS);
const tileSize = Math.max(0, Math.floor((containerWidth - GAP * (cols - 1)) / cols));
```

with:

```ts
const tileSize = Math.max(
  0,
  Math.floor((containerWidth - GAP * (COLUMNS - 1)) / COLUMNS),
);
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
pnpm --filter @harpa/mobile test -- components/notes/PhotoBatchGrid.test.tsx
```

Expected: all `PhotoBatchGrid` tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/notes/PhotoBatchGrid.tsx \
  apps/mobile/components/notes/PhotoBatchGrid.test.tsx
git commit -m "fix(mobile): keep photo batches in a three-column grid" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Delete dead `ImageNoteCard` and update references

**Files:**
- Delete: `apps/mobile/components/notes/ImageNoteCard.tsx`
- Delete: `apps/mobile/components/notes/ImageNoteCard.test.tsx`
- Modify: `apps/mobile/components/notes/NoteTimeline.tsx`
- Modify: `apps/mobile/components/notes/NoteTimeline.test.tsx`
- Modify: `apps/mobile/lib/notes/attachments.ts`
- Modify: `docs/v4/arch-mobile.md`
- Modify: `docs/v4/arch-mobile-skeletons.md`
- Modify: `docs/v4/arch-storage.md`

- [ ] **Step 1: Add a regression test for legacy single-file image rows**

Append this test to `NoteTimeline.test.tsx`:

```ts
it('renders a legacy single-file image note through PhotoNoteCard', () => {
  const note: NoteEntry = {
    id: 'not_img_1',
    text: 'Site photo',
    addedAt: 1700000000000,
    source: 'image',
    fileId: 'fil_full_1',
    thumbnailFileId: 'fil_thumb_1',
  };

  const opened: Array<{ fileId: string; sourceIndex: number }> = [];
  const tree = wrap(
    <NoteTimeline
      notes={[note]}
      onOpenPhoto={(fileId, sourceIndex) => {
        opened.push({ fileId, sourceIndex });
      }}
    />,
  );

  act(() => {
    tree.root.findByProps({ testID: 'note-row-0-measure' }).props.onLayout({
      nativeEvent: { layout: { width: 320 } },
    });
  });

  const tile = tree.root.findByProps({ testID: 'batch-grid-tile-0' });
  act(() => {
    tile.props.onPress();
  });

  expect(opened).toEqual([{ fileId: 'fil_full_1', sourceIndex: 0 }]);
});
```

- [ ] **Step 2: Run the test before deletion**

Run:

```bash
pnpm --filter @harpa/mobile test -- components/notes/NoteTimeline.test.tsx
```

Expected: the new test passes because `NoteTimeline` already routes
`entry.source === 'image'` through `PhotoNoteCard`.

- [ ] **Step 3: Remove dead component files**

Run:

```bash
rm apps/mobile/components/notes/ImageNoteCard.tsx
rm apps/mobile/components/notes/ImageNoteCard.test.tsx
```

- [ ] **Step 4: Remove stale import if present**

Run:

```bash
grep -n "ImageNoteCard" apps/mobile/components/notes/NoteTimeline.tsx || true
```

Expected: no output. If an import is present, delete that import only; keep the
existing `PhotoNoteCard` branch intact.

- [ ] **Step 5: Update code comments**

In `apps/mobile/lib/notes/attachments.ts`, replace:

```ts
 * ImageNoteCard, PhotoNoteRow, ReportPhotos) so they can feed PhotoTile
```

with:

```ts
 * PhotoNoteCard, PhotoNoteRow, ReportPhotos) so they can feed PhotoTile
```

Run:

```bash
rg "ImageNoteCard" apps/mobile
```

Expected: no output.

- [ ] **Step 6: Update architecture docs in the same commit**

Make these exact documentation edits:

In `docs/v4/arch-mobile.md`, remove the `ImageNoteCard.tsx` line from the
`components/notes/` tree.

In `docs/v4/arch-mobile-skeletons.md`, replace the reference section with:

```md
`apps/mobile/components/notes/PhotoNoteCard.tsx` is the reference:
the card reserves the measured grid width before rendering
`PhotoBatchGrid`, and each tile keeps a fixed square aspect ratio so
skeleton / pending / loaded states do not resize the row.
```

In `docs/v4/arch-storage.md`, replace the timeline thumbnail paragraph with:

```md
Everywhere a photo appears outside the fullscreen preview (the
saved-report 3-column grid `ReportPhotos`, the Generate-screen
timeline grid in `PhotoNoteCard`, and the saved-report Notes pane row)
we render the shared `apps/mobile/components/notes/PhotoTile.tsx`
through `PhotoBatchGrid` or `ReportPhotos`. The tile resolves
`thumbnailFileId ?? fileId` via `useFileSignedUrl` and renders the
bytes through `CachedImage` (`expo-image` + disk cache, keyed by the
resolved id).
```

Also replace the two later `ImageNoteCard` references in
`docs/v4/arch-storage.md` with `PhotoNoteCard`.

- [ ] **Step 7: Run tests and reference scan**

Run:

```bash
pnpm --filter @harpa/mobile test -- components/notes/NoteTimeline.test.tsx
rg "ImageNoteCard" apps/mobile docs/v4
```

Expected: the test passes. The `rg` command may still show old historical
phase-plan references; no result may appear under active architecture docs or
mobile source.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/components/notes/NoteTimeline.tsx \
  apps/mobile/components/notes/NoteTimeline.test.tsx \
  apps/mobile/lib/notes/attachments.ts \
  docs/v4/arch-mobile.md \
  docs/v4/arch-mobile-skeletons.md \
  docs/v4/arch-storage.md
git rm apps/mobile/components/notes/ImageNoteCard.tsx \
  apps/mobile/components/notes/ImageNoteCard.test.tsx
git commit -m "refactor(mobile): remove dead image note card" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Add placeholder cache keys to `CachedImage`

**Files:**
- Create: `apps/mobile/components/ui/CachedImage.test.tsx`
- Modify: `apps/mobile/components/ui/CachedImage.tsx`

- [ ] **Step 1: Create failing `CachedImage` tests**

Create `apps/mobile/components/ui/CachedImage.test.tsx`:

```ts
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { create } from 'react-test-renderer';

import { CachedImage } from './CachedImage';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));

describe('CachedImage', () => {
  it('merges cacheKey into URI-shaped source objects', () => {
    const tree = create(
      <CachedImage
        source={{ uri: 'https://r2.example.com/full.jpg?sig=abc' }}
        cacheKey="fil_full"
      />,
    );

    const img = tree.root.findByType('rn-expo-image');
    expect(img.props.source).toEqual({
      uri: 'https://r2.example.com/full.jpg?sig=abc',
      cacheKey: 'fil_full',
    });
  });

  it('merges placeholderCacheKey into URI-shaped placeholders', () => {
    const tree = create(
      <CachedImage
        source={{ uri: 'https://r2.example.com/full.jpg?sig=abc' }}
        placeholder={{ uri: 'https://r2.example.com/thumb.jpg?sig=def' }}
        placeholderCacheKey="fil_thumb"
      />,
    );

    const img = tree.root.findByType('rn-expo-image');
    expect(img.props.placeholder).toEqual({
      uri: 'https://r2.example.com/thumb.jpg?sig=def',
      cacheKey: 'fil_thumb',
    });
  });

  it('leaves blurhash placeholders untouched', () => {
    const blurhash = 'LEHV6nWB2yk8pyo0adR*.7kCMdnj';
    const tree = create(
      <CachedImage
        source={{ uri: 'https://r2.example.com/full.jpg?sig=abc' }}
        blurhash={blurhash}
        placeholderCacheKey="fil_thumb"
      />,
    );

    const img = tree.root.findByType('rn-expo-image');
    expect(img.props.placeholder).toEqual({ blurhash });
  });

  it('leaves array placeholders untouched', () => {
    const placeholder = [
      { uri: 'https://r2.example.com/a.jpg' },
      { uri: 'https://r2.example.com/b.jpg' },
    ];
    const tree = create(
      <CachedImage
        source={{ uri: 'https://r2.example.com/full.jpg?sig=abc' }}
        placeholder={placeholder}
        placeholderCacheKey="fil_thumb"
      />,
    );

    const img = tree.root.findByType('rn-expo-image');
    expect(img.props.placeholder).toBe(placeholder);
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run:

```bash
pnpm --filter @harpa/mobile test -- components/ui/CachedImage.test.tsx
```

Expected: the placeholder cache-key test fails because
`placeholderCacheKey` is not implemented.

- [ ] **Step 3: Implement `placeholderCacheKey`**

In `CachedImage.tsx`, add this prop to `CachedImageProps` after `cacheKey`:

```ts
  /**
   * Stable cache key for URI-shaped placeholders. Used when a thumbnail
   * signed URL has already been cached under its file id.
   */
  placeholderCacheKey?: string;
```

Destructure it from props:

```ts
  placeholderCacheKey,
```

Replace:

```ts
const composedPlaceholder = placeholder ?? (blurhash ? { blurhash } : undefined);
```

with:

```ts
const composedPlaceholderBase = placeholder ?? (blurhash ? { blurhash } : undefined);
const composedPlaceholder =
  placeholderCacheKey &&
  composedPlaceholderBase &&
  typeof composedPlaceholderBase === 'object' &&
  !Array.isArray(composedPlaceholderBase) &&
  'uri' in composedPlaceholderBase
    ? { ...(composedPlaceholderBase as object), cacheKey: placeholderCacheKey }
    : composedPlaceholderBase;
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
pnpm --filter @harpa/mobile test -- components/ui/CachedImage.test.tsx
```

Expected: all `CachedImage` tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/ui/CachedImage.tsx \
  apps/mobile/components/ui/CachedImage.test.tsx
git commit -m "feat(mobile): cache fullscreen thumbnail placeholders" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Thread `thumbnailFileId` through gallery builders

**Files:**
- Modify: `apps/mobile/components/files/ImagePreviewModal.tsx`
- Modify: `apps/mobile/features/generate/GenerateReportProvider.tsx`
- Modify: `apps/mobile/screens/report-notes.tsx`
- Modify: `apps/mobile/screens/saved-report.tsx`
- Modify: `apps/mobile/components/files/ImagePreviewModal.test.tsx`

- [ ] **Step 1: Widen the modal photo type**

In `ImagePreviewModal.tsx`, change `ImagePreviewPhoto` to:

```ts
export interface ImagePreviewPhoto {
  fileId?: string | null;
  thumbnailFileId?: string | null;
  uri?: string | null;
  title?: string;
  cacheKey?: string | null;
}
```

In the `resolvedPhotos` fallback, include `thumbnailFileId: null`:

```ts
return [{ uri, fileId, thumbnailFileId: null, title, cacheKey }];
```

- [ ] **Step 2: Widen `GenerateReportProvider` gallery shape**

In `GenerateReportProvider.tsx`, change `PreviewSurface.photoGallery` to:

```ts
  photoGallery: ReadonlyArray<{
    fileId: string;
    thumbnailFileId: string | null;
    title: string;
    cacheKey: string;
  }>;
```

In the `photoGallery` builder, change the pushed item to:

```ts
items.push({
  fileId: att.fileId,
  thumbnailFileId: att.thumbnailFileId ?? null,
  title: entry.text?.trim() || 'Photo',
  cacheKey: att.fileId,
});
```

- [ ] **Step 3: Widen the report-notes gallery builder**

In `apps/mobile/screens/report-notes.tsx`, change the `.map` result to:

```ts
.map((n) => ({
  fileId: n.fileId,
  thumbnailFileId: n.thumbnailFileId ?? null,
  title: n.body?.trim() || 'Photo',
  cacheKey: n.fileId,
}));
```

- [ ] **Step 4: Widen the saved-report gallery builder**

In `apps/mobile/screens/saved-report.tsx`, change the `.map` result to:

```ts
.map((n) => ({
  fileId: n.fileId,
  thumbnailFileId: n.thumbnailFileId ?? null,
  title: n.body?.trim() || 'Photo',
  cacheKey: n.fileId,
}));
```

- [ ] **Step 5: Add modal regression test for accepted thumbnail prop**

In `ImagePreviewModal.test.tsx`, add this test after the `fileId` test:

```ts
it('accepts thumbnailFileId on gallery photos without widening onOpenPhoto callbacks', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = wrap(
      <ImagePreviewModal
        visible
        photos={[
          {
            fileId: 'fil_full_1',
            thumbnailFileId: 'fil_thumb_1',
            title: 'Gallery photo',
            cacheKey: 'fil_full_1',
          },
        ]}
        initialIndex={0}
        onClose={() => {}}
      />,
    );
  });

  expect(calls.some((c) => c.includes('/files/fil_full_1/url'))).toBe(true);
});
```

This test only pins the widened type in this task. Placeholder behavior is
added in Task 7 after `ZoomableImage` exists.

- [ ] **Step 6: Run focused checks**

Run:

```bash
pnpm --filter @harpa/mobile test -- components/files/ImagePreviewModal.test.tsx
pnpm --filter @harpa/mobile typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/components/files/ImagePreviewModal.tsx \
  apps/mobile/components/files/ImagePreviewModal.test.tsx \
  apps/mobile/features/generate/GenerateReportProvider.tsx \
  apps/mobile/screens/report-notes.tsx \
  apps/mobile/screens/saved-report.tsx
git commit -m "feat(mobile): thread thumbnails into photo galleries" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Add the `ZoomableImage` primitive

**Files:**
- Create: `apps/mobile/components/files/ZoomableImage.tsx`
- Create: `apps/mobile/components/files/ZoomableImage.test.tsx`

- [ ] **Step 1: Write failing zoom math tests**

Create `apps/mobile/components/files/ZoomableImage.test.tsx`:

```ts
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { create } from 'react-test-renderer';

import {
  DOUBLE_TAP_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  ZOOMED_THRESHOLD,
  ZoomableImage,
  clampScale,
  clampTranslation,
  isZoomedScale,
  nextDoubleTapScale,
} from './ZoomableImage';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));

vi.mock('react-native-gesture-handler', () => {
  const makeGesture = () => {
    const gesture: Record<string, unknown> = {
      numberOfTaps: () => gesture,
      requireExternalGestureToFail: () => gesture,
      onBegin: () => gesture,
      onUpdate: () => gesture,
      onEnd: () => gesture,
      enabled: () => gesture,
    };
    return gesture;
  };
  return {
    Gesture: {
      Tap: makeGesture,
      Pinch: makeGesture,
      Pan: makeGesture,
      Race: (...gestures: unknown[]) => ({ type: 'race', gestures }),
      Exclusive: (...gestures: unknown[]) => ({ type: 'exclusive', gestures }),
      Simultaneous: (...gestures: unknown[]) => ({
        type: 'simultaneous',
        gestures,
      }),
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      React.createElement('rn-gesture-detector', null, children),
  };
});

vi.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'rn-animated-view' },
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  useAnimatedStyle: (fn: () => unknown) => fn(),
  useSharedValue: (value: unknown) => ({ value }),
  withSpring: (value: unknown) => value,
  withTiming: (value: unknown) => value,
}));

describe('ZoomableImage math', () => {
  it('clamps scale to the supported range', () => {
    expect(clampScale(0.25)).toBe(MIN_SCALE);
    expect(clampScale(2)).toBe(2);
    expect(clampScale(9)).toBe(MAX_SCALE);
  });

  it('toggles double-tap scale between reset and zoomed states', () => {
    expect(nextDoubleTapScale(MIN_SCALE)).toBe(DOUBLE_TAP_SCALE);
    expect(nextDoubleTapScale(ZOOMED_THRESHOLD + 0.1)).toBe(MIN_SCALE);
  });

  it('detects the zoomed threshold', () => {
    expect(isZoomedScale(1)).toBe(false);
    expect(isZoomedScale(ZOOMED_THRESHOLD)).toBe(false);
    expect(isZoomedScale(ZOOMED_THRESHOLD + 0.01)).toBe(true);
  });

  it('clamps translation so image edges do not reveal backdrop', () => {
    expect(clampTranslation(200, 2, 300)).toBe(150);
    expect(clampTranslation(-200, 2, 300)).toBe(-150);
    expect(clampTranslation(40, 2, 300)).toBe(40);
    expect(clampTranslation(40, 1, 300)).toBe(0);
  });
});

describe('ZoomableImage render', () => {
  it('renders CachedImage with full and placeholder cache keys', () => {
    const tree = create(
      <ZoomableImage
        source={{ uri: 'https://r2.example.com/full.jpg' }}
        placeholder={{ uri: 'https://r2.example.com/thumb.jpg' }}
        cacheKey="fil_full"
        placeholderCacheKey="fil_thumb"
        width={300}
        height={400}
        accessibilityLabel="Preview"
      />,
    );

    const img = tree.root.findByType('rn-expo-image');
    expect(img.props.source).toEqual({
      uri: 'https://r2.example.com/full.jpg',
      cacheKey: 'fil_full',
    });
    expect(img.props.placeholder).toEqual({
      uri: 'https://r2.example.com/thumb.jpg',
      cacheKey: 'fil_thumb',
    });
    expect(img.props.accessibilityLabel).toBe('Preview');
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run:

```bash
pnpm --filter @harpa/mobile test -- components/files/ZoomableImage.test.tsx
```

Expected: import failure because `ZoomableImage.tsx` does not exist.

- [ ] **Step 3: Create `ZoomableImage.tsx`**

Create `apps/mobile/components/files/ZoomableImage.tsx`:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { CachedImage } from '@/components/ui/CachedImage';

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2.5;
export const ZOOMED_THRESHOLD = 1.1;

export interface ZoomableImageProps {
  source: { uri: string };
  placeholder?: { uri: string };
  cacheKey?: string;
  placeholderCacheKey?: string;
  width: number;
  height: number;
  contentFit?: 'contain' | 'cover';
  onZoomChange?: (isZoomed: boolean) => void;
  onSingleTap?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export function clampScale(value: number): number {
  'worklet';
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export function nextDoubleTapScale(currentScale: number): number {
  'worklet';
  return currentScale > ZOOMED_THRESHOLD ? MIN_SCALE : DOUBLE_TAP_SCALE;
}

export function isZoomedScale(value: number): boolean {
  'worklet';
  return value > ZOOMED_THRESHOLD;
}

export function clampTranslation(
  value: number,
  scale: number,
  viewportSize: number,
): number {
  'worklet';
  if (scale <= MIN_SCALE) return 0;
  const max = ((scale - MIN_SCALE) * viewportSize) / 2;
  return Math.min(max, Math.max(-max, value));
}

function anchoredTranslation(
  currentTranslation: number,
  currentScale: number,
  nextScale: number,
  focalCoordinate: number,
  viewportSize: number,
): number {
  'worklet';
  if (nextScale <= MIN_SCALE) return 0;
  const focalFromCenter = focalCoordinate - viewportSize / 2;
  const ratio = nextScale / Math.max(currentScale, MIN_SCALE);
  return clampTranslation(
    currentTranslation * ratio + focalFromCenter * (1 - ratio),
    nextScale,
    viewportSize,
  );
}

export function ZoomableImage({
  source,
  placeholder,
  cacheKey,
  placeholderCacheKey,
  width,
  height,
  contentFit = 'contain',
  onZoomChange,
  onSingleTap,
  accessibilityLabel,
  testID = 'zoomable-image',
}: ZoomableImageProps) {
  const [panEnabled, setPanEnabled] = useState(false);
  const scale = useSharedValue(MIN_SCALE);
  const startScale = useSharedValue(MIN_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startTranslateX = useSharedValue(0);
  const startTranslateY = useSharedValue(0);
  const wasZoomed = useSharedValue(false);

  const reportZoomed = useCallback(
    (nextZoomed: boolean) => {
      setPanEnabled(nextZoomed);
      onZoomChange?.(nextZoomed);
    },
    [onZoomChange],
  );

  const maybeReportZoomed = useCallback(
    (nextScale: number) => {
      'worklet';
      const nextZoomed = isZoomedScale(nextScale);
      if (nextZoomed !== wasZoomed.value) {
        wasZoomed.value = nextZoomed;
        runOnJS(reportZoomed)(nextZoomed);
      }
    },
    [reportZoomed],
  );

  const reset = useCallback(() => {
    'worklet';
    scale.value = withSpring(MIN_SCALE);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    maybeReportZoomed(MIN_SCALE);
  }, [maybeReportZoomed, scale, translateX, translateY]);

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd((event, success) => {
          if (!success) return;
          const nextScale = nextDoubleTapScale(scale.value);
          if (nextScale === MIN_SCALE) {
            reset();
            return;
          }
          translateX.value = withTiming(
            anchoredTranslation(0, MIN_SCALE, nextScale, event.x, width),
          );
          translateY.value = withTiming(
            anchoredTranslation(0, MIN_SCALE, nextScale, event.y, height),
          );
          scale.value = withTiming(nextScale);
          maybeReportZoomed(nextScale);
        }),
    [height, maybeReportZoomed, reset, scale, translateX, translateY, width],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          startScale.value = scale.value;
          startTranslateX.value = translateX.value;
          startTranslateY.value = translateY.value;
        })
        .onUpdate((event) => {
          const nextScale = clampScale(startScale.value * event.scale);
          scale.value = nextScale;
          translateX.value = anchoredTranslation(
            startTranslateX.value,
            startScale.value,
            nextScale,
            event.focalX,
            width,
          );
          translateY.value = anchoredTranslation(
            startTranslateY.value,
            startScale.value,
            nextScale,
            event.focalY,
            height,
          );
          maybeReportZoomed(nextScale);
        })
        .onEnd(() => {
          if (scale.value < ZOOMED_THRESHOLD) reset();
        }),
    [
      height,
      maybeReportZoomed,
      reset,
      scale,
      startScale,
      startTranslateX,
      startTranslateY,
      translateX,
      translateY,
      width,
    ],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(panEnabled)
        .onBegin(() => {
          startTranslateX.value = translateX.value;
          startTranslateY.value = translateY.value;
        })
        .onUpdate((event) => {
          translateX.value = clampTranslation(
            startTranslateX.value + event.translationX,
            scale.value,
            width,
          );
          translateY.value = clampTranslation(
            startTranslateY.value + event.translationY,
            scale.value,
            height,
          );
        }),
    [
      height,
      panEnabled,
      scale,
      startTranslateX,
      startTranslateY,
      translateX,
      translateY,
      width,
    ],
  );

  const singleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(1)
        .requireExternalGestureToFail(doubleTap, pinch)
        .onEnd((_event, success) => {
          if (success && onSingleTap) runOnJS(onSingleTap)();
        }),
    [doubleTap, onSingleTap, pinch],
  );

  const composedGesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.Exclusive(doubleTap, singleTap),
        Gesture.Simultaneous(pinch, pan),
      ),
    [doubleTap, pan, pinch, singleTap],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <View
        className="items-center justify-center overflow-hidden"
        style={{ width, height }}
        testID={testID}
      >
        <Animated.View style={animatedStyle}>
          <CachedImage
            source={source}
            placeholder={placeholder}
            cacheKey={cacheKey}
            placeholderCacheKey={placeholderCacheKey}
            style={{ width, height }}
            contentFit={contentFit}
            accessibilityLabel={accessibilityLabel}
            testID={`${testID}-image`}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
pnpm --filter @harpa/mobile test -- components/files/ZoomableImage.test.tsx
```

Expected: all `ZoomableImage` tests pass.

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm --filter @harpa/mobile typecheck
```

Expected: typecheck passes.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/files/ZoomableImage.tsx \
  apps/mobile/components/files/ZoomableImage.test.tsx
git commit -m "feat(mobile): add zoomable image viewer primitive" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Redesign `ImagePreviewModal`

**Files:**
- Modify: `apps/mobile/components/files/ImagePreviewModal.tsx`
- Modify: `apps/mobile/components/files/ImagePreviewModal.test.tsx`

- [ ] **Step 1: Update modal test mocks**

In `ImagePreviewModal.test.tsx`, add `Modal` to the existing React Native test
imports:

```ts
import { Modal } from 'react-native';
```

Then add mocks for PagerView, StatusBar, Reanimated, and `ZoomableImage` after
the `expo-image` mock:

```ts
vi.mock('react-native-pager-view', () => ({
  default: ({
    children,
    scrollEnabled,
    onPageSelected,
    testID,
  }: {
    children: React.ReactNode;
    scrollEnabled?: boolean;
    onPageSelected?: (event: { nativeEvent: { position: number } }) => void;
    testID?: string;
  }) =>
    React.createElement(
      'rn-pager-view',
      { scrollEnabled, onPageSelected, testID },
      children,
    ),
}));

vi.mock('expo-status-bar', () => ({
  StatusBar: (props: Record<string, unknown>) =>
    React.createElement('rn-status-bar', props, null),
}));

vi.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'rn-animated-view' },
  useAnimatedStyle: (fn: () => unknown) => fn(),
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown) => value,
}));

vi.mock('./ZoomableImage', () => ({
  ZoomableImage: (props: Record<string, unknown>) =>
    React.createElement('rn-zoomable-image', props, null),
}));
```

- [ ] **Step 2: Add failing modal behavior tests**

Add these tests to `ImagePreviewModal.test.tsx`:

```ts
it('uses thumbnailFileId as the fullscreen placeholder cache key', async () => {
  fetchSpy.mockImplementation(async (url: string) => {
    calls.push(url);
    const id = url.includes('/files/fil_thumb_1/url')
      ? 'thumb'
      : 'full';
    return jsonResponse({
      url: `https://r2.example.com/${id}.jpg?sig=abc`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = wrap(
      <ImagePreviewModal
        visible
        photos={[
          {
            fileId: 'fil_full_1',
            thumbnailFileId: 'fil_thumb_1',
            title: 'Gallery photo',
            cacheKey: 'fil_full_1',
          },
        ]}
        onClose={() => {}}
      />,
    );
  });

  const start = Date.now();
  while (
    tree.root.findAllByProps({ testID: 'image-preview-0' }).length === 0 &&
    Date.now() - start < 1000
  ) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }

  const zoomable = tree.root.findByProps({ testID: 'image-preview-0' });
  expect(zoomable.props.placeholder).toEqual({
    uri: 'https://r2.example.com/thumb.jpg?sig=abc',
  });
  expect(zoomable.props.placeholderCacheKey).toBe('fil_thumb_1');
});

it('renders a black fullscreen modal with declarative light status bar', () => {
  const tree = wrap(
    <ImagePreviewModal
      visible
      uri="https://r2.example.com/explicit.jpg"
      title="Explicit"
      onClose={() => {}}
    />,
  );

  const statusBar = tree.root.findByType('rn-status-bar');
  expect(statusBar.props.style).toBe('light');
  expect(statusBar.props.hidden).toBe(false);

  const modal = tree.root.findByType(Modal);
  expect(modal.props.presentationStyle).toBe('fullScreen');
  expect(modal.props.statusBarTranslucent).toBe(true);
});

it('disables pager scrolling while a child image is zoomed', () => {
  const tree = wrap(
    <ImagePreviewModal
      visible
      photos={[
        { fileId: 'fil_1', title: 'One', cacheKey: 'fil_1' },
        { fileId: 'fil_2', title: 'Two', cacheKey: 'fil_2' },
      ]}
      onClose={() => {}}
    />,
  );

  const pager = tree.root.findByType('rn-pager-view');
  expect(pager.props.scrollEnabled).toBe(true);

  const zoomable = tree.root.findByProps({ testID: 'image-preview-0' });
  act(() => {
    zoomable.props.onZoomChange(true);
  });

  expect(tree.root.findByType('rn-pager-view').props.scrollEnabled).toBe(false);
});
```

- [ ] **Step 3: Run modal tests and confirm failures**

Run:

```bash
pnpm --filter @harpa/mobile test -- components/files/ImagePreviewModal.test.tsx
```

Expected: tests fail because the modal still uses `FlatList`, `ScreenHeader`,
and no thumbnail placeholder.

- [ ] **Step 4: Update imports in `ImagePreviewModal.tsx`**

Replace the current imports with this set:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { X } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { ZoomableImage } from '@/components/files/ZoomableImage';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';
```

- [ ] **Step 5: Update modal container**

Replace the `<Modal>` return block in `ImagePreviewModal` with:

```tsx
return (
  <Modal
    visible={visible}
    animationType="fade"
    presentationStyle="fullScreen"
    statusBarTranslucent
    onRequestClose={onClose}
  >
    <SafeAreaProvider>
      <View className="flex-1 bg-black">
        {visible ? (
          <PreviewContent
            photos={resolvedPhotos}
            startIndex={startIndex}
            isGallery={isGallery}
            fallbackTitle={title}
            onClose={onClose}
          />
        ) : null}
      </View>
    </SafeAreaProvider>
  </Modal>
);
```

- [ ] **Step 6: Replace `PreviewContent`**

Replace the current `PreviewContent` function with:

```tsx
function PreviewContent({
  photos,
  startIndex,
  isGallery,
  fallbackTitle,
  onClose,
}: {
  photos: ReadonlyArray<ImagePreviewPhoto>;
  startIndex: number;
  isGallery: boolean;
  fallbackTitle: string;
  onClose: () => void;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [anyZoomed, setAnyZoomed] = useState(false);
  const zoomedSet = useRef<Set<string>>(new Set());
  const chromeOpacity = useSharedValue(1);

  useEffect(() => {
    setCurrentIndex(startIndex);
  }, [startIndex]);

  useEffect(() => {
    chromeOpacity.value = withTiming(chromeVisible ? 1 : 0, { duration: 150 });
  }, [chromeOpacity, chromeVisible]);

  const chromeStyle = useAnimatedStyle(() => ({
    opacity: chromeOpacity.value,
  }));

  const activePhoto = photos[currentIndex] ?? photos[0]!;
  const headerTitle = activePhoto.title ?? fallbackTitle;
  const headerSubtitle = isGallery
    ? `${currentIndex + 1} / ${photos.length}`
    : null;

  const toggleChrome = useCallback(() => {
    setChromeVisible((prev) => !prev);
  }, []);

  const onChildZoomChange = useCallback((key: string, isZoomed: boolean) => {
    if (isZoomed) zoomedSet.current.add(key);
    else zoomedSet.current.delete(key);
    setAnyZoomed(zoomedSet.current.size > 0);
  }, []);

  return (
    <>
      <StatusBar style="light" hidden={!chromeVisible} />

      <PagerView
        initialPage={startIndex}
        scrollEnabled={isGallery && !anyZoomed}
        onPageSelected={(e) => setCurrentIndex(e.nativeEvent.position)}
        style={{ flex: 1 }}
        testID="image-preview-gallery"
      >
        {photos.map((item, index) => {
          const key = item.fileId ?? item.uri ?? `photo-${index}`;
          return (
            <View
              key={key}
              className="items-center justify-center"
              style={{ width: screenWidth, height: screenHeight }}
            >
              <ImagePreviewBody
                uri={item.uri ?? null}
                fileId={item.fileId ?? null}
                thumbnailFileId={item.thumbnailFileId ?? null}
                title={item.title ?? fallbackTitle}
                cacheKey={item.cacheKey ?? null}
                width={screenWidth}
                height={screenHeight}
                testID={`image-preview-${index}`}
                onSingleTap={toggleChrome}
                onZoomChange={(z) => onChildZoomChange(key, z)}
              />
            </View>
          );
        })}
      </PagerView>

      <Animated.View
        pointerEvents={chromeVisible ? 'auto' : 'none'}
        style={chromeStyle}
        className="absolute left-0 right-0 top-0 z-10 bg-black/60"
      >
        <SafeAreaView edges={['top']}>
          <View className="flex-row items-center px-4 pb-3 pt-2">
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close image preview"
              testID="btn-close-image-preview"
              className="rounded-full bg-white/15 p-2"
            >
              <X size={22} color={colors.background} />
            </Pressable>

            <View className="min-w-0 flex-1 px-3">
              <Text
                accessibilityRole="header"
                className="text-sm font-semibold text-white"
                numberOfLines={1}
              >
                {headerTitle}
              </Text>
              {headerSubtitle ? (
                <Text className="mt-0.5 text-xs text-white/50">
                  {headerSubtitle}
                </Text>
              ) : null}
            </View>

            {isGallery ? (
              <Text className="text-xs font-medium text-white/60">
                {currentIndex + 1} / {photos.length}
              </Text>
            ) : null}
          </View>
        </SafeAreaView>
      </Animated.View>
    </>
  );
}
```

- [ ] **Step 7: Replace `ImagePreviewBody`**

Replace `ImagePreviewBody` with:

```tsx
function ImagePreviewBody({
  uri,
  fileId,
  thumbnailFileId,
  title,
  cacheKey,
  width,
  height,
  testID,
  onSingleTap,
  onZoomChange,
}: {
  uri: string | null;
  fileId: string | null;
  thumbnailFileId: string | null;
  title: string;
  cacheKey: string | null;
  width: number;
  height: number;
  testID: string;
  onSingleTap: () => void;
  onZoomChange: (isZoomed: boolean) => void;
}) {
  const { data, isLoading } = useFileSignedUrl(fileId, {
    enabled: !uri && Boolean(fileId),
  });
  const { data: thumbnailData } = useFileSignedUrl(thumbnailFileId, {
    enabled: !uri && Boolean(thumbnailFileId),
  });
  const resolvedUri =
    uri ?? (data as { url?: string } | undefined)?.url ?? null;
  const thumbnailUri =
    (thumbnailData as { url?: string } | undefined)?.url ?? null;
  const effectiveCacheKey = cacheKey ?? fileId ?? undefined;
  const effectivePlaceholderCacheKey = thumbnailFileId ?? undefined;
  const sourceUri = resolvedUri ?? thumbnailUri;
  const sourceCacheKey = resolvedUri
    ? effectiveCacheKey
    : effectivePlaceholderCacheKey;

  if (sourceUri) {
    return (
      <ZoomableImage
        source={{ uri: sourceUri }}
        placeholder={thumbnailUri ? { uri: thumbnailUri } : undefined}
        cacheKey={sourceCacheKey}
        placeholderCacheKey={effectivePlaceholderCacheKey}
        width={width}
        height={height}
        contentFit="contain"
        testID={testID}
        accessibilityLabel={title}
        onSingleTap={onSingleTap}
        onZoomChange={onZoomChange}
      />
    );
  }

  return (
    <ActivityIndicator
      size="large"
      color={colors.background}
      testID={isLoading ? 'image-preview-loading' : 'image-preview-loading'}
    />
  );
}
```

- [ ] **Step 8: Run focused modal tests**

Run:

```bash
pnpm --filter @harpa/mobile test -- components/files/ImagePreviewModal.test.tsx
```

Expected: all modal tests pass.

- [ ] **Step 9: Run typecheck**

Run:

```bash
pnpm --filter @harpa/mobile typecheck
```

Expected: typecheck passes.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/components/files/ImagePreviewModal.tsx \
  apps/mobile/components/files/ImagePreviewModal.test.tsx
git commit -m "feat(mobile): redesign fullscreen photo viewer" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Add default-wiring thumbnail placeholder integration test

**Files:**
- Create:
  `apps/mobile/components/files/gallery-thumbnail-placeholder.integration.test.tsx`

- [ ] **Step 1: Create the default-wiring integration test**

Create
`apps/mobile/components/files/gallery-thumbnail-placeholder.integration.test.tsx`:

```tsx
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ImagePreviewModal } from './ImagePreviewModal';
import { PhotoBatchGrid } from '@/components/notes/PhotoBatchGrid';
import type { Attachment } from '@/lib/notes/attachments';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));

vi.mock('react-native-pager-view', () => ({
  default: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
    React.createElement('rn-pager-view', { testID }, children),
}));

vi.mock('expo-status-bar', () => ({
  StatusBar: (props: Record<string, unknown>) =>
    React.createElement('rn-status-bar', props, null),
}));

vi.mock('react-native-gesture-handler', () => {
  const makeGesture = () => {
    const gesture: Record<string, unknown> = {
      numberOfTaps: () => gesture,
      requireExternalGestureToFail: () => gesture,
      onBegin: () => gesture,
      onUpdate: () => gesture,
      onEnd: () => gesture,
      enabled: () => gesture,
    };
    return gesture;
  };
  return {
    Gesture: {
      Tap: makeGesture,
      Pinch: makeGesture,
      Pan: makeGesture,
      Race: (...gestures: unknown[]) => ({ type: 'race', gestures }),
      Exclusive: (...gestures: unknown[]) => ({ type: 'exclusive', gestures }),
      Simultaneous: (...gestures: unknown[]) => ({
        type: 'simultaneous',
        gestures,
      }),
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      React.createElement('rn-gesture-detector', null, children),
  };
});

vi.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'rn-animated-view' },
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  useAnimatedStyle: (fn: () => unknown) => fn(),
  useSharedValue: (value: unknown) => ({ value }),
  withSpring: (value: unknown) => value,
  withTiming: (value: unknown) => value,
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function waitForImage(
  tree: ReactTestRenderer,
  testID: string,
): Promise<void> {
  const start = Date.now();
  while (
    tree.root.findAllByProps({ testID }).length === 0 &&
    Date.now() - start < 1000
  ) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  expect(tree.root.findAllByProps({ testID }).length).toBeGreaterThan(0);
}

describe('gallery thumbnail placeholder default wiring', () => {
  it('reuses the grid thumbnail query when opening the fullscreen modal', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        const id = url.includes('/files/fil_thumb/url') ? 'thumb' : 'full';
        return jsonResponse({
          url: `https://r2.example.com/${id}.jpg?sig=abc`,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const attachment: Attachment = {
      key: 'nf_1',
      fileId: 'fil_full',
      thumbnailFileId: 'fil_thumb',
      sourceUri: null,
      isPending: false,
      position: 0,
    };

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <QueryClientProvider client={queryClient}>
          <PhotoBatchGrid
            attachments={[attachment]}
            containerWidth={320}
            onOpenFile={() => {}}
          />
        </QueryClientProvider>,
      );
    });

    await waitForImage(tree, 'batch-grid-tile-0-img');
    const thumbnailCallsAfterGrid = calls.filter((c) =>
      c.includes('/files/fil_thumb/url'),
    );
    expect(thumbnailCallsAfterGrid).toHaveLength(1);

    await act(async () => {
      tree.update(
        <QueryClientProvider client={queryClient}>
          <ImagePreviewModal
            visible
            photos={[
              {
                fileId: 'fil_full',
                thumbnailFileId: 'fil_thumb',
                title: 'Photo',
                cacheKey: 'fil_full',
              },
            ]}
            onClose={() => {}}
          />
        </QueryClientProvider>,
      );
    });

    await waitForImage(tree, 'image-preview-0-image');
    const thumbnailCallsAfterModal = calls.filter((c) =>
      c.includes('/files/fil_thumb/url'),
    );
    expect(thumbnailCallsAfterModal).toHaveLength(1);

    const image = tree.root.findByProps({ testID: 'image-preview-0-image' });
    expect(image.props.placeholder).toEqual({
      uri: 'https://r2.example.com/thumb.jpg?sig=abc',
      cacheKey: 'fil_thumb',
    });

    vi.unstubAllGlobals();
  });
});
```

This test deliberately does not call `queryClient.setQueryData`. The grid must
populate the thumbnail query by running the real `PhotoTile` hook.

- [ ] **Step 2: Run the integration test**

Run:

```bash
pnpm --filter @harpa/mobile test -- components/files/gallery-thumbnail-placeholder.integration.test.tsx
```

Expected: the test passes and records exactly one thumbnail signed-URL fetch.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/files/gallery-thumbnail-placeholder.integration.test.tsx
git commit -m "test(mobile): cover thumbnail placeholder default wiring" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Final validation and manual QA notes

**Files:**
- Modify: `docs/superpowers/plans/2026-05-29-photo-grid-and-fullscreen-redesign.md`

- [ ] **Step 1: Run the mobile test suite**

Run:

```bash
pnpm --filter @harpa/mobile test
```

Expected: all mobile Vitest tests pass.

- [ ] **Step 2: Run mobile typecheck and lint**

Run:

```bash
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile lint
```

Expected: both commands pass.

- [ ] **Step 3: Run repository-level checks touched by this change**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: both commands pass. If unrelated pre-existing failures appear,
capture the failing command and the first relevant error in the PR notes.

- [ ] **Step 4: Run native smoke checks after dev-client rebuild**

Because Task 1 adds a native module, make fresh dev-client builds before
manual QA:

```bash
pnpm --filter @harpa/mobile ios
pnpm --filter @harpa/mobile android
```

Expected: both commands build and launch the dev client. Then verify on iOS
and Android:

1. A report note with one photo renders a one-third-width tile.
2. A report note with two photos renders two one-third-width tiles and empty
   space for the third slot.
3. Report notes and the report photo grid use the same thumbnail-sized tiles.
4. Opening a photo shows black fullscreen viewer chrome with a translucent
   header.
5. Header single-tap toggles chrome and status bar together.
6. Double-tap zooms in and double-tap again resets.
7. Pinch zoom clamps; pan at zoomed scale does not reveal backdrop.
8. Horizontal paging is disabled while zoomed and re-enabled after reset.
9. The thumbnail appears immediately before the full-resolution image finishes
   loading.

- [ ] **Step 5: Mark plan checkboxes for completed tasks**

Before the final implementation commit, update this plan file so completed
steps are checked. Keep unchecked only any native manual smoke item that was
not possible in the current environment and document that in the PR body.

- [ ] **Step 6: Final commit**

```bash
git add docs/superpowers/plans/2026-05-29-photo-grid-and-fullscreen-redesign.md
git commit -m "docs: update photo viewer implementation plan progress" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
