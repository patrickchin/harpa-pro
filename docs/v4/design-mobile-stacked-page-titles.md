# Design — report-only stacked mobile titles

Status: implemented.

## Problem

Report titles are generated or user-authored and can be too long to share a
phone-width row with Back, Profile, and other actions. Ordinary page titles
such as `Projects`, `Members`, `Usage History`, and `PDF Preview` are short and
fit comfortably in the existing controls row.

The first implementation promoted stacked titles to the app-wide default. The
product clarification narrows that behavior to report-detail surfaces only.

## Product rule

- Ordinary page titles stay inline between navigation and trailing controls.
- Report titles use a full-width wrapping row below the controls.
- The free space in a report controls row displays `Site Visit #N`.
- The lower title is descriptive only. A leading `Site Visit —`,
  `Site Visit #N —`, or `Report #N —` prefix is removed.
- If the report has no descriptive title, the lower row displays `Report`.

The report number is the per-project report number already used by routes and
test IDs. It is stable and more useful in the compact row than a truncated
copy of the report title.

## Shared header contract

`ScreenHeader` keeps inline titles as its default. Report callers opt into the
exception with:

- `stackedTitle` to render the full-width title row;
- `controlTitle` to render the compact `Site Visit #N` label between the Back
  and trailing controls.

Inline titles retain their existing one-line tail ellipsis as a defensive
constraint. Stacked report titles have no line limit or ellipsis.

## Surfaces

The report-only layout applies to:

- `screens/generate-notes.tsx`, for draft/generated report work;
- `components/reports/detail/ReportDetailHeader.tsx`, for saved draft and
  finalized reports;
- the saved-report loading header, so loading and loaded geometry match.

The following remain inline because their page labels are short rather than
report titles:

- project, report-list, member, profile, account, usage, and developer pages;
- report notes and report debug utility pages;
- the PDF Preview modal.

## Accessibility

The controls row remains first in visual and focus order. The descriptive
report title remains the sole heading and appears second. `Site Visit #N` is a
compact contextual label, not a duplicate heading.

## Verification

- `ScreenHeader` tests cover the inline default and explicit stacked opt-in.
- generate-report and saved-report tests cover `Site Visit #N`, prefix
  removal, the generic fallback, and non-truncating title behavior.
- screen snapshots verify short page titles returned to their controls rows.
- Maestro store flows assert inline headers on ordinary pages and stacked
  headers on report pages.
