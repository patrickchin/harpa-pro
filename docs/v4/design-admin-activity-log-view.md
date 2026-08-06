# Design — Dense admin activity log view

Status: implemented.

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
the rows so the labels stay aligned. `User` and `Project` are filter buttons.
The other columns remain plain labels. The feed retains list-and-button
semantics because every row opens its detail drawer. Each button's complete
accessible name remains self-contained rather than relying on ARIA table
semantics.

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

Deleted-entity labels returned by the API are fallback values, not historical
names. The admin presentation renders them as lowercase, square-bracketed
placeholders (`[deleted user]`, `[deleted project]`, `[deleted report]`, or
`[deleted note]`) in muted italic text. The same wording appears in rows,
header-filter choices, details, and the plain-text view. Accessible row names
describe the entity as unavailable. Stable IDs remain in the filter identity
line, detail drawer, and text view. An event with no project context continues
to use an em dash and remains distinct from a deleted project.

Selecting a row still opens the detail drawer for IDs, request ID, and strict
metadata. Filtering actions are removed from the drawer because the attached
column-header controls are the primary filter surface.

## Filters

All server filters apply immediately on selection. There is no Apply button and
no separate draft-filter state.

A filter region above the feed contains the `Detail level` and `Time period`
radio groups. `Detail level` offers Milestones, Detailed activity, and All
activity. There is no separate event-type filter. `Time period` offers Past
week, Past month, Past 6 months, Past year, and All time. A `Clear filters`
button resets these controls and the active User and Project filters.

The `User` and `Project` header buttons expose `aria-expanded` and
`aria-haspopup="dialog"`. Each button opens a compact non-modal popup anchored
to its header. The popup uses `role="dialog"` and a column-specific accessible
name. Opening one popup closes the other. Escape and an outside click close the
popup without changing its active selection.

The popup renders in an overlay layer and does not change the table height or
row positions. It stays within the viewport at narrow widths. The `User` popup
contains a local `Search users` field and one list of known users. Each user row
contains an `Only` choice and an `Exclude` choice. The `Project` popup contains
a local `Search projects` field and an All projects or Only project choice.

Each user row shows the user's name and a second identity line. The second line
shows the email address when available, or the stable user ID otherwise. Each
project row shows the project name and stable project ID. These identifiers
distinguish choices that have the same display name.

The search fields match names and displayed identifiers. They narrow the cached
choices locally and do not add API query parameters. User and project choices
are collected from events returned during the current browser session. The
option cache keeps labels available after a server filter removes those rows
from the current response. Up to 20 users may be excluded at once.

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
Deleted-entity fallback labels use the same bracketed placeholders as the
interactive feed; stable event and entity IDs remain unchanged.

## Failure and accessibility behavior

- Rows remain keyboard-focusable and expose the detail action as a button.
- The above-feed controls and header filter buttons remain available when a
  query returns no rows. An operator can broaden or clear the active filters.
- Each popup returns focus to its header button when Escape closes it.
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
- above-feed time-period and detail-level controls;
- compact non-modal popups controlled by the User and Project header buttons;
- popups that overlay the page without changing table row positions;
- one user list with email or stable-ID identity lines and project-ID labels;
- immediate radio and checkbox filtering for time, level, included user,
  multiple excluded users, and project;
- local user and project choice search by name and displayed identifier;
- deterministic resolution of contradictory user include/exclude choices;
- header controls that remain usable for empty results;
- out-of-order request protection;
- refresh baselines and local `New` markers;
- cursor pagination; and
- bracketed deleted-entity presentation, unavailable accessible names, stable
  filter/detail IDs, and the generated plain-text Blob.

The admin Playwright smoke covers the above-feed controls, header popups,
choice search, immediate filter requests, stable row geometry, duplicate-name
labels, deleted-entity placeholders, icon rendering, empty-result recovery,
refresh markers, the text view, detail inspection, and sign-out against the
real local API wiring.
