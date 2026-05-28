# Mobile skeleton & layout-shift policy

The mobile app uses per-screen skeleton components
(`apps/mobile/components/skeletons/*`) to show a structural
placeholder while data hydrates. If the skeleton's geometry doesn't
match the loaded content's geometry, the screen visibly jumps on
hydrate — what users perceive as "content shift" or flicker.

This doc captures the rules every loading-state screen must follow.

See also [`pitfalls.md` § Pitfall 17](./pitfalls.md#pitfall-17--state-conditional-wrappers-cause-skeleton--content-layout-shift).

## Rules

### 1. Identical outer scaffold in both states

A screen's outer chrome — SafeAreaView, ScreenHeader, "New X"
Pressable, list/scroll container, and the padding/gap around them —
must be rendered identically while `isLoading` and after data
arrives. The only thing that swaps is the inner content region (list
items, form fields, body cards).

Concretely:

- **Do not** wrap action buttons in `!isLoading && (…)`. Render
  them with `disabled={isLoading || isCreating}` instead.
- **Do not** hide the list-container padding when there's nothing
  to render. The padding belongs to the container, not the rows.
- **Do not** mount the header from one branch and the skeleton from
  another — share the header.

The v4 fix that motivated this doc was
`apps/mobile/screens/reports-list.tsx` rendering its "New report"
Pressable as `canCreate && !isLoading`. Removing `!isLoading` and
relying on `disabled` eliminated a ~88 px shift.

### 2. Share geometry constants between skeleton and screen

When a row, card, or input has a deterministic height, export the
constant from the real component (or from a `lib/*-layout.ts` file)
and import it from both sides. Example:

```ts
// lib/project-members-layout.ts
export const PROJECT_MEMBERS_LAYOUT = {
  paddingHorizontal: 20,
  paddingTop: 8,
  paddingBottom: 16,
  gap: 12,
  memberRowHeight: 76,
} as const;
```

The loaded `ScrollView`'s `contentContainerStyle` reads
`PROJECT_MEMBERS_LAYOUT`; the skeleton's outer `View` reads the same
constant. Drift becomes impossible.

For list containers, prefer inline `style={{ padding…, gap… }}` over
Tailwind tokens (`px-5`, `gap-3`) on both sides — Tailwind tokens
can change centrally and silently desync the two trees.

### 3. Reserve space for variable-size slots

For images and other content with intrinsic dimensions, give the
slot a fixed height (or `aspectRatio`) that both the skeleton box
and the loaded element share, and use `resizeMode="cover"` /
`contentFit="cover"` so the loaded image fills the box without
resizing it.

`apps/mobile/components/notes/PhotoNoteCard.tsx` (backed by `PhotoBatchGrid`) is the reference:
all three states (skeleton / error / loaded) live inside a single
`<View>` measured via `onLayout`; `PhotoBatchGrid` tiles share the
same square size so the layout is stable across the pending → saved
transition.

### 4. Render enough placeholder rows

A list skeleton must render at least as many placeholder rows as
fill the viewport, otherwise the visible area grows when real data
arrives. Three rows is the v4 default; four or five for screens
with shorter rows.

### 5. Match list container styles exactly

When the loaded list uses `FlatList`/`SectionList` with a
`contentContainerStyle`, the skeleton must reproduce the same
`paddingHorizontal`, `paddingTop`, `paddingBottom`, and `gap`. If
the loaded list has section headers, the skeleton should render at
least one section-header placeholder.

## Measurement

`apps/mobile/lib/layout-shift-probe.ts` provides a dev-only probe.

```ts
import { useLayoutShiftProbe } from '@/lib/layout-shift-probe';

const onLayout = useLayoutShiftProbe('reports-list:first-row');
return <Card onLayout={onLayout} ... />;
```

Attach the same probe id to the matching landmark on both the
skeleton tree and the loaded tree. Then in a dev build:

```sh
EXPO_PUBLIC_LAYOUT_PROBE=true pnpm --filter @harpa/mobile dev
```

The probe logs `[layout-shift] id frame=N Δy=… Δh=…` per landmark.
Call `dumpShiftReport()` from any dev surface to get a CSV summary
(`id, frames, maxDeltaY, maxDeltaHeight, score`). Acceptance is
`maxDeltaY ≤ 2 px` per landmark — small rounding is OK; anything
larger means the skeleton doesn't match.

In production, the probe is a no-op aside from a tiny bookkeeping
map that's only populated if a screen happens to call the hook.

## Landmark conventions

Use `id` strings of the form `screen-name:landmark`. Common
landmarks per screen:

| Screen | Landmarks |
|---|---|
| `projects-list` | `header`, `first-row` |
| `project-overview` | `header`, `first-card`, `last-card` |
| `reports-list` | `header`, `first-row` |
| `report-detail` | `header`, `title-block`, `summary-card`, `workers-card` |
| `project-members` | `header`, `first-row` |
| `edit-project` | `header`, `first-field`, `last-field`, `submit` |
| `account` | `avatar`, `info-notice`, `phone-field`, `company-field` |
| `image-note-card` | `slot` |

Add a `testID="<screen-name>-skeleton"` on the skeleton's outer
`View` so Maestro flows can wait for / screenshot it.

## Checklist for new loading-state screens

- [ ] Skeleton and screen share the same outer scaffold.
- [ ] Action buttons render in both states (disabled during load).
- [ ] Skeleton outer container matches list `contentContainerStyle`
      via inline style or a shared constant.
- [ ] Row / card heights come from shared constants where
      deterministic.
- [ ] Image slots have a fixed height or `aspectRatio`.
- [ ] `useLayoutShiftProbe` on ≥ 2 landmarks on both trees with
      matching ids.
- [ ] `testID="<screen>-skeleton"` on the skeleton outer.
- [ ] Vitest suite for the screen still passes (existing tests
      enforce the structural invariants).
