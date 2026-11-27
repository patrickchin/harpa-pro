# Dashboard workspace refresh

**Status:** approved for merge, 2026-10-16
**Scope:** `apps/dashboard` visual refresh and search of loaded projects
**Revision:** selected Current layout, 2026-10-16

## Problem and goal

The office dashboard repeats strong outlines, shadows, uppercase labels, and
boxed surfaces at every level. Project data, navigation, controls, and secondary
metadata compete for attention. Report tables nest inside another bordered
card, while destructive actions carry as much visual weight as opening a
report. These choices make a practical reporting tool feel assembled from
unrelated primitives.

Refresh it as a calm office workspace for construction teams: recognizable
projects, clear report status, and a readable working document. Preserve all
routes, permissions, API calls, mutations, filters, pagination, and editor
behavior. No product metrics or activity are invented for decoration.

This contract refines the [dashboard visual system](design-dashboard-visual-system.md).
The second refinement responds to the user’s request for more character in
fonts and padding. For `apps/dashboard` only, it supersedes the system-font,
route-title-size, label-tracking, surface-radius, and density requirements in the
[mobile alignment](design-dashboard-mobile-tailwind-alignment.md) and
[typography correction](design-dashboard-typography-density-correction.md).
Their remaining rules still apply, including regular form values, readable
controls, accessible behavior, and Tailwind component styling. Mobile and the
shared palette remain unchanged.

## Visual direction

The signature is a document workspace: a quiet navigation rail frames clean
white working surfaces, and project/report identities lead each row. Warm
mobile canvas and navy ink remain recognizable. Orange identifies deliberate
actions and small brand details, rather than every eyebrow and link.

Self-host Latin variable Manrope for body copy, navigation, controls, and
metadata. Self-host Plus Jakarta Sans for route and section headings and
numeric metrics. Include font licenses beside assets, use `font-display:
swap`, preload the body face, and retain system sans fallbacks. No remote font
request or font runtime dependency is needed.

| Role                             | Typography                                                                  |
| -------------------------------- | --------------------------------------------------------------------------- |
| Route and primary object heading | Plus Jakarta Sans, 32/40 px desktop, 26/32 px below 640 px, 700, -0.035em   |
| Section heading                  | Plus Jakarta Sans, 18/26 px, 600, -0.02em                                   |
| Numeric summary                  | Plus Jakarta Sans, 40/44 px desktop, 34/40 px narrow, 700, tabular numerals |
| Body and form values             | Manrope, 16/24 px, 400                                                      |
| Row identity and controls        | Manrope, existing 14–16 px sizing, 600; project identities may retain 700   |
| Supporting metadata              | Manrope, 14/20 px, 400                                                      |
| Labels and table headings        | Manrope, 12–13/16–18 px, 600, sentence case, normal tracking                |

Use sentence case for summary labels. Reserve uppercase and modest tracking
for a single short context eyebrow when useful. Dates remain readable text
at 20–24 px rather than inheriting the 40 px numeric-metric size. Form values
remain regular weight and never inherit label tracking or text transforms.

| Foundation    | Existing value | Refreshed use                                                          |
| ------------- | -------------- | ---------------------------------------------------------------------- |
| Canvas        | `#f8f6f1`      | workspace background                                                   |
| Ink           | `#2d3a5a`      | headings, navigation, routine primary action                           |
| Paper         | `#ffffff`      | tables, document, panels                                               |
| Quiet surface | `#f1eee6`      | selected quiet states, compact icon tiles                              |
| Border        | `#b9b4a8`      | full strength on input boundaries; reduced opacity on structural rules |
| Accent        | `#ea580c`      | small brand cue or the dominant generation action                      |

All values resolve through the existing shared tokens. Structural boundaries
may use `border-border/35` through `border-border/60`; do not change the shared
palette or introduce dashboard-only color variables. Text, focus rings, input
boundaries, and semantic error boundaries retain sufficient contrast.

## Composition rules

- Preserve 10 px controls. The approved Current settings use 20 px corners
  for dashboard cards and floating panels; shared mobile tokens stay unchanged.
- Keep 44 px targets and 16 px default button/input text.
- Use 32 px between major regions on desktop and 24 px on narrow layouts.
  Keep 12–16 px for related controls and 20–24 px from a panel heading to data.
- Desktop panels use 24–28 px padding; narrow panels use 20 px. Large report
  tables keep consistent 20–24 px horizontal cell padding and 16–20 px vertical
  row padding. Controls and dense editor tools retain their useful density.
- The approved Current settings use 20 px page padding at every viewport
  width, including above and below the page. Avoid adding these gutters again
  inside collection panels.
- Default content panels are flat white with a soft structural boundary.
  Reserve shadows for dialogs, popovers, and genuinely raised controls.
- A collection gets one outer surface. A table within a content section has
  no second shadow, rounded frame, or opaque boxed header competing with it.
- Keep short section headings in sentence case. Uppercase is appropriate for
  small table labels and occasional context labels; avoid repeated orange
  eyebrows on every section.
- Use Lucide icons only where they identify a destination, object, status, or
  action. Icon tiles use muted token fills and no strong outline.
- Animation is limited to existing short hover/focus transitions and loading
  indicators. No page entrance animation or decorative motion.

## Application shell

Keep the existing 268 px desktop rail and content maximum. Use a light navy
wash made from existing tokens, a quiet dividing rule, 20 px internal padding,
and the real Harpa Pro brand. The brand region is clearly separated from navigation by
space. Project context is a compact, flat switch surface with the project name
and role; it must remain a working link to Projects.

Navigation rows stay 44 px. Inactive rows have muted ink; active rows use a
more defined navy-tinted fill, navy text/icons, a slim navy leading accent,
and clear `aria-current` state. Primary buttons retain navy fills with a
restrained shadow; orange remains reserved for generation and brand details.
Keep
the account control at the bottom of
the desktop rail, with initials and email/name. Do not add fake search,
notifications, or a disabled global command bar.

A compact top context bar may show the actual company/project and identify
the office workspace. Keep it subordinate to the page heading and avoid
repeating the same description in both regions.

The page header is consistent across projects, members, settings, reports, and
report workspace: muted contextual eyebrow when needed, heading, concise
description, and one action cluster. Actions wrap below long titles. There is
no extra decorative dashboard welcome banner.

## Project and overview surfaces

Project collections emphasize project identity. Desktop tables may combine a
compact project icon tile, project name, and secondary address in the first
column, while preserving client, role, and last-update information. Rows have
subtle separators and a quiet hover surface. Names remain working links with
visible keyboard focus. Narrow layouts use the existing cards, with fewer
repeated rules and labels, while retaining every field.

A labeled local search may filter the loaded project collection by project,
client, or address. Show a truthful result count, preserve the unfiltered
collection, and distinguish a search with no matches from an account with no
projects. Clearing search restores all loaded projects.

The overview uses one aligned report-summary group. Existing total reports,
draft count, and latest report remain the only metrics. Reduce the sense of
three unrelated floating cards through equal geometry, 24–28 px desktop
padding, and restrained dividers. Numeric totals use the new large metric
scale, with quieter labels and more space before supporting links. A date
must not be styled as a fabricated numeric metric.

Recent reports use one white collection surface with a header and flat table
or responsive rows. Keep project members subordinate to reports. The next-step
panel uses warning color only when drafts actually need attention; an up-to-date
project uses a neutral or success treatment, not a warning panel.
A navy action panel is also appropriate when its contrast is readable and
the copy accurately reflects the existing draft state.

## Reports and document workspace

The reports page uses the common header. Place status filtering and refresh in
a flat collection toolbar rather than a separate floating card. Preserve the
existing select and URL-backed filter behavior. Report titles use navy text
and clear hover/focus affordances; remove permanent orange underlines.

Keep statuses compact and readable with text labels. Draft is neutral;
finalized is success; source changes needing regeneration are warning. An
ordinary report row should lead with report identity and status. Delete remains
accessible but uses a quiet danger action (an icon with a full accessible name
in desktop rows and a text action on narrow cards); the existing confirmation dialog is
the prominent destructive decision.

The editor, sources, review, and preview share the same quiet panel treatment.
Keep editor values 16/24 px, distinguish the report document from surrounding
controls with paper and spacing, and avoid nesting shadows. Preserve the
current workspace tabs, save feedback, disabled/pending states, review controls,
and generation/finalization affordances. Generation may use orange as the one
dominant action when shown.

## Responsive behavior and states

- At 1280 px and above, preserve the desktop rail and roomy document workspace.
- From 1024–1279 px, keep navigation and report regions within available width;
  existing preview/source stacking or toggles remain authoritative.
- Below 1024 px, keep compact top navigation and stacked workspace regions.
- At 768 and 390 px, collections use cards or stacked rows, actions wrap, long
  names break, and content has no page-level horizontal overflow.
- Loading, empty, filtered-empty, failure, read-only, pending mutation, and
  long-content states use the same geometry as populated surfaces where
  possible. Preserve existing recovery actions and announcements.
- All changes preserve label associations, headings, table semantics, keyboard
  order, visible focus, dialog focus behavior, reduced motion, and 44 px targets.

## Implementation boundary and verification

Use existing Tailwind utilities and shared dashboard primitives. `globals.css`
continues to contain theme mappings and global browser behavior only. No new
UI framework, styling runtime, dependencies, API shape, or mobile change is
required. Font assets and dashboard-only font/type theme mappings are allowed;
retain existing shared color tokens. Keep `apps/site` unchanged.

Verify existing dashboard unit, route, and behavior tests plus type checking
and production build. Review screenshots of projects, project overview, reports,
members, settings, authentication, and the report workspace at 1440 and 390 px,
with an intermediate desktop/tablet width. Check long titles, empty/loading
states, filter changes, create dialogs, and keyboard focus. Visual acceptance
requires reduced framing and a clear content/action hierarchy without hiding
existing information or controls.

## Validation

The following results describe the first refresh, before the typography and
spacing refinement. Re-run relevant checks and update visual expectations for
the revised contract; the old 20 px heading and system-font assertions are no
longer acceptance requirements for the dashboard.

The first implementation passes 153 dashboard unit tests, type checking, lint, the
production build, and the dashboard visual contract. All 13 existing browser
journeys pass using installed Chrome, including 280–1280 px responsive checks,
role permissions, editing/autosave, conflict recovery, and typography parity.
The bundled Chromium download timed out, so a temporary configuration selected
the installed Chrome channel; the checked-in browser configuration is unchanged.
Desktop (1440 px) and mobile (390 px) screenshots were reviewed for projects,
overview, members, settings, reports, the editor, and the finalized document.

### Second-pass validation

The typography/spacing refinement passes all 153 dashboard unit tests and
13 Chrome browser journeys, plus type checking, lint, production build, and
the updated visual contract. The browser test verifies both local fonts load,
32/40 px desktop and 26/32 px mobile headings, and regular form-value weights.
Responsive journeys cover widths from 280 to 1280 px. Desktop and mobile
screenshots were reviewed for projects, overview, reports, members, settings,
and the report editor. The two local variable font assets total about 51 KiB.

## Selected design

The user selected Current after comparing Studio, Blueprint, and Ledger, and
approved merging it with 20 px page padding and 20 px card corners. Ship the
Current composition and typography from this document. The alternative
layouts and their tighter card interiors remain exploratory previews only.
Browser coverage asserts the selected page padding at desktop/mobile sizes
and the rendered 20 px collection corners.
