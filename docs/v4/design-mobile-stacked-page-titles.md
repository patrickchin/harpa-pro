# Design — mobile stacked page titles

Status: implemented.

## Problem

Most mobile screens still render the page title inside the same row as the
back button, profile button, or draft overflow button. That works for short
labels like `Profile`, but it truncates user-authored titles such as project
names and report titles on phones. It also creates an inconsistent hierarchy:
the finalized report screen already moved its title onto a dedicated row via
`ScreenHeader`'s `stackedTitle` path, while the rest of the app still uses the
older inline title layout.

The requested product rule is simpler:

- every page title lives on its own full-width row;
- that row sits directly below the back/profile controls row;
- titles wrap instead of tail-ellipsizing.

## Pre-change surface inventory

Before this change, `apps/mobile/components/primitives/ScreenHeader.tsx`
already contained the right structural seam: the top controls row and the
title row could be separated with `stackedTitle`.

Production usage at the time of the change:

- 18 `ScreenHeader` call sites across 16 runtime files.
- Only 1 call site currently opts into the stacked layout:
  `components/reports/detail/ReportDetailHeader.tsx`.
- The saved-report loading branch still uses the inline layout in
  `screens/saved-report.tsx`, so the title geometry differs between loading and
  loaded states.
- `screens/report-debug.tsx` is the only outlier that mounts `ScreenHeader`
  without the usual outer `px-5 py-4` wrapper.

Affected routed screens:

- `projects-list`
- `project-home`
- `reports-list`
- `generate-notes`
- `saved-report` loading branch
- `report-notes`
- `project-new`
- `project-edit`
- `project-members`
- `profile`
- `account`
- `usage`
- `developer`
- `report-debug`

Affected full-screen modal surface:

- `components/reports/PdfPreviewModal.tsx`

## Recommendation

Use the existing `ScreenHeader` primitive as the single migration point instead
of hand-building title rows per screen.

Promote stacked titles to the default page-header behavior:

- replace the current boolean mental model with an explicit layout mode such as
  `titleLayout="stacked" | "inline"` if that makes the API clearer;
- default runtime page usage to `stacked`;
- keep an explicit `inline` escape hatch for any future compact or embedded
  header that is not a full page.

For the current app surface, no production screen needs the inline exception.
The requirement is mobile-wide, and every current `ScreenHeader` consumer is a
page or page-like full-screen modal. The existing `stackedTitle` escape hatch
remains available only for a future compact, non-page embed; it now defaults to
`true`.

## Header structure

The shared structure should be:

1. Controls row.
2. Title row.
3. Optional supporting row.

Controls row:

- keep the existing `min-h-touch` height and current touch target sizing;
- keep back, trailing, and profile/actions controls in this row only;
- use a flexible spacer in the middle when the title is stacked.

Title row:

- render the title as a dedicated full-width `Text`;
- remove `numberOfLines={1}` and tail ellipsis in stacked mode;
- allow natural wrapping for long project/report names;
- keep the title within the screen's existing horizontal page padding, not
  edge-to-edge across the glass.

Supporting row:

- keep `eyebrow`, `subtitle`, and `titleAccessory` below the title row;
- do not move subtitles back into the controls row.

This preserves the current layout contract for screens such as
`reports-list`, where the project name subtitle should remain secondary to the
page title.

## Screen-specific notes

`saved-report` needs special handling because it already has both loading and
loaded header variants:

- `ReportDetailHeader` already uses the stacked title row and becomes the
  canonical loaded-state shape.
- The loading branch in `screens/saved-report.tsx` must adopt the same stacked
  geometry so the title block does not jump on hydrate.
- This follows `docs/v4/arch-mobile-skeletons.md` and Pitfall 17: the outer
  scaffold must match between loading and loaded states.

`generate-notes` should keep its draft overflow button in the top controls row.
The action row and tab bar remain below the title row; this change does not
collapse those controls into the header.

`project-home` is the highest-value non-report surface because the project
name is user-authored and often long. Its client/address block should stay
below the stacked header unchanged.

`reports-list` should keep the project name as `subtitle`, but that subtitle
now sits below the full-width `Reports` title row.

`report-debug` should be normalized to the common outer header wrapper when the
change lands. Without that padding, a wrapped title row will read as a special
case even though the screen uses the same primitive.

`PdfPreviewModal` should stay in scope. It is a full-screen page-like modal
with a header, not a compact inline panel, so giving it the same stacked title
behavior keeps the app consistent.

## Accessibility and behavior

- Keep only one rendered title node in stacked mode. Do not render a hidden
  inline duplicate for accessibility.
- Add `accessibilityRole="header"` to the title text if the current screen
  tests permit it.
- Preserve visual and focus order: controls row first, title row second,
  supporting metadata third.
- Keep existing back-button labels and action-button labels unchanged.
- Wrapping is the point of the change, so do not reintroduce title truncation
  through parent `flex-row` constraints or nested `overflow-hidden` wrappers.

## Alternatives considered

### 1. New `PageHeader` component

Rejected. It would duplicate most of `ScreenHeader`, force every screen to
choose between two nearly identical primitives, and increase the chance that
future header fixes land in one component but not the other.

### 2. Per-screen manual title rows

Rejected. That repeats the same layout work across 16 files, makes visual
drift likely, and breaks the "shared scaffold" rule from
`arch-mobile-skeletons.md`.

### 3. Keep inline titles except for reports

Rejected. It does not satisfy the product request and leaves long project/page
titles truncating on smaller devices.

## Verification plan

Code-level verification:

- update `ScreenHeader.test.tsx` snapshots to cover the stacked default and any
  explicit inline opt-out;
- update the saved-report tests so loading and loaded header shapes both expect
  the stacked title row;
- update screen tests that assert header text placement or snapshots for the
  affected pages.

Behavior verification:

- manual iOS and Android simulator pass on the highest-risk screens:
  `project-home`, `generate-notes`, `saved-report`, `report-notes`,
  `reports-list`, and `PdfPreviewModal`;
- confirm long titles wrap without clipping;
- confirm the back/profile/draft overflow controls remain reachable and aligned
  on the first row;
- confirm no visible title-row jump between loading and loaded states on
  `saved-report`.

Layout-shift verification:

- reuse the existing `useLayoutShiftProbe` landmarks on screens that already
  have them;
- if the saved-report header probe does not isolate the title row clearly
  enough, add a matching title-row probe to both loading and loaded branches
  before landing the UI change.

## Rollout

Implement this as one shared-header change plus targeted consumer cleanup:

1. Update `ScreenHeader`.
2. Convert all current page consumers to the stacked layout by default.
3. Align saved-report loading with the loaded report header.
4. Normalize `report-debug` padding.
5. Run focused mobile tests and a manual simulator sweep before broader UI
   work resumes.
