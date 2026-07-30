# Design — Dense admin activity log view

Status: approved on 2026-07-31.

This document refines only the browser presentation and interaction model from
[Admin business activity](design-admin-business-activity.md). The event
taxonomy, application database ledger, dedicated admin authentication, and
`GET /admin/activity` contract remain unchanged.

## Problem

The original five-column table gives every event similar visual weight, wraps
actor and timestamp cells onto multiple lines, and uses much more vertical
space than an operator log needs. Primary filters wait for an explicit Apply
action, while exact actor, actor-exclusion, and project filters are available
only after opening an event detail drawer.

Operators also need to:

- refresh deliberately and identify rows that arrived since the previous
  refresh;
- scan or copy the currently loaded events as plain text; and
- keep the detailed ID and metadata view without making it the entry point for
  filtering.

## Decision

Keep the existing API and render the activity feed as a dense, horizontally
scrollable list. Each event occupies one non-wrapping text line.

The line has a consistent scanning order:

1. optional `New` marker;
2. compact local timestamp;
3. event label;
4. actor label;
5. subject label; and
6. project context.

Event, actor, and subject use medium or semibold weight. Timestamp and project
context use the softer ink token. The event label occupies a stable width so
different event types are visually distinct when scanning vertically.

The event label begins with a small type-specific icon: user, project, report,
text note, voice note, image, and document events each have a distinct
silhouette. The actor and project columns use consistent user and folder icons
to make their boundaries recognizable without reading every label. The folder
icon remains visible beside the placeholder when an event has no project.
Icons are decorative and `aria-hidden`; each row exposes an explicit accessible
name with event, actor, subject, project, and occurrence-time labels, while the
complete visible text remains the source of truth.

Selecting a row still opens the detail drawer for IDs, request ID, and strict
metadata. Filtering actions are removed from the drawer because the filter bar
is the primary control surface.

## Filters

All filters apply immediately on selection. There is no Apply button and no
separate draft-filter state.

The first filter row contains:

- a segmented detail-level button group;
- a segmented time-period button group; and
- Clear.

The second row is always visible and contains:

- Filter actor;
- Exclude actor; and
- Filter project.

There is no event-type filter. The level and time-period choices expose all
options without opening a menu, use `aria-pressed` to identify the active
choice, and apply immediately. The remaining native selects use the same
rounded surface, deliberate hover/focus states, and custom chevron treatment.

Actor and project choices are collected from events returned during the
current browser session. The option cache keeps labels available after a
filter removes those rows from the current response. Excluded actors remain
visible as removable chips, with the existing maximum of 20.

The server remains authoritative for filtering. Changing a filter resets
cursor pagination, closes the detail drawer, clears any `New` markers, and
loads the first page for the new query. A request sequence guard prevents a
slower response from an earlier selection overwriting a newer one.

## Refresh and new-event markers

The page has an explicit Refresh button. The initial successful response
establishes a browser-memory baseline and marks nothing as new.

On manual refresh:

- the current filters are reused;
- the first page is fetched again;
- IDs absent from the previous baseline receive a `New` marker; and
- the page reports either the number of new events or that no new events were
  found.

The refreshed page becomes the next baseline. A second refresh therefore
clears the old markers unless newer events arrived. Loading older rows does
not mark them as new.

The baseline and marker set live only in React state and refs. They are not
written to either Neon project, browser storage, or an API.

## Plain-text view

`Open as text` creates a browser-local `text/plain` Blob from the currently
loaded, filtered rows and opens it in a new tab. No new API route or persisted
export is added.

Every activity event occupies exactly one tab-separated line containing:

- ISO timestamp;
- event type;
- actor label and email;
- project label;
- subject label;
- event ID;
- actor, project, and subject IDs;
- request ID; and
- compact JSON metadata.

This format supports browser Find, copying, and Save As while retaining the
safe fields already returned by the admin API. It does not introduce note
content, transcripts, filenames, storage keys, or other excluded data.

## Failure and accessibility behavior

- Rows remain keyboard-focusable and expose the detail action as a button.
- Immediate filter requests use the existing loading, forbidden, and retryable
  error states.
- Refresh keeps its button disabled while a refresh is in flight.
- The new-event result is announced through a polite status region.
- The text link is available only after the Blob URL has been created and is
  revoked whenever its source changes or the component unmounts.
- At narrow widths the feed scrolls horizontally rather than wrapping a log
  entry onto multiple lines.

## Verification

Component tests cover:

- single-line row hierarchy and decorative event/context icon mapping;
- immediate button-driven level and time filtering;
- styled actor, exclusion, and project selects;
- multiple removable actor exclusions;
- out-of-order request protection;
- refresh baselines and local `New` markers;
- cursor pagination; and
- the generated plain-text Blob.

The admin Playwright smoke covers the visible controls, icon rendering, dense
row geometry, immediate filter requests, refresh markers, the text view, detail
inspection, and sign-out against the real local API wiring.
