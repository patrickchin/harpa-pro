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
4. user label;
5. subject label; and
6. project context.

A compact header strip uses the same grid and labels those positions `New`,
`Time`, `Event`, `User`, `Subject`, and `Project`. It scrolls horizontally with
the rows so the labels stay aligned. `Time`, `Event`, `User`, and `Project` are
filter buttons; `New` and `Subject` remain plain labels. The feed retains
list-and-button semantics because every row opens its detail drawer; each
button's complete accessible name remains self-contained rather than relying on
ARIA table semantics.

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
metadata. Filtering actions are removed from the drawer because the attached
column-header controls are the primary filter surface.

## Filters

All server filters apply immediately on selection. There is no Apply button and
no separate draft-filter state. The detached filter card is removed.

The `Time`, `Event`, `User`, and `Project` header buttons expose
`aria-expanded` and open one non-modal filter region attached directly below
the header. The region is named for its column, for example `Time filter` or
`User filter`. Opening another header button replaces the current region, so
only one filter region exists at a time. Closing the region leaves its current
selection active.

The attached regions contain:

- `Time`: the existing `Time period` radio group with Past week, Past month,
  Past 6 months, Past year, and All time;
- `Event`: the existing `Detail level` radio group with Milestones, Detailed
  activity, and All activity; there is no separate event-type filter;
- `User`: a local `Search users` field, an `Included users` radio group with All
  users and one Only choice per known user, plus one Exclude checkbox per known
  user; and
- `Project`: a local `Search projects` field and an All projects or Only project
  radio choice.

The search fields narrow the cached choices locally and do not add API query
parameters. User and project choices are collected from events returned during
the current browser session. The option cache keeps labels available after a
server filter removes those rows from the current response. Up to 20 users may
be excluded at once.

User inclusion and exclusion cannot contradict each other. Choosing `Only` for
an excluded user removes that user's exclusion. Excluding the currently
included user returns inclusion to `All users`. Each resolved selection sends
one immediate request with the resulting `actorUserId`,
`excludeActorUserIds`, `projectId`, `level`, and derived `from` parameters.

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
- Header filter buttons and their attached region remain available when a query
  returns no rows, so an operator can broaden or clear the active filters.
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

- aligned visible column headers without changing the interactive list semantics;
- single-line row hierarchy and decorative event/context icon mapping;
- one attached filter region controlled by the Time, Event, User, and Project
  header buttons;
- immediate radio and checkbox filtering for time, level, included user,
  multiple excluded users, and project;
- local user and project choice search;
- deterministic resolution of contradictory user include/exclude choices;
- header controls that remain usable for empty results;
- out-of-order request protection;
- refresh baselines and local `New` markers;
- cursor pagination; and
- the generated plain-text Blob.

The admin Playwright smoke covers the attached header filters, choice search,
immediate filter requests, icon rendering, dense row geometry, empty-result
recovery, refresh markers, the text view, detail inspection, and sign-out
against the real local API wiring.
