# Design — Report Title Consistency + Finalized Layout Cleanup

Status: ✅ **Shipped.** `report.meta.title` is now the single canonical
title surface (verified via `packages/report-core/src/report-helpers.ts`
and the generated-report tests). Doc retained for design rationale.

## Problem

The report title surfaces inconsistently across the three places it
appears:

1. **Reports list row** (`/projects/[project]/reports`) — shows
   `Report #N · {date}` from `getReportTitle()` in
   `apps/mobile/lib/projects/project-reports-list.ts`.
2. **Draft / generate header** (`/projects/[project]/reports/[number]/generate`) —
   shows the hardcoded fallback `"New Report"` until the LLM populates
   `report.meta.title` (`GenerateReportProvider.tsx:702`).
3. **Finalized header** (`/projects/[project]/reports/[number]`) —
   renders `report.report.meta.title` with **no fallback**
   (`ReportDetailHeader.tsx:40`). When the LLM never populates a title
   the heading is blank, leaving a band of empty whitespace above the
   tab bar.

Additionally, the finalized screen still renders `ReportDetailTabBar`
even though Notes + Edit are hidden when finalized
(`saved-report.tsx:401-407`) — so the user sees a one-pill tab bar
with no choices to make.

The user wants:

- The report title to always show, in the same place on every surface
- The per-project report number (`#N`) to always show in small text
- The redundant one-pill tab bar removed on finalized

## Title rule

Apply the same rule everywhere:

```
title = report.meta.title?.trim() || `Report #${number}`
```

`#N` is always rendered in smaller text next to (or under) the title,
even when the title itself fell back to `Report #N`. The minor visual
repetition is accepted in exchange for absolute consistency across
surfaces.

The optimistic-create list row (no `number` yet) keeps its existing
`"New report"` placeholder.

## Per-surface layout

| Surface | Title (large) | Small text |
|---|---|---|
| Reports list row | `meta.title` or `"Report #N"` | `#N · {visit date or created date}` (existing meta line); status chip (`Draft` / nothing) remains on the right |
| Draft / generate header | `meta.title` or `"Report #N"` | `#N` |
| Finalized header | `meta.title` or `"Report #N"` | `#N · {visit date}` — replaces the standalone visit-date pill |

The finalized header **drops** the report-type eyebrow
(`Site Visit` etc.) and the visit-date pill button. The Actions button
stays.

## Finalized layout cleanup

When `reportStatus === 'finalized'`:

- **Skip** rendering `ReportDetailTabBar` entirely (don't just hide its
  pills — remove the container so there's no extra padding band).
- Render the Report pane (the `ReportView` + `ReportPhotos` block)
  directly under the header. The existing `activeTab` state still
  drives draft behaviour, but for finalized the screen short-circuits
  to the report pane.

## Touchpoints

1. `apps/mobile/lib/projects/project-reports-list.ts`
   - `ReportListItem` doesn't carry `meta.title` today. Two paths:
     - **(b) preferred:** thread `metaTitle: string | null` into
       `ReportListItem`. The reports list endpoint already returns the
       body's meta — see `useReportsListQuery` / api-contract list
       projection — surface `metaTitle` there (or in the existing list
       items shape) and consume it in the list row.
   - `getReportTitle(item)` returns `item.metaTitle?.trim() || `Report #${item.number}``.
   - `getReportMeta(item)` returns the small-text line:
     `#N · {visitDate ?? createdAt}` plus the existing draft/finalized
     suffix.

2. `apps/mobile/screens/reports-list.tsx`
   - No structural change. The row already calls `getReportTitle` and
     `getReportMeta`; the rule change happens inside those helpers.
   - Verify the row still fits — `Report #N` is shorter than the
     current `Report #N · {date}`, so this is purely additive
     whitespace.

3. `apps/mobile/features/generate/GenerateReportProvider.tsx:702`
   - Change `reportTitle: reportTitle?.trim() || 'New Report'` to
     `reportTitle: reportTitle?.trim() || `Report #${reportNumber}``.
   - Surface the `#N` small text. Easiest path: thread a new
     `reportNumberLabel: string` (e.g. `#7`) through the context value
     and consume it in `GenerateNotes` next to the `ScreenHeader`.
     Alternative: extend `ScreenHeader` with a `subtitle` prop and
     pass `#${reportNumber}` (subtitle is already used in
     `ReportsList` — `<ScreenHeader subtitle={projectName}>` — so the
     primitive supports it).

4. `apps/mobile/components/reports/detail/ReportDetailHeader.tsx`
   - Apply the fallback: `title={report.report.meta.title?.trim() || `Report #${reportNumber}`}`.
   - Remove the `eyebrow={toTitleCase(report.report.meta.reportType)}` prop.
   - Remove the standalone visit-date pill `<View>` and the report-type
     eyebrow. Render `#N · {visit date}` as a small subtitle on the
     `ScreenHeader` instead (or directly below it, depending on what
     `ScreenHeader` exposes — check whether `subtitle` can render
     bullet-separated parts; otherwise a plain `Text` line below
     `ScreenHeader` is fine).
   - The Actions `<Button>` stays.

5. `apps/mobile/screens/saved-report.tsx:401-407`
   - When `isFinal` is true, do not render `ReportDetailTabBar`. The
     simplest implementation: wrap the tab bar render in
     `{!isFinal ? <ReportDetailTabBar ... /> : null}`.
   - In the body, when `isFinal`, always render the Report pane (skip
     the `activeTab === 'report'` ternary for finalized — the other
     two branches are unreachable in that state anyway, but
     short-circuiting makes the intent explicit and avoids relying on
     the `useEffect` that resets `activeTab` to `'report'`).

## Test updates

- `apps/mobile/screens/reports-list.test.tsx` — update title-row
  assertions (no more `· {date}` suffix in the title; the date is now
  in the meta line).
- `apps/mobile/screens/saved-report.test.tsx` — assert no tab bar
  rendered when finalized; assert the title fallback when `meta.title`
  is empty; assert no `Site Visit` eyebrow.
- `apps/mobile/screens/generate-report-tab.test.tsx` — update the
  `"New Report"` assertion to expect `"Report #N"` fallback.

## Out of scope

- **No** changes to PDF rendering. PDFs already use
  `report.meta.title` directly and the LLM-generated value is fine
  there.
- **No** new user-editable title field; if a user wants to change the
  title they edit it via the existing Edit tab → `meta.title` field.
- **No** changes to the Notes route / Actions menu wiring on
  finalized — notes are still reachable via Actions → View notes
  (`saved-report.tsx:297-304`).

## Open questions

None blocking. Implementation can proceed.

## Follow-up: meta envelope restoration

After this design shipped (PR #90), it surfaced that PR #36 had dropped
the `meta` envelope from `reportBody` as collateral when realigning
prompts to v4 (see `docs/bugs/README.md` 2026-05-28). The follow-up
restores a slim `meta.{title, summary, visitDate, tags}` envelope and
surfaces those fields:

- The detail view adds a `SummaryLead` paragraph and a `TagChips` row.
- Saved-report header behaviour from this design is unchanged
  (title-only, no eyebrow, no subtitle).

Earlier scoping mentioned `reportType`, `location`, `projectPhase`, and
`riskLevel` keys; those were dropped before merge — they were
enum-shaped fields that the UI had no robust place for yet and the LLM
couldn't reliably populate. We can re-add them (or replacements like
`weatherSummary`, `crewSize`, `permitNumber`) when there's a concrete
surface that needs them.

Full design + decisions in
[`../superpowers/specs/2026-05-28-report-meta-restoration-design.md`](../superpowers/specs/2026-05-28-report-meta-restoration-design.md).

## Follow-up: published review controls

Published reports now expose two tabs, Report and Review. The title remains a
full-width wrapping row. Directly below it, the two tab buttons and Actions
button share one horizontal control row: the tab group flexes to use the
available width and Actions remains a fixed-width trailing control. This keeps
all report-level navigation together without constraining or truncating the
title.
