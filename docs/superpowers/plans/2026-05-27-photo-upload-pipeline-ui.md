# Photo Upload Pipeline UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three competing pending-state surfaces in the photo upload UI with a single Bluesky-inspired `<PhotoTile>` primitive driven by a unified `attachments[]` array, fixing the 3-wide grid clipping bug and eliminating shifting UI / status-text churn.

**Architecture:** Collapse `NoteEntry`'s `files` / `pendingFiles` / `pendingUpload` / `fileId` / `thumbnailFileId` photo lanes into one ordered `attachments: Attachment[]`. One `<PhotoTile>` component owns every state (pending / done / failed / overflow) with an animated progress ring, × cancel, and ⚠️ tap-to-retry overlay. `PhotoBatchGrid` lays the array out using a measured `containerWidth` instead of hard-coded screen-padding math. `UploadQueueStrip`, `SoloPendingTile`, `PendingFooter`, and `PhotoGridTile` are deleted.

**Tech Stack:** React Native (Expo 55), NativeWind v4, `react-native-reanimated` ~4.2 (already installed), `react-native-svg` 15 (already installed). Tests: Vitest + react-test-renderer.

**Spec:** `docs/superpowers/specs/2026-05-27-photo-upload-pipeline-ui-design.md`

---

## File Map

**Created**

- `apps/mobile/lib/notes/attachments.ts` — `Attachment` type + `buildAttachments(entry)` adapter (transitional during T1–T7; deleted in T8 once `NoteEntry` carries the array natively).
- `apps/mobile/lib/notes/attachments.test.ts`
- `apps/mobile/components/notes/PhotoTile.tsx` — unified tile primitive.
- `apps/mobile/components/notes/PhotoTile.test.tsx`
- `apps/mobile/components/notes/PhotoProgressRing.tsx` — Reanimated SVG arc.

**Modified**

- `apps/mobile/lib/notes/note-entry.ts` — add `attachments?: Attachment[]` (T1); drop legacy photo fields (T8).
- `apps/mobile/lib/uploads/usePhotoUploadEntries.ts` — emit `attachments`, simplify solo/batch split, extend anti-flicker map to attachment level.
- `apps/mobile/lib/uploads/usePhotoUploadEntries.test.tsx`
- `apps/mobile/features/generate/GenerateReportProvider.tsx` — drive timeline + gallery from `attachments`; attachment-level `fileId → syntheticKey` remap.
- `apps/mobile/components/notes/PhotoBatchGrid.tsx` — required `containerWidth`, render `PhotoTile`s.
- `apps/mobile/components/notes/PhotoNoteCard.tsx` — measure card-interior width, always render the grid, drop helpers.
- `apps/mobile/components/notes/PhotoNoteCard.test.tsx`
- `apps/mobile/components/notes/NoteTimeline.tsx` — no API change but doc-comment refresh.
- `apps/mobile/components/notes/ImageNoteCard.tsx` — swap `PhotoGridTile` → `PhotoTile` (saved-only path).
- `apps/mobile/components/reports/detail/PhotoNoteRow.tsx` — same swap.
- `apps/mobile/components/reports/detail/ReportPhotos.tsx` — same swap.
- `docs/v4/arch-batch-photo-notes.md` — update data-shape + UX sections.
- `docs/v4/plan-camera-upload-pipeline.md` — append redesign row.

**Deleted**

- `apps/mobile/components/uploads/UploadQueueStrip.tsx`
- `apps/mobile/components/uploads/UploadQueueStrip.test.tsx`
- `apps/mobile/components/notes/PhotoGridTile.tsx`

---

## Conventions

- Per the spec's testability rule (Pitfall 13), `PhotoTile.test.tsx` exercises the real component with real `Attachment` objects.
- Conventional Commits; every commit ends with the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- Commands run from the worktree root unless otherwise noted.
- Tests: `pnpm --filter @harpa/mobile test -- <pattern>` for a single file; `pnpm --filter @harpa/mobile test` for the whole suite.
- Typecheck: `pnpm --filter @harpa/mobile typecheck`.
- Lint: `pnpm --filter @harpa/mobile lint`.

---

### Task 1: `Attachment` type + `buildAttachments` adapter (additive)

This task introduces the unified shape and an adapter that derives it from today's `NoteEntry` photo fields, without removing the legacy fields. Subsequent UI tasks call the adapter; the data-model collapse happens last (T8).

**Files:**
- Create: `apps/mobile/lib/notes/attachments.ts`
- Create: `apps/mobile/lib/notes/attachments.test.ts`
- Modify: `apps/mobile/lib/notes/note-entry.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/lib/notes/attachments.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAttachments } from './attachments';
import type { NoteEntry } from './note-entry';

describe('buildAttachments', () => {
  it('returns saved files first, sorted by position, mapped to attachments', () => {
    const entry: NoteEntry = {
      text: '',
      addedAt: 0,
      source: 'image',
      files: [
        { id: 'nf_b', fileId: 'fil_b', thumbnailFileId: 'fil_bt', position: 1, caption: null },
        { id: 'nf_a', fileId: 'fil_a', thumbnailFileId: null, position: 0, caption: null },
      ],
    };
    const result = buildAttachments(entry);
    expect(result.map((a) => a.key)).toEqual(['nf_a', 'nf_b']);
    expect(result[0]).toMatchObject({
      fileId: 'fil_a',
      thumbnailFileId: null,
      isPending: false,
      sourceUri: null,
      position: 0,
    });
    expect(result[1].thumbnailFileId).toBe('fil_bt');
  });

  it('appends pending files after saved files, preserving queue order', () => {
    const entry: NoteEntry = {
      text: '',
      addedAt: 0,
      source: 'image',
      files: [
        { id: 'nf_a', fileId: 'fil_a', thumbnailFileId: null, position: 0, caption: null },
      ],
      pendingFiles: [
        { jobId: 'job_1', sourceUri: 'file:///1.jpg', status: 'uploading', progress: 0.4 },
        { jobId: 'job_2', sourceUri: 'file:///2.jpg', status: 'pending', progress: 0 },
      ],
    };
    const result = buildAttachments(entry);
    expect(result.map((a) => a.key)).toEqual(['nf_a', 'job_1', 'job_2']);
    expect(result[1]).toMatchObject({
      key: 'job_1',
      isPending: true,
      sourceUri: 'file:///1.jpg',
      status: 'uploading',
      progress: 0.4,
      fileId: null,
    });
  });

  it('falls back to legacy single pendingUpload when pendingFiles is absent', () => {
    const entry: NoteEntry = {
      text: '',
      addedAt: 0,
      source: 'image',
      pendingUpload: {
        jobId: 'job_solo',
        sourceUri: 'file:///s.jpg',
        status: 'uploading',
        progress: 0.7,
      },
    };
    const result = buildAttachments(entry);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: 'job_solo', isPending: true, progress: 0.7 });
  });

  it('falls back to legacy single fileId when there is no batch info', () => {
    const entry: NoteEntry = {
      id: 'not_X',
      text: '',
      addedAt: 0,
      source: 'image',
      fileId: 'fil_solo',
      thumbnailFileId: 'fil_solo_t',
    };
    const result = buildAttachments(entry);
    expect(result).toEqual([
      {
        key: 'not_X',
        fileId: 'fil_solo',
        thumbnailFileId: 'fil_solo_t',
        sourceUri: null,
        isPending: false,
        position: 0,
      },
    ]);
  });

  it('returns an empty array for entries with no photo data', () => {
    const entry: NoteEntry = { text: 'hi', addedAt: 0, source: 'text' };
    expect(buildAttachments(entry)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @harpa/mobile test -- attachments`
Expected: FAIL with "Cannot find module './attachments'".

- [ ] **Step 3: Create `attachments.ts`**

Create `apps/mobile/lib/notes/attachments.ts`:

```ts
/**
 * Attachment — unified per-photo shape consumed by the photo UI
 * (PhotoTile, PhotoBatchGrid). One ordered array drives every state
 * (saved, pending, failed, overflow). This module is the
 * transitional adapter while NoteEntry still carries the legacy
 * `files` / `pendingFiles` / `pendingUpload` / `fileId` lanes. T8
 * removes the legacy fields and lets callers read `entry.attachments`
 * directly.
 */
import type { NoteEntry } from './note-entry';

export type AttachmentStatus =
  | 'pending'
  | 'presigning'
  | 'uploading'
  | 'registering'
  | 'creating_note'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Attachment {
  /** Stable React key. `note_files.id` for saved, `jobId` for pending. */
  key: string;
  /** Server file id once registered. Null while pending pre-register. */
  fileId: string | null;
  thumbnailFileId: string | null;
  /** Local URI for the bytes while pending. Null for saved attachments. */
  sourceUri: string | null;
  /** True while the upload pipeline still owns this attachment. */
  isPending: boolean;
  /** Upload job id while pending; undefined once saved. */
  jobId?: string;
  /** Pipeline status while pending; undefined once saved. */
  status?: AttachmentStatus;
  /** [0..1] while pending; undefined once saved. */
  progress?: number;
  /** Set when status === 'failed'. */
  error?: string;
  /** Ordering hint within the parent note. */
  position: number;
}

/**
 * Derive the unified attachment list from a NoteEntry's legacy photo
 * fields. Saved files first (sorted by `position`), then pending
 * files in queue order. Falls back to the legacy single-file fields
 * (`pendingUpload`, `fileId`) when no batch info is present so this
 * adapter handles every shape the queue + server can currently emit.
 */
export function buildAttachments(entry: NoteEntry): readonly Attachment[] {
  if (entry.source !== 'image') return [];
  const out: Attachment[] = [];

  if (entry.files?.length) {
    const sorted = [...entry.files].sort((a, b) => a.position - b.position);
    for (const f of sorted) {
      out.push({
        key: f.id,
        fileId: f.fileId,
        thumbnailFileId: f.thumbnailFileId,
        sourceUri: null,
        isPending: false,
        position: f.position,
      });
    }
  }

  if (entry.pendingFiles?.length) {
    const basePosition = out.length;
    entry.pendingFiles.forEach((p, idx) => {
      out.push({
        key: p.jobId,
        fileId: null,
        thumbnailFileId: null,
        sourceUri: p.sourceUri,
        isPending: true,
        jobId: p.jobId,
        status: p.status,
        progress: p.progress,
        error: p.error,
        position: basePosition + idx,
      });
    });
  }

  if (out.length === 0 && entry.pendingUpload) {
    const p = entry.pendingUpload;
    out.push({
      key: p.jobId,
      fileId: null,
      thumbnailFileId: null,
      sourceUri: p.sourceUri,
      isPending: true,
      jobId: p.jobId,
      status: p.status,
      progress: p.progress,
      error: p.error,
      position: 0,
    });
  }

  if (out.length === 0 && entry.fileId) {
    out.push({
      key: entry.id ?? entry.fileId,
      fileId: entry.fileId,
      thumbnailFileId: entry.thumbnailFileId ?? null,
      sourceUri: null,
      isPending: false,
      position: 0,
    });
  }

  return out;
}
```

- [ ] **Step 4: Add the optional `attachments` field to `NoteEntry`**

In `apps/mobile/lib/notes/note-entry.ts`, add an import-free type reference and a new optional field beneath the existing photo block. Do NOT remove any legacy fields in this task. Insert near line 88 (`files?:`):

```ts
  // ── Unified photo attachments ──────────────────────────────────
  // T1 adds this field as optional. PhotoTile + PhotoBatchGrid
  // consume `buildAttachments(entry)` until T8 wires `attachments`
  // as the sole source of truth and removes the legacy fields below.
  attachments?: ReadonlyArray<import('./attachments').Attachment>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @harpa/mobile test -- attachments`
Expected: PASS (5 tests).

Also: `pnpm --filter @harpa/mobile typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/notes/attachments.ts apps/mobile/lib/notes/attachments.test.ts apps/mobile/lib/notes/note-entry.ts
git commit -m "feat(mobile): add Attachment type + buildAttachments adapter

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: `PhotoProgressRing` (Reanimated SVG arc)

Standalone tile-overlay component used by `PhotoTile`. SVG circle whose `strokeDashoffset` is animated via Reanimated `useAnimatedProps`. Tested in isolation against the static `progress` prop.

**Files:**
- Create: `apps/mobile/components/notes/PhotoProgressRing.tsx`
- Create: `apps/mobile/components/notes/PhotoProgressRing.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/components/notes/PhotoProgressRing.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, create } from 'react-test-renderer';

vi.mock('react-native-svg', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) =>
    React.createElement('rn-svg', props, (props as { children?: React.ReactNode }).children),
  Svg: (props: Record<string, unknown>) =>
    React.createElement('rn-svg', props, (props as { children?: React.ReactNode }).children),
  Circle: (props: Record<string, unknown>) =>
    React.createElement('rn-svg-circle', props, null),
}));

vi.mock('react-native-reanimated', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    'react-native-reanimated/mock',
  );
  return actual;
});

import { PhotoProgressRing } from './PhotoProgressRing';

describe('PhotoProgressRing', () => {
  it('renders an accessible progressbar with the rounded percent value', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<PhotoProgressRing progress={0.42} testID="ring" />);
    });
    const root = tree!.root.findByProps({ testID: 'ring' });
    expect(root.props.accessibilityRole).toBe('progressbar');
    expect(root.props.accessibilityValue).toEqual({ now: 42, min: 0, max: 100 });
  });

  it('clamps progress to [0, 1]', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<PhotoProgressRing progress={1.6} testID="ring" />);
    });
    const root = tree!.root.findByProps({ testID: 'ring' });
    expect(root.props.accessibilityValue).toEqual({ now: 100, min: 0, max: 100 });
  });

  it('returns null when progress is undefined (finalizing tail)', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<PhotoProgressRing progress={undefined} testID="ring" />);
    });
    expect(tree!.root.findAllByProps({ testID: 'ring' })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @harpa/mobile test -- PhotoProgressRing`
Expected: FAIL with "Cannot find module './PhotoProgressRing'".

- [ ] **Step 3: Implement `PhotoProgressRing.tsx`**

Create `apps/mobile/components/notes/PhotoProgressRing.tsx`:

```tsx
/**
 * PhotoProgressRing — circular SVG progress indicator used by
 * `<PhotoTile>` to surface byte-uploaded progress during the
 * `presigning` → `uploading` window. The ring is hidden during the
 * `registering` / `creating_note` finalizing tail (progress already
 * == 1 but the server round-trip is still in flight) — the caller
 * passes `progress={undefined}` and renders a pulse on the dim
 * overlay instead.
 *
 * 28 × 28 px, 3 px stroke. Background ring = `border-foreground/20`,
 * foreground arc = `border-primary`. The arc animates clockwise from
 * 12 o'clock via `strokeDashoffset` driven by a Reanimated worklet so
 * frequent queue snapshots don't re-render the parent card.
 */
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useEffect } from 'react';

import { colors } from '@/lib/design-tokens/colors';

const SIZE = 28;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface PhotoProgressRingProps {
  /** [0..1]. `undefined` hides the ring entirely (finalizing tail). */
  progress: number | undefined;
  testID?: string;
}

export function PhotoProgressRing({ progress, testID }: PhotoProgressRingProps) {
  if (progress === undefined) return null;
  const clamped = Math.max(0, Math.min(1, progress));
  const pct = Math.round(clamped * 100);

  const offset = useSharedValue(CIRCUMFERENCE);
  useEffect(() => {
    offset.value = withTiming(CIRCUMFERENCE * (1 - clamped), { duration: 150 });
  }, [clamped, offset]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.value,
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: pct, min: 0, max: 100 }}
      accessibilityLabel={`Uploading photo, ${pct} percent`}
      testID={testID}
      style={{ width: SIZE, height: SIZE }}
    >
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.border}
          strokeWidth={STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.primary.DEFAULT}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          // Start the arc at 12 o'clock (default is 3 o'clock).
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          animatedProps={animatedProps}
        />
      </Svg>
    </View>
  );
}
```

If `colors.primary.DEFAULT` or `colors.border` don't exist exactly as written, open `apps/mobile/lib/design-tokens/colors.ts` and use the actual token names (likely `colors.primary` and `colors.border`). The test does not assert specific stroke values.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @harpa/mobile test -- PhotoProgressRing`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @harpa/mobile typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/notes/PhotoProgressRing.tsx apps/mobile/components/notes/PhotoProgressRing.test.tsx
git commit -m "feat(mobile): add PhotoProgressRing SVG arc primitive

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: `PhotoTile` primitive

One component renders every state (loading-saved / done / pending / failed / overflow). No status text. Tap targets per spec §8 + §9.

**Files:**
- Create: `apps/mobile/components/notes/PhotoTile.tsx`
- Create: `apps/mobile/components/notes/PhotoTile.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/components/notes/PhotoTile.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PhotoTile } from './PhotoTile';
import type { Attachment } from '@/lib/notes/attachments';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));

vi.mock('react-native-reanimated', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    'react-native-reanimated/mock',
  );
  return actual;
});

function pending(over: Partial<Attachment> = {}): Attachment {
  return {
    key: 'job_1',
    fileId: null,
    thumbnailFileId: null,
    sourceUri: 'file:///tmp/a.jpg',
    isPending: true,
    jobId: 'job_1',
    status: 'uploading',
    progress: 0.4,
    position: 0,
    ...over,
  };
}

function saved(over: Partial<Attachment> = {}): Attachment {
  return {
    key: 'nf_1',
    fileId: 'fil_1',
    thumbnailFileId: 'fil_1_t',
    sourceUri: null,
    isPending: false,
    position: 0,
    ...over,
  };
}

function render(el: React.ReactElement): ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
  });
  return tree;
}

describe('PhotoTile pending state', () => {
  it('renders the local source uri thumbnail + progress ring + cancel target', () => {
    const onCancel = vi.fn();
    const tree = render(
      <PhotoTile attachment={pending()} size={120} onCancel={onCancel} testID="tile" />,
    );
    expect(
      tree.root.findByProps({ testID: 'tile-img' }).props.source.uri,
    ).toBe('file:///tmp/a.jpg');
    expect(tree.root.findAllByProps({ testID: 'tile-ring' }).length).toBe(1);
    const cancel = tree.root.findByProps({ testID: 'tile-cancel' });
    act(() => cancel.props.onPress());
    expect(onCancel).toHaveBeenCalledWith('job_1');
  });

  it('hides the ring during the finalizing tail (progress=1, not completed)', () => {
    const tree = render(
      <PhotoTile
        attachment={pending({ status: 'registering', progress: 1 })}
        size={120}
        testID="tile"
      />,
    );
    expect(tree.root.findAllByProps({ testID: 'tile-ring' }).length).toBe(0);
  });
});

describe('PhotoTile failed state', () => {
  it('shows the warning overlay; tap fires retry, long-press fires dismiss', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    const tree = render(
      <PhotoTile
        attachment={pending({ status: 'failed', progress: 0, error: 'boom' })}
        size={120}
        onRetry={onRetry}
        onCancel={onDismiss}
        testID="tile"
      />,
    );
    expect(tree.root.findAllByProps({ testID: 'tile-failed' }).length).toBe(1);
    expect(tree.root.findAllByProps({ testID: 'tile-ring' }).length).toBe(0);
    const surface = tree.root.findByProps({ testID: 'tile' });
    act(() => surface.props.onPress());
    expect(onRetry).toHaveBeenCalledWith('job_1');
    act(() => surface.props.onLongPress());
    expect(onDismiss).toHaveBeenCalledWith('job_1');
  });
});

describe('PhotoTile saved state', () => {
  it('renders the server thumbnail and fires onPress with the fileId', () => {
    const onPress = vi.fn();
    const tree = render(
      <PhotoTile attachment={saved()} size={120} onPress={onPress} testID="tile" />,
    );
    expect(tree.root.findAllByProps({ testID: 'tile-ring' }).length).toBe(0);
    expect(tree.root.findAllByProps({ testID: 'tile-cancel' }).length).toBe(0);
    const surface = tree.root.findByProps({ testID: 'tile' });
    act(() => surface.props.onPress());
    expect(onPress).toHaveBeenCalledWith('fil_1');
  });

  it('renders an overflow badge when overflowCount is provided', () => {
    const tree = render(
      <PhotoTile
        attachment={saved()}
        size={120}
        overflowCount={5}
        testID="tile"
      />,
    );
    const badge = tree.root.findByProps({ testID: 'tile-overflow' });
    expect(badge.props.children).toContain('5');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @harpa/mobile test -- PhotoTile.test`
Expected: FAIL with "Cannot find module './PhotoTile'".

- [ ] **Step 3: Implement `PhotoTile.tsx`**

Create `apps/mobile/components/notes/PhotoTile.tsx`:

```tsx
/**
 * PhotoTile — the single primitive that renders every state of a
 * photo attachment in the timeline grid:
 *
 *   - pending (≤100%)  : sourceUri at 60% opacity + centered ring + small × top-right
 *   - finalizing tail   : sourceUri at 60% opacity (no ring, pulse via opacity)
 *   - done              : sourceUri or server thumbnail at 100% opacity, no overlay
 *   - failed            : sourceUri at 50% opacity + red ⚠️ overlay, tap=retry, long-press=dismiss
 *   - overflow (saved)  : "+N" badge over the underlying tile
 *
 * Keeping every state in one component lets the parent grid hold a
 * stable React key across pending → saved so `expo-image` repaints
 * from its memory cache (no flash, no remount). The dim+ring overlay
 * fades out via Reanimated when `isPending` flips false; the underlying
 * image bytes never re-mount.
 */
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AlertTriangle, X } from 'lucide-react-native';

import { CachedImage } from '@/components/ui/CachedImage';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';
import type { Attachment } from '@/lib/notes/attachments';

import { PhotoProgressRing } from './PhotoProgressRing';

export interface PhotoTileProps {
  attachment: Attachment;
  /** Side length in pixels (square tile). */
  size: number;
  /** Saved-state tap. Receives the resolved `fileId`. No-op for pending. */
  onPress?: (fileId: string) => void;
  /** Pending cancel + failed dismiss share this handler. */
  onCancel?: (jobId: string) => void;
  /** Failed tap-to-retry. */
  onRetry?: (jobId: string) => void;
  /** When set, render a "+N" overflow badge over the tile. */
  overflowCount?: number;
  testID?: string;
}

const FADE_MS = 200;

export function PhotoTile({
  attachment,
  size,
  onPress,
  onCancel,
  onRetry,
  overflowCount,
  testID,
}: PhotoTileProps) {
  const { isPending, status, progress, sourceUri, fileId, thumbnailFileId, jobId, error } = attachment;
  const isFailed = status === 'failed';
  const isFinalizing = isPending && !isFailed && (progress ?? 0) >= 1;

  // Saved-only path needs a signed URL for the server thumbnail.
  const sourceFileId = thumbnailFileId ?? fileId;
  const { data } = useFileSignedUrl(
    !isPending && sourceFileId ? sourceFileId : undefined,
  );
  const serverUri = (data as { url?: string } | undefined)?.url ?? null;

  // Image URI: prefer local sourceUri while we have one (pending and
  // for the first frame after the server lands, until the signed URL
  // arrives), then swap to the server URL. Same `cacheKey` across the
  // entire lifecycle so expo-image's memory cache eliminates the
  // flash on transition.
  const uri = sourceUri ?? serverUri ?? undefined;
  const cacheKey = attachment.key;

  // Overlay fade — opacity = 1 while pending or failed, fades to 0
  // when the attachment lands.
  const overlayOpacity = useSharedValue(isPending || isFailed ? 1 : 0);
  useEffect(() => {
    overlayOpacity.value = withTiming(isPending || isFailed ? 1 : 0, {
      duration: FADE_MS,
    });
  }, [isPending, isFailed, overlayOpacity]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  const imageOpacity = isFailed ? 0.5 : isPending ? 0.6 : 1;
  const dims = { width: size, height: size };
  const surfaceTestID = testID;
  const imgTestID = testID ? `${testID}-img` : undefined;

  const handlePress = () => {
    if (isFailed && onRetry && jobId) {
      onRetry(jobId);
      return;
    }
    if (!isPending && fileId && onPress) {
      onPress(fileId);
    }
    // Pending non-failed tap is a no-op — the × is the explicit cancel target.
  };

  const handleLongPress = () => {
    if (isFailed && onCancel && jobId) onCancel(jobId);
  };

  const a11yLabel = isFailed
    ? 'Photo upload failed. Double-tap to retry, long-press to dismiss.'
    : isPending
      ? `Uploading photo, ${Math.round((progress ?? 0) * 100)} percent`
      : 'Photo, tap to open';

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      disabled={isPending && !isFailed}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={isFailed ? error ?? undefined : undefined}
      testID={surfaceTestID}
      className="overflow-hidden rounded-md bg-muted"
      style={dims}
    >
      {uri ? (
        <CachedImage
          source={{ uri }}
          cacheKey={cacheKey}
          style={[dims, { opacity: imageOpacity }]}
          contentFit="cover"
          testID={imgTestID}
        />
      ) : (
        <View style={dims} className="bg-muted" />
      )}

      <Animated.View
        pointerEvents="box-none"
        style={[
          { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
          overlayStyle,
        ]}
      >
        {isFailed ? (
          <View
            testID={testID ? `${testID}-failed` : undefined}
            className="items-center justify-center rounded-full bg-black/40 p-2"
          >
            <AlertTriangle size={24} color={colors.danger.foreground} />
          </View>
        ) : isPending && !isFinalizing ? (
          <PhotoProgressRing
            progress={progress}
            testID={testID ? `${testID}-ring` : undefined}
          />
        ) : null}
      </Animated.View>

      {isPending && !isFailed && onCancel && jobId ? (
        <Pressable
          onPress={() => onCancel(jobId)}
          accessibilityRole="button"
          accessibilityLabel="Cancel upload"
          hitSlop={6}
          testID={testID ? `${testID}-cancel` : undefined}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={14} color="white" />
        </Pressable>
      ) : null}

      {overflowCount !== undefined && overflowCount > 0 ? (
        <View
          pointerEvents="none"
          testID={testID ? `${testID}-overflow` : undefined}
          className="absolute inset-0 items-center justify-center rounded-md bg-black/50"
        >
          <Text className="text-lg font-bold text-white">+{overflowCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
```

If `colors.danger.foreground` does not exist exactly, look up the token in `apps/mobile/lib/design-tokens/colors.ts`. The relevant token is whatever drives `text-danger-foreground` in NativeWind.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @harpa/mobile test -- PhotoTile.test`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @harpa/mobile typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/notes/PhotoTile.tsx apps/mobile/components/notes/PhotoTile.test.tsx
git commit -m "feat(mobile): add PhotoTile unified attachment primitive

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: `PhotoBatchGrid` — required containerWidth + `PhotoTile`

Replace the dual resolved/pending branches with a single map over `Attachment[]` rendering `PhotoTile`s. Make `containerWidth` required so callers always pass measured width. Preserve `+N` overflow at index 8.

**Files:**
- Modify: `apps/mobile/components/notes/PhotoBatchGrid.tsx`
- Create: `apps/mobile/components/notes/PhotoBatchGrid.test.tsx`

- [ ] **Step 1: Write the failing grid-fitting regression test**

Create `apps/mobile/components/notes/PhotoBatchGrid.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PhotoBatchGrid } from './PhotoBatchGrid';
import type { Attachment } from '@/lib/notes/attachments';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));
vi.mock('react-native-reanimated', async () => {
  return await vi.importActual('react-native-reanimated/mock');
});

function saved(i: number): Attachment {
  return {
    key: `nf_${i}`,
    fileId: `fil_${i}`,
    thumbnailFileId: null,
    sourceUri: null,
    isPending: false,
    position: i,
  };
}

function render(el: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
  });
  return tree;
}

describe('PhotoBatchGrid sizing', () => {
  // GAP = 6, COLUMNS = 3 → tileSize = floor((320 - 12) / 3) = 102
  it('fits 3 tiles into a 320px container without clipping', () => {
    const items: Attachment[] = [saved(0), saved(1), saved(2)];
    const tree = render(
      <PhotoBatchGrid attachments={items} containerWidth={320} />,
    );
    const tiles = tree.root.findAllByProps({ testID: /^batch-grid-tile-\d+$/ as unknown as string });
    // testID match by exact prop, so re-fetch one-by-one:
    const t0 = tree.root.findByProps({ testID: 'batch-grid-tile-0' });
    const t1 = tree.root.findByProps({ testID: 'batch-grid-tile-1' });
    const t2 = tree.root.findByProps({ testID: 'batch-grid-tile-2' });
    for (const t of [t0, t1, t2]) {
      const width = (t.props.style as { width: number }).width;
      expect(width).toBeGreaterThan(0);
      expect(width).toBeLessThanOrEqual(102);
    }
    expect(3 * (t0.props.style.width as number) + 2 * 6).toBeLessThanOrEqual(320);
  });

  it('renders +N overflow on the 9th tile when more than 9 attachments', () => {
    const items = Array.from({ length: 11 }, (_, i) => saved(i));
    const tree = render(
      <PhotoBatchGrid attachments={items} containerWidth={320} />,
    );
    // Only the first 9 tiles are rendered; the 9th carries the overflow badge.
    expect(
      tree.root.findAllByProps({ testID: 'batch-grid-tile-8' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'batch-grid-tile-9' }),
    ).toHaveLength(0);
    const overflow = tree.root.findByProps({ testID: 'batch-grid-tile-8-overflow' });
    expect(overflow.props.children).toContain(3); // 11 total, 8 visible + overflow shows +3
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @harpa/mobile test -- PhotoBatchGrid.test`
Expected: FAIL (props mismatch — current grid takes `entry`, not `attachments`).

- [ ] **Step 3: Replace `PhotoBatchGrid.tsx`**

Overwrite `apps/mobile/components/notes/PhotoBatchGrid.tsx`:

```tsx
/**
 * PhotoBatchGrid — lays a flat `Attachment[]` into a 3-column grid.
 *
 * Sizing is driven entirely by the measured `containerWidth` the
 * parent passes in (via `onLayout`) — no `useWindowDimensions`, no
 * hard-coded padding constants. The 3-wide clipping bug in the
 * timeline went away when the math stopped guessing the upstream
 * card padding.
 *
 * Up to 9 tiles render; if more attachments exist the 9th carries a
 * "+N" overflow badge (rendered by `<PhotoTile overflowCount=>`).
 */
import { View } from 'react-native';

import type { Attachment } from '@/lib/notes/attachments';

import { PhotoTile } from './PhotoTile';

const COLUMNS = 3;
const GAP = 6;
const MAX_VISIBLE = 9;

export interface PhotoBatchGridProps {
  attachments: readonly Attachment[];
  /** Card-interior width in pixels. Required so the grid never guesses. */
  containerWidth: number;
  /** Saved-tile tap — fileId of the resolved attachment. */
  onOpenFile?: (fileId: string) => void;
  /** Retry a failed pending attachment. */
  onRetryUpload?: (jobId: string) => void;
  /** Cancel an in-flight or dismiss a failed attachment. */
  onCancelUpload?: (jobId: string) => void;
  /** Optional test-id prefix for individual tiles. */
  tileTestIDPrefix?: string;
}

export function PhotoBatchGrid({
  attachments,
  containerWidth,
  onOpenFile,
  onRetryUpload,
  onCancelUpload,
  tileTestIDPrefix = 'batch-grid-tile',
}: PhotoBatchGridProps) {
  if (attachments.length === 0) return null;

  const total = attachments.length;
  const visible = total <= MAX_VISIBLE
    ? attachments
    : attachments.slice(0, MAX_VISIBLE);
  const overflowAtLast = total > MAX_VISIBLE
    ? total - (MAX_VISIBLE - 1) // shows on the 9th tile, replaces the would-be 9th
    : 0;

  const cols = Math.min(visible.length, COLUMNS);
  const tileSize = Math.floor((containerWidth - GAP * (cols - 1)) / cols);

  return (
    <View className="flex-row flex-wrap" style={{ gap: GAP }}>
      {visible.map((a, idx) => {
        const isOverflowTile = overflowAtLast > 0 && idx === MAX_VISIBLE - 1;
        return (
          <View
            key={a.key}
            style={{ width: tileSize, height: tileSize }}
          >
            <PhotoTile
              attachment={a}
              size={tileSize}
              onPress={onOpenFile}
              onRetry={onRetryUpload}
              onCancel={onCancelUpload}
              overflowCount={isOverflowTile ? overflowAtLast : undefined}
              testID={`${tileTestIDPrefix}-${idx}`}
            />
          </View>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @harpa/mobile test -- PhotoBatchGrid.test`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck (will surface other consumers — `PhotoNoteCard` still passes the old `entry` prop)**

Run: `pnpm --filter @harpa/mobile typecheck`
Expected: FAIL with type errors in `PhotoNoteCard.tsx` (the next task fixes this). Note the errors; do NOT commit until Task 5 lands.

- [ ] **Step 6: (Deferred commit) — combined with Task 5**

Do NOT commit yet. The grid's new contract requires `PhotoNoteCard` to pass measured `containerWidth` + `attachments`, which is Task 5. Keep the working tree dirty and proceed.

---

### Task 5: `PhotoNoteCard` — measure width, drop helpers, always-grid

Card measures its interior via `onLayout`. Header + grid only — no `SoloPendingTile`, no `PendingFooter`, no status text. Body text renders below the grid for both saved and pending. Kebab visible always (the per-tile × handles cancel during pending, so the kebab no longer needs to be hidden).

**Files:**
- Modify: `apps/mobile/components/notes/PhotoNoteCard.tsx`
- Modify: `apps/mobile/components/notes/PhotoNoteCard.test.tsx`

- [ ] **Step 1: Replace `PhotoNoteCard.test.tsx`**

Overwrite `apps/mobile/components/notes/PhotoNoteCard.test.tsx`:

```tsx
/**
 * PhotoNoteCard — unified pending → saved lifecycle. One component
 * renders every state via `<PhotoBatchGrid attachments>` so the
 * timeline can hold a stable React key across the transition (no
 * flicker, no shifting UI).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PhotoNoteCard } from './PhotoNoteCard';
import type { NoteEntry } from '@/lib/notes/note-entry';
import type { Attachment } from '@/lib/notes/attachments';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));
vi.mock('react-native-reanimated', async () =>
  vi.importActual('react-native-reanimated/mock'),
);

function pending(over: Partial<Attachment> = {}): Attachment {
  return {
    key: 'job_1',
    fileId: null,
    thumbnailFileId: null,
    sourceUri: 'file:///tmp/a.jpg',
    isPending: true,
    jobId: 'job_1',
    status: 'uploading',
    progress: 0.5,
    position: 0,
    ...over,
  };
}

function saved(i: number): Attachment {
  return {
    key: `nf_${i}`,
    fileId: `fil_${i}`,
    thumbnailFileId: null,
    sourceUri: null,
    isPending: false,
    position: i,
  };
}

function entry(over: Partial<NoteEntry> = {}): NoteEntry {
  return {
    id: '__upload-job_1',
    reactKey: '__upload-job_1',
    text: '',
    addedAt: 1700000000000,
    source: 'image',
    isPending: true,
    attachments: [pending()],
    ...over,
  };
}

function render(el: React.ReactElement): ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
  });
  return tree;
}

/**
 * Simulate the onLayout callback that drives card-interior width
 * measurement, so the grid renders with non-zero tile dimensions.
 */
function layout(tree: ReactTestRenderer, sourceIndex: number, width: number) {
  const measured = tree.root.findByProps({ testID: `note-row-${sourceIndex}-measure` });
  act(() => {
    measured.props.onLayout({ nativeEvent: { layout: { width } } });
  });
}

describe('PhotoNoteCard', () => {
  it('renders a single pending tile with a progress ring (no status text)', () => {
    const tree = render(
      <PhotoNoteCard entry={entry()} sourceIndex={0} onCancelUpload={() => {}} />,
    );
    layout(tree, 0, 320);
    expect(tree.root.findAllByProps({ testID: 'batch-grid-tile-0-ring' }).length).toBe(1);
    // No status label anywhere.
    expect(tree.root.findAllByProps({ testID: 'pending-photo-status-0' })).toHaveLength(0);
  });

  it('shows the failed overlay on the tile and fires retry on tap', () => {
    const onRetry = vi.fn();
    const onCancel = vi.fn();
    const tree = render(
      <PhotoNoteCard
        entry={entry({
          attachments: [pending({ status: 'failed', progress: 0, error: 'boom' })],
        })}
        sourceIndex={2}
        onRetryUpload={onRetry}
        onCancelUpload={onCancel}
      />,
    );
    layout(tree, 2, 320);
    expect(tree.root.findAllByProps({ testID: 'batch-grid-tile-0-failed' }).length).toBe(1);
    const tile = tree.root.findByProps({ testID: 'batch-grid-tile-0' });
    act(() => tile.props.onPress());
    expect(onRetry).toHaveBeenCalledWith('job_1');
    act(() => tile.props.onLongPress());
    expect(onCancel).toHaveBeenCalledWith('job_1');
  });

  it('renders the kebab even while uploads are pending', () => {
    const onOpenOptions = vi.fn();
    const tree = render(
      <PhotoNoteCard
        entry={entry()}
        sourceIndex={0}
        onOpenOptions={onOpenOptions}
        onCancelUpload={() => {}}
      />,
    );
    layout(tree, 0, 320);
    const kebab = tree.root.findByProps({ testID: 'note-options-kebab-0' });
    act(() => kebab.props.onPress());
    expect(onOpenOptions).toHaveBeenCalledWith(0);
  });

  it('renders saved 3-up batch with no overlays and tap fires onOpen with fileId', () => {
    const onOpen = vi.fn();
    const tree = render(
      <PhotoNoteCard
        entry={entry({
          id: 'not_X',
          reactKey: '__batch-b1',
          isPending: false,
          attachments: [saved(0), saved(1), saved(2)],
        })}
        sourceIndex={3}
        onOpen={onOpen}
      />,
    );
    layout(tree, 3, 320);
    expect(tree.root.findAllByProps({ testID: 'batch-grid-tile-0-ring' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'batch-grid-tile-0-cancel' })).toHaveLength(0);
    const tile = tree.root.findByProps({ testID: 'batch-grid-tile-1' });
    act(() => tile.props.onPress());
    expect(onOpen).toHaveBeenCalledWith('fil_1', 3);
  });
});
```

- [ ] **Step 2: Replace `PhotoNoteCard.tsx`**

Overwrite `apps/mobile/components/notes/PhotoNoteCard.tsx`:

```tsx
/**
 * PhotoNoteCard — one photo note row in the Generate-screen timeline.
 *
 * Header + a single `<PhotoBatchGrid attachments>` underneath. The
 * grid renders every state (saved, pending, failed, overflow) via
 * `<PhotoTile>`; the card has no status text, no helper rows. The
 * card's interior width is measured via `onLayout` and threaded into
 * the grid so the 3-wide layout never clips on the right edge.
 *
 * `entry.attachments` is the source of truth. While the legacy
 * `files` / `pendingFiles` / `pendingUpload` / `fileId` fields still
 * exist on `NoteEntry` (T1), the card falls back to
 * `buildAttachments(entry)` whenever `entry.attachments` is not
 * provided — kept until T8 removes the legacy fields.
 */
import { useCallback, useMemo, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';

import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { NoteOptionsKebab } from '@/components/notes/NoteOptionsKebab';
import { PhotoBatchGrid } from '@/components/notes/PhotoBatchGrid';
import { buildAttachments } from '@/lib/notes/attachments';
import type { NoteEntry } from '@/lib/notes/note-entry';

export interface PhotoNoteCardProps {
  entry: NoteEntry;
  sourceIndex: number;
  authorName?: string;
  /** Opens the fullscreen swipeable gallery focussed on this photo. */
  onOpen?: (fileId: string, sourceIndex: number) => void;
  /** Opens the shared `NoteOptionsSheet`. */
  onOpenOptions?: (sourceIndex: number) => void;
  onRetryUpload?: (jobId: string) => void;
  onCancelUpload?: (jobId: string) => void;
}

export function PhotoNoteCard({
  entry,
  sourceIndex,
  authorName,
  onOpen,
  onOpenOptions,
  onRetryUpload,
  onCancelUpload,
}: PhotoNoteCardProps) {
  const body = entry.text?.trim() ?? '';
  const attachments = useMemo(
    () => entry.attachments ?? buildAttachments(entry),
    [entry],
  );
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  const onLayout = useCallback((ev: LayoutChangeEvent) => {
    const w = ev.nativeEvent.layout.width;
    setContainerWidth((prev) => (prev === w ? prev : w));
  }, []);

  const handleOpen = useCallback(
    (fileId: string) => {
      onOpen?.(fileId, sourceIndex);
    },
    [onOpen, sourceIndex],
  );

  return (
    <View
      className="rounded-lg border border-border bg-card p-3 gap-2"
      testID={`note-row-${sourceIndex}`}
    >
      <NoteCardHeader
        authorName={authorName}
        capturedAt={entry.addedAt}
        testIDSuffix={sourceIndex}
        trailing={
          onOpenOptions ? (
            <NoteOptionsKebab
              noteId={sourceIndex}
              onPress={() => onOpenOptions(sourceIndex)}
            />
          ) : null
        }
      />
      <View onLayout={onLayout} testID={`note-row-${sourceIndex}-measure`}>
        {containerWidth !== null && attachments.length > 0 ? (
          <PhotoBatchGrid
            attachments={attachments}
            containerWidth={containerWidth}
            onOpenFile={handleOpen}
            onRetryUpload={onRetryUpload}
            onCancelUpload={onCancelUpload}
          />
        ) : null}
      </View>
      {body ? (
        <Text className="text-sm leading-5 text-foreground" selectable>
          {body}
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 3: Run the two updated test files**

Run: `pnpm --filter @harpa/mobile test -- PhotoNoteCard.test PhotoBatchGrid.test`
Expected: PASS (all tests).

If `NoteOptionsKebab` does not emit `testID='note-options-kebab-${noteId}'`, open `apps/mobile/components/notes/NoteOptionsKebab.tsx` and confirm the actual testID. Adjust the third test's `findByProps` accordingly. Do NOT change the component just to match the test.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @harpa/mobile typecheck`
Expected: PASS.

- [ ] **Step 5: Run the full mobile suite**

Run: `pnpm --filter @harpa/mobile test`
Expected: PASS. (`UploadQueueStrip.test`, `usePhotoUploadEntries.test`, and any timeline test still pass because legacy fields remain on `NoteEntry` and feed `buildAttachments`.)

- [ ] **Step 6: Commit (combined T4 + T5)**

```bash
git add apps/mobile/components/notes/PhotoBatchGrid.tsx apps/mobile/components/notes/PhotoBatchGrid.test.tsx apps/mobile/components/notes/PhotoNoteCard.tsx apps/mobile/components/notes/PhotoNoteCard.test.tsx
git commit -m "refactor(mobile): collapse PhotoNoteCard onto unified PhotoTile grid

PhotoBatchGrid now requires containerWidth and renders Attachment[]
through PhotoTile. PhotoNoteCard measures its interior via onLayout
and threads the width down, eliminating the 8px clipping bug. The
SoloPendingTile, PendingFooter, aggregateStatus, and statusLabel
helpers are gone — per-tile overlays are now the sole pending-state
surface (no status-text churn).

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: `usePhotoUploadEntries` — emit `attachments`, simplify solo/batch split

Hook emits a single shape: every entry carries `attachments[]`. Solo-vs-batch is no longer a structural distinction — a 1-element array is just a 1-element grid. The session-lived `noteIdToSyntheticId` map is unchanged; a new attachment-level map (`fileIdToAttachmentKey`) is added so saved tiles inherit synthetic tile keys when the server row lands.

**Files:**
- Modify: `apps/mobile/lib/uploads/usePhotoUploadEntries.ts`
- Modify: `apps/mobile/lib/uploads/usePhotoUploadEntries.test.tsx`

- [ ] **Step 1: Update the hook contract test**

Open `apps/mobile/lib/uploads/usePhotoUploadEntries.test.tsx`. Find any test asserting on `pendingFiles`, `pendingUpload`, or the solo-vs-batch distinction. Replace those assertions with assertions on `entries[i].attachments` and on the new `fileIdToAttachmentKey` map.

Specifically add the following test block (do not remove the existing anti-flicker `noteIdToSyntheticId` test — it stays as-is):

```tsx
it('emits one attachment per pending job and surfaces fileId once registered', async () => {
  // ... existing setup that enqueues two image jobs in batch 'b1' and waits
  // for the queue to register the first one ...
  // The new assertion shape:
  const result = hookResult.current;
  expect(result.entries).toHaveLength(1);
  const entry = result.entries[0]!;
  expect(entry.attachments).toBeDefined();
  expect(entry.attachments!.map((a) => a.key)).toEqual(['job_1', 'job_2']);
  expect(entry.attachments![0]!.isPending).toBe(true);
  // Once registerFile lands for job_1 the queue snapshot exposes fileId
  // on the job; the synthetic attachment must surface it so the merge
  // layer (GenerateReportProvider) can resolve the saved-row remap.
  await waitFor(() => {
    expect(hookResult.current.entries[0]!.attachments![0]!.fileId).toBe('fil_X');
  });
  expect(hookResult.current.fileIdToAttachmentKey.get('fil_X')).toBe('job_1');
});
```

Replace the existing `batchToEntry` / `jobToSoloEntry` shape assertions to expect `entry.attachments` with the same length as input jobs, in queue order, with `isPending: true` and `sourceUri` matching `job.input.sourceUri`. Drop any assertions that exercise the old `pendingFiles` field directly.

- [ ] **Step 2: Run test to verify failures pinpoint the missing fields**

Run: `pnpm --filter @harpa/mobile test -- usePhotoUploadEntries`
Expected: FAIL on the new assertions (`fileIdToAttachmentKey is undefined`, `entry.attachments is undefined`).

- [ ] **Step 3: Rewrite `usePhotoUploadEntries.ts`**

Overwrite `apps/mobile/lib/uploads/usePhotoUploadEntries.ts`:

```ts
/**
 * usePhotoUploadEntries — derives synthetic NoteEntry rows (one per
 * pending or failed batch / solo image upload) from the upload queue
 * snapshot for a single report. The provider stitches the result
 * into the timeline so PhotoNoteCard renders the moment the user
 * picks/snaps a photo.
 *
 * The hook emits `entry.attachments` directly — the unified shape
 * consumed by PhotoTile / PhotoBatchGrid. Solo and batch are no
 * longer structurally different (a 1-element array is just a 1-tile
 * grid).
 *
 * Anti-flicker — two session-lived maps:
 *
 *   - noteIdToSyntheticId (server noteId → synthetic React key) so
 *     the saved server row inherits the synthetic's reactKey.
 *   - fileIdToAttachmentKey (server fileId → synthetic attachment
 *     key) so each individual tile within the saved row inherits the
 *     pending tile's key — keeping expo-image's memory cache hot
 *     across the pending → saved transition for every tile in the
 *     batch.
 */
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

import type { NoteEntry } from '@/lib/notes/note-entry';
import type { Attachment } from '@/lib/notes/attachments';
import { useOptionalUploadQueueContext } from './QueueProvider';
import type { UploadJob } from './types';

export interface PhotoUploadEntriesApi {
  entries: readonly NoteEntry[];
  noteIdToSyntheticId: ReadonlyMap<string, string>;
  /** Server fileId → synthetic attachment key (jobId) for tile-level remap. */
  fileIdToAttachmentKey: ReadonlyMap<string, string>;
  retry: (jobId: string) => void;
  cancel: (jobId: string) => void;
}

const EMPTY_JOBS: ReadonlyArray<UploadJob> = [];

function isVisibleImageJob(job: UploadJob, reportId: string): boolean {
  if (job.input.kind !== 'image') return false;
  if (job.input.reportId !== reportId) return false;
  return job.status !== 'completed' && job.status !== 'cancelled';
}

function parseJobCreatedAt(jobId: string): number {
  const parts = jobId.split('_');
  if (parts.length < 2) return Date.now();
  const ts = parseInt(parts[1] ?? '', 36);
  return Number.isFinite(ts) && ts > 0 ? ts : Date.now();
}

function soloSyntheticId(jobId: string): string {
  return `__upload-${jobId}`;
}

function batchSyntheticId(batchKey: string): string {
  return `__batch-${batchKey}`;
}

function jobToAttachment(job: UploadJob, position: number): Attachment {
  return {
    key: job.id,
    fileId: job.fileId ?? null,
    thumbnailFileId: job.thumbnailFileId ?? null,
    sourceUri: job.input.sourceUri,
    isPending: true,
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    error: job.error,
    position,
  };
}

function buildEntry(
  syntheticId: string,
  jobs: UploadJob[],
  authorId: string | undefined,
): NoteEntry {
  const addedAt = Math.min(...jobs.map((j) => parseJobCreatedAt(j.id)));
  const resolvedNoteId = jobs.find((j) => j.noteId)?.noteId;
  return {
    id: syntheticId,
    reactKey: syntheticId,
    authorId,
    text: '',
    addedAt,
    source: 'image',
    isPending: true,
    noteId: resolvedNoteId,
    attachments: jobs.map((j, idx) => jobToAttachment(j, idx)),
  };
}

export function usePhotoUploadEntries(
  reportId: string | null | undefined,
  authorId?: string,
): PhotoUploadEntriesApi {
  const queue = useOptionalUploadQueueContext();

  const subscribe = useCallback(
    (listener: () => void) => (queue ? queue.subscribe(listener) : () => {}),
    [queue],
  );
  const getSnapshot = useCallback(
    () => (queue ? queue.getJobs() : EMPTY_JOBS),
    [queue],
  );
  const jobs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const noteIdMapRef = useRef<Map<string, string>>(new Map());
  const fileIdMapRef = useRef<Map<string, string>>(new Map());

  const { noteIdToSyntheticId, fileIdToAttachmentKey } = useMemo(() => {
    const noteMap = noteIdMapRef.current;
    const fileMap = fileIdMapRef.current;
    if (reportId) {
      for (const job of jobs) {
        if (job.input.kind !== 'image' || job.input.reportId !== reportId) continue;
        const syntheticId = job.batchKey
          ? batchSyntheticId(job.batchKey)
          : soloSyntheticId(job.id);
        if (job.noteId && noteMap.get(job.noteId) !== syntheticId) {
          noteMap.set(job.noteId, syntheticId);
        }
        if (job.fileId && fileMap.get(job.fileId) !== job.id) {
          fileMap.set(job.fileId, job.id);
        }
        if (job.thumbnailFileId && !fileMap.has(job.thumbnailFileId)) {
          // Thumbnail file id resolves to the same tile.
          fileMap.set(job.thumbnailFileId, job.id);
        }
      }
    }
    // Fresh wrappers so memo consumers detect change-by-identity.
    return {
      noteIdToSyntheticId: new Map(noteMap),
      fileIdToAttachmentKey: new Map(fileMap),
    };
  }, [jobs, reportId]);

  const entries = useMemo<readonly NoteEntry[]>(() => {
    if (!reportId) return [];
    const visible = jobs.filter((j) => isVisibleImageJob(j, reportId));

    const batches = new Map<string, UploadJob[]>();
    const solo: UploadJob[] = [];
    for (const job of visible) {
      const key = job.batchKey ?? job.input.batchKey;
      if (key) {
        const group = batches.get(key);
        if (group) group.push(job);
        else batches.set(key, [job]);
      } else {
        solo.push(job);
      }
    }

    const result: NoteEntry[] = [];
    for (const job of solo) {
      result.push(buildEntry(soloSyntheticId(job.id), [job], authorId));
    }
    for (const [batchKey, batchJobs] of batches) {
      result.push(buildEntry(batchSyntheticId(batchKey), batchJobs, authorId));
    }
    result.sort((a, b) => a.addedAt - b.addedAt);
    return result;
  }, [jobs, reportId, authorId]);

  const retry = useCallback(
    (jobId: string) => {
      if (!queue) return;
      void queue.retry(jobId);
    },
    [queue],
  );
  const cancel = useCallback(
    (jobId: string) => {
      if (!queue) return;
      queue.remove(jobId);
    },
    [queue],
  );

  return { entries, noteIdToSyntheticId, fileIdToAttachmentKey, retry, cancel };
}
```

- [ ] **Step 4: Run hook tests to verify they pass**

Run: `pnpm --filter @harpa/mobile test -- usePhotoUploadEntries`
Expected: PASS.

- [ ] **Step 5: Run the full mobile suite**

Run: `pnpm --filter @harpa/mobile test`
Expected: PASS. `PhotoNoteCard.test` keeps passing (entries it constructs now go through `entry.attachments` directly). `UploadQueueStrip.test` still passes (its inputs come straight from the queue snapshot, unchanged).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @harpa/mobile typecheck`
Expected: PASS. The `PhotoUploadEntriesApi` return shape gained a field; `GenerateReportProvider` does not yet consume it (next task).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/lib/uploads/usePhotoUploadEntries.ts apps/mobile/lib/uploads/usePhotoUploadEntries.test.tsx
git commit -m "refactor(mobile): usePhotoUploadEntries emits attachments[]

Drops the solo-vs-batch split and the legacy pendingUpload/pendingFiles
writes. Adds a fileIdToAttachmentKey map so the provider can remap
saved tile keys to their pending counterparts, extending anti-flicker
from the entry level to the attachment level.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: `GenerateReportProvider` — merge saved notes through `attachments`

Saved notes are rebuilt to carry an `attachments[]` derived via `buildAttachments`. The pending overlay then remaps each saved entry's `reactKey` (entry-level, existing) **and** every attachment's `key` (new). `photoGallery` is rewritten to iterate attachments.

**Files:**
- Modify: `apps/mobile/features/generate/GenerateReportProvider.tsx`
- Modify: `apps/mobile/features/generate/GenerateReportProvider.test.tsx` (if it covers timeline merge; otherwise leave)

- [ ] **Step 1: Write a merge-layer test**

Add (or extend) a test in `apps/mobile/features/generate/GenerateReportProvider.test.tsx` that:

1. Seeds a pending batch with 2 image jobs (batchKey `b1`), enters the in-memory store.
2. Lets the queue flip the first job to `completed` and registers `fileId: 'fil_1'`, `noteId: 'note_1'`.
3. Saves a server note `{ id: 'note_1', files: [{ id: 'fil_1', ... }] }` into the store.
4. Asserts that the merged timelineItems contain a single entry with `reactKey === '__batch-b1'` and `entry.attachments[0].key === 'job_…'` (the synthetic key, not `'fil_1'`).
5. Asserts `photoGallery` includes `{ noteId: 'note_1', fileId: 'fil_1' }`.

If no test file exists at that path, create one. Use the same harness style as `PhotoNoteCard.test.tsx` (testing-library/react-native + a stub QueueProvider).

```tsx
it('remaps saved attachment keys back to their pending synthetic keys', async () => {
  // ...harness setup omitted; see neighbours for store/queue stubs...
  expect(merged.timelineItems).toHaveLength(1);
  const entry = merged.timelineItems[0]!;
  expect(entry.reactKey).toBe('__batch-b1');
  const att = entry.attachments![0]!;
  expect(att.key.startsWith('job_')).toBe(true);
  expect(att.fileId).toBe('fil_1');
  expect(merged.photoGallery).toEqual([
    expect.objectContaining({ noteId: 'note_1', fileId: 'fil_1' }),
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @harpa/mobile test -- GenerateReportProvider`
Expected: FAIL — saved entries have no `attachments` or `attachments[0].key === 'fil_1'`.

- [ ] **Step 3: Update the timelineItems memo and photoGallery memo**

In `apps/mobile/features/generate/GenerateReportProvider.tsx`:

a) Destructure the new `fileIdToAttachmentKey` from `usePhotoUploadEntries`:

```tsx
const {
  entries: pendingEntries,
  noteIdToSyntheticId,
  fileIdToAttachmentKey,
  retry: retryUpload,
  cancel: cancelUpload,
} = usePhotoUploadEntries(reportId, currentUser?.id);
```

b) Replace the saved-note → `NoteEntry` mapper in the `timelineItems` memo so each saved note carries `attachments`, and overlay the attachment-key remap:

```tsx
import { buildAttachments } from '@/lib/notes/attachments';

const remappedSaved = savedNotes.map((note) => {
  const attachments = buildAttachments(note).map((att) => {
    const synthetic = att.fileId
      ? fileIdToAttachmentKey.get(att.fileId)
      : undefined;
    return synthetic ? { ...att, key: synthetic } : att;
  });
  const remappedReactKey = noteIdToSyntheticId.get(note.id) ?? note.id;
  return {
    ...savedNoteToEntry(note, currentUser),
    reactKey: remappedReactKey,
    attachments,
  } satisfies NoteEntry;
});

// existing dedupe: drop pending entries whose noteId now appears in savedNotes
const savedNoteIds = new Set(savedNotes.map((n) => n.id));
const survivingPending = pendingEntries.filter(
  (e) => !e.noteId || !savedNoteIds.has(e.noteId),
);

const merged = [...remappedSaved, ...survivingPending].sort(
  (a, b) => a.addedAt - b.addedAt,
);
```

c) Rewrite `photoGallery` (currently iterates `e.files` then falls back to `e.fileId`) to iterate attachments:

```tsx
const photoGallery = useMemo(() => {
  const items: PhotoGalleryItem[] = [];
  for (const entry of timelineItems) {
    if (!entry.attachments) continue;
    for (const att of entry.attachments) {
      if (!att.fileId || !entry.noteId) continue;
      items.push({
        noteId: entry.noteId,
        fileId: att.fileId,
        thumbnailFileId: att.thumbnailFileId ?? null,
      });
    }
  }
  return items;
}, [timelineItems]);
```

Delete the now-dead branch that read `entry.files` / `entry.fileId` for photos. Voice notes (which still read `entry.fileId`) are unrelated to `photoGallery` — leave that path alone.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @harpa/mobile test -- GenerateReportProvider`
Expected: PASS.

- [ ] **Step 5: Run full mobile tests + typecheck**

Run: `pnpm --filter @harpa/mobile test`
Run: `pnpm --filter @harpa/mobile typecheck`
Expected: both PASS. If `savedNoteToEntry` still writes `files`/`pendingFiles`/`pendingUpload`, leave them for now — Task 10 removes them after every consumer has migrated.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/features/generate/GenerateReportProvider.tsx apps/mobile/features/generate/GenerateReportProvider.test.tsx
git commit -m "refactor(mobile): merge saved notes through attachments[]

Saved notes now carry attachments built via buildAttachments. The
pending overlay remaps both noteId→reactKey (entry-level) and
fileId→attachment.key (tile-level), so the entire grid keeps its
identity across the pending → saved transition. photoGallery is
rewritten to iterate attachments.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Delete `UploadQueueStrip`

The bottom upload-progress strip is replaced by per-tile state in `PhotoTile`. The component has no external mount sites (verified by grep at plan time).

**Files:**
- Delete: `apps/mobile/components/uploads/UploadQueueStrip.tsx`
- Delete: `apps/mobile/components/uploads/UploadQueueStrip.test.tsx`

- [ ] **Step 1: Confirm no external mounts remain**

Run: `grep -R "UploadQueueStrip" apps/mobile --include='*.ts' --include='*.tsx' | grep -v "UploadQueueStrip.tsx\|UploadQueueStrip.test.tsx"`
Expected: no output. If a consumer surfaces, stop and delete the import there (it should now render nothing).

- [ ] **Step 2: Delete the files**

Run:
```bash
git rm apps/mobile/components/uploads/UploadQueueStrip.tsx apps/mobile/components/uploads/UploadQueueStrip.test.tsx
```

- [ ] **Step 3: Run mobile tests + typecheck**

Run: `pnpm --filter @harpa/mobile test && pnpm --filter @harpa/mobile typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(mobile): remove UploadQueueStrip

Replaced by per-tile progress and error states in PhotoTile. The strip
had no external mount sites.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Migrate `PhotoGridTile` consumers to `PhotoTile`, then delete

`ImageNoteCard`, `PhotoNoteRow`, and `ReportPhotos` render saved-only tiles. Each builds a single `Attachment` inline (from its `NoteFile` / equivalent) and renders `PhotoTile`. After all three migrate, `PhotoGridTile` is deleted.

**Files:**
- Modify: `apps/mobile/components/notes/ImageNoteCard.tsx`
- Modify: `apps/mobile/components/reports/detail/PhotoNoteRow.tsx`
- Modify: `apps/mobile/components/reports/detail/ReportPhotos.tsx`
- Delete: `apps/mobile/components/notes/PhotoGridTile.tsx`
- Delete: `apps/mobile/components/notes/PhotoGridTile.test.tsx` (if it exists)

- [ ] **Step 1: Build a small saved-only adapter helper**

Add to `apps/mobile/lib/notes/attachments.ts`:

```ts
import type { NoteFile } from '@/lib/notes/note-entry';

export function attachmentFromSavedFile(file: NoteFile, position = 0): Attachment {
  return {
    key: file.id,
    fileId: file.id,
    thumbnailFileId: file.thumbnailFileId ?? null,
    sourceUri: file.localUri ?? null,
    isPending: false,
    jobId: null,
    status: 'completed',
    progress: 1,
    error: null,
    position,
  };
}
```

Adjust `NoteFile` import path to whatever exists today (it's defined in `apps/mobile/lib/notes/note-entry.ts`). If `NoteFile` doesn't expose `localUri`, pass through whatever field the existing consumers use today (check each consumer's prop access).

- [ ] **Step 2: Migrate `ImageNoteCard.tsx`**

Find the `PhotoGridTile` usage. Replace with:

```tsx
import { PhotoTile } from '@/components/notes/PhotoTile';
import { attachmentFromSavedFile } from '@/lib/notes/attachments';

// inside render — `file` is the existing variable name; match it
<PhotoTile
  attachment={attachmentFromSavedFile(file)}
  size={TILE_SIZE}
  onPress={() => onPressPhoto?.(file)}
/>
```

Where `TILE_SIZE` is whatever sizing the card used previously (pass through the existing measurement; don't introduce a new sizing model).

Drop the now-unused `PhotoGridTile` import.

- [ ] **Step 3: Migrate `components/reports/detail/PhotoNoteRow.tsx`**

Same change pattern: build an `Attachment` per file via `attachmentFromSavedFile`, render `PhotoTile` with whatever `size` and `onPress` the row used previously. Drop the `PhotoGridTile` import.

- [ ] **Step 4: Migrate `components/reports/detail/ReportPhotos.tsx`**

Around line 87, same pattern. Drop the `PhotoGridTile` import.

- [ ] **Step 5: Delete `PhotoGridTile`**

Run:
```bash
git rm apps/mobile/components/notes/PhotoGridTile.tsx
# Only if a test exists alongside:
git rm -f apps/mobile/components/notes/PhotoGridTile.test.tsx 2>/dev/null || true
```

Verify no stragglers:
```bash
grep -R "PhotoGridTile" apps/mobile --include='*.ts' --include='*.tsx'
```
Expected: no output.

- [ ] **Step 6: Test + typecheck**

Run: `pnpm --filter @harpa/mobile test && pnpm --filter @harpa/mobile typecheck`
Expected: PASS. Saved-only consumers render the same visual as before because `PhotoTile` with `isPending: false` and `progress: 1` skips overlay / ring rendering.

- [ ] **Step 7: Commit**

```bash
git add -A apps/mobile/components/notes apps/mobile/components/reports/detail apps/mobile/lib/notes/attachments.ts
git commit -m "refactor(mobile): migrate PhotoGridTile consumers to PhotoTile

ImageNoteCard, PhotoNoteRow, and ReportPhotos now build an Attachment
inline via attachmentFromSavedFile and render PhotoTile. PhotoGridTile
is deleted — PhotoTile is the single tile primitive for both pending
and saved photos.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Drop legacy photo-batch fields from `NoteEntry`

After consumers go through `attachments[]`, the legacy `pendingUpload`, `pendingFiles`, and photo-batch `files` reads on `NoteEntry` are dead. Voice-note fields (`fileId`, `thumbnailFileId`) stay.

**Files:**
- Modify: `apps/mobile/lib/notes/note-entry.ts`
- Modify: `apps/mobile/lib/notes/savedNoteToEntry.ts` (or wherever `savedNoteToEntry` lives — verify path before editing)
- Modify: any test fixtures that construct `NoteEntry` literals with these fields

- [ ] **Step 1: Find every remaining reader**

Run:
```bash
grep -Rn "pendingUpload\|pendingFiles" apps/mobile --include='*.ts' --include='*.tsx'
grep -Rn "entry\.files\|note\.files\b" apps/mobile --include='*.ts' --include='*.tsx'
```

For each hit on the second grep, decide:
- If the file is a **photo** consumer, it must already read `attachments` (migrated in T4/T5/T9). If it still reads `.files`, fix the migration.
- If it's a **voice / other** consumer touching `note.files` server-side, leave it.

- [ ] **Step 2: Drop the fields from the type**

In `apps/mobile/lib/notes/note-entry.ts`, remove `pendingUpload`, `pendingFiles`, and the photo-batch `files` field. (Keep `fileId`, `thumbnailFileId` — voice notes use them.)

Add a JSDoc comment above `attachments`:

```ts
/**
 * Unified ordered list of photo tiles for image-source entries.
 * Solo and batch photos share this shape; voice and text entries
 * leave it undefined.
 */
attachments?: ReadonlyArray<Attachment>;
```

- [ ] **Step 3: Drop dead writes from `savedNoteToEntry`**

Stop assigning the deleted fields. The function should now produce an entry without `pendingUpload`/`pendingFiles`/`files`; the provider adds `attachments` itself (Task 7). If `savedNoteToEntry` is the natural place to compute `attachments`, move the `buildAttachments` call into it and simplify the provider — pick whichever feels cleaner once you see the file.

- [ ] **Step 4: Typecheck and fix any compile errors**

Run: `pnpm --filter @harpa/mobile typecheck`
Expected: PASS after fixing the residual readers found in Step 1. If errors point at code unrelated to photos (e.g. voice), revert that field's removal — only the photo-batch fields are in scope.

- [ ] **Step 5: Run mobile tests**

Run: `pnpm --filter @harpa/mobile test`
Expected: PASS. Failing tests that constructed `NoteEntry` literals with the removed fields must be updated to use `attachments` instead.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/notes/note-entry.ts apps/mobile/lib/notes/savedNoteToEntry.ts apps/mobile
git commit -m "refactor(mobile): drop legacy photo fields from NoteEntry

pendingUpload, pendingFiles, and the photo-batch files field are
replaced by attachments[]. Voice-note fileId/thumbnailFileId stay.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 11: Docs updates

Architecture + plan docs reflect the new data shape and UX.

**Files:**
- Modify: `docs/v4/arch-batch-photo-notes.md`
- Modify: `docs/v4/plan-camera-upload-pipeline.md`

- [ ] **Step 1: Update `arch-batch-photo-notes.md`**

In the data-shape section, replace any description of `pendingUpload`/`pendingFiles`/photo-batch `files` with the unified `attachments` model. Document:

- `Attachment` shape (key, fileId, thumbnailFileId, sourceUri, isPending, jobId, status, progress, error, position).
- The two-level anti-flicker maps (`noteIdToSyntheticId` + `fileIdToAttachmentKey`).
- The "always-grid" rule (1 attachment = 1-cell grid).
- The overflow cap at 9 tiles with `+N` chip on tile #9.

Replace the UX section's references to `UploadQueueStrip` with the per-tile lifecycle (idle → uploading ring → error overlay with Retry/Cancel → fade to saved).

- [ ] **Step 2: Update `plan-camera-upload-pipeline.md`**

Append a row to the status table (or equivalent section) noting the UI redesign:

```markdown
| 2026-05-27 | UI redesign: unified PhotoTile + always-grid layout | done | docs/superpowers/plans/2026-05-27-photo-upload-pipeline-ui.md |
```

If the doc has no status table, add a short "## 2026-05-27 — UI redesign" subsection summarizing what shipped and linking the plan + spec.

- [ ] **Step 3: Lint markdown if the repo has a markdown linter; otherwise skim for broken links**

Run: `grep -n "PhotoGridTile\|UploadQueueStrip\|pendingFiles\|pendingUpload" docs/v4/arch-batch-photo-notes.md docs/v4/plan-camera-upload-pipeline.md`
Expected: no output (except possibly in a "historical" section explicitly framed as the old design).

- [ ] **Step 4: Commit**

```bash
git add docs/v4/arch-batch-photo-notes.md docs/v4/plan-camera-upload-pipeline.md
git commit -m "docs(v4): photo upload pipeline UI redesign

Documents the unified Attachment shape, two-level anti-flicker, and
per-tile lifecycle that replaces UploadQueueStrip and the legacy
pendingUpload/pendingFiles split.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 12: Final verification + spec self-review

- [ ] **Step 1: Run the full mobile suite**

Run: `pnpm --filter @harpa/mobile typecheck`
Run: `pnpm --filter @harpa/mobile lint`
Run: `pnpm --filter @harpa/mobile test`
Expected: PASS on all three.

- [ ] **Step 2: Bundle smoke (optional but cheap)**

Run: `pnpm --filter @harpa/mobile bundle:smoke` (if the script exists in the mobile workspace — check `apps/mobile/package.json`)
Expected: bundles without errors.

- [ ] **Step 3: Spec self-review**

Open `docs/superpowers/specs/2026-05-27-photo-upload-pipeline-ui-design.md` side-by-side with this plan. For each spec section / requirement, point to the implementing task. List any gaps and either add a task or amend an existing one.

Verify in particular:
- 3×N grid fits inside the card (no horizontal overflow) — covered by T4's `containerWidth` measurement.
- Per-tile progress ring renders during upload — T2 + T3.
- Error overlay with Retry/Cancel — T3.
- No layout shift on pending → saved transition — T6 + T7 anti-flicker maps.
- Overflow chip at tile #9 — T4.

- [ ] **Step 4: Manual smoke (if a simulator is handy)**

Boot the app against a dev report, pick 1, 4, and 10 photos in three separate batches. Confirm:
- Grid renders inside the card.
- Each tile shows its own ring.
- Killing one upload mid-flight surfaces an error overlay with working Retry/Cancel.
- After all complete, no tile blinks or repositions.

- [ ] **Step 5: Open the PR against `dev`**

Push the branch and open a PR with base `dev`. PR description should link the spec + plan and call out the deleted files (`UploadQueueStrip`, `PhotoGridTile`) for reviewer awareness.
