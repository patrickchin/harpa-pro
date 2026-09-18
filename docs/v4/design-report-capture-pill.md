# Design — Report capture pill

Status: implemented

## Problem

The Generate Report Notes tab currently reserves a full-width bottom bar for
the text field, then places photo and voice actions beside it. This makes the
capture controls feel like fixed chrome even when the user is deciding what to
capture.

## Decision

The resting composer is a raised, centered pill inset from the screen edges.
It has four equal, labeled actions in capture order:

1. Attachment
2. Text
3. Photo
4. Voice

The pill uses the existing `card`, `border`, and `foreground` tokens and the
shared floating-surface depth token. Each action remains at least 44pt tall,
has an icon plus visible label, and exposes an accessible name.

Selecting an action preserves the current behavior rather than introducing a
new capture route:

- Attachment opens the existing attachment sheet.
- Text replaces the action pill with a focused text-note composer. Saving a
  note restores the action pill; dismissing the composer keeps unsent text.
- Photo continues directly to the existing camera capture route.
- Voice replaces the action pill with the existing inline voice recorder.

On phones, the pill uses the standard small max-width token inside the
existing page gutter rather than stretching across the screen. Its height is
content-driven: idle, text, and voice-recording states all use the same 44pt
touch target plus one spacing step of shell padding. No state sets a separate
fixed container height, so switching modes keeps the pill's outer bounds and
bottom alignment stable. The bottom safe-area inset and timeline clearance
remain intact.

The focused text composer uses keyboard-avoidance padding only while the
screen's keyboard lifecycle reports it as visible. Saving or dismissing it
explicitly closes the keyboard before restoring the capture actions. Once the
hide event arrives, keyboard avoidance is disabled so a stale system inset
cannot carry into the next mode.

## Compatibility

Existing capture handlers and their end-to-end test IDs stay stable:
`btn-attachment`, `btn-camera-capture`, and `btn-record-start`. The Text
action keeps `input-note` as its compatibility ID until selected, then the
focused `TextInput` takes over that same ID. This lets the existing Maestro
text-note helper continue to tap, type, and save through the real workflow.

## Acceptance criteria

- A writable report initially shows one inset four-action capture pill.
- Selecting Text reveals and focuses the text composer; Add creates the same
  trimmed text note as before and returns to the action pill.
- Attachment, camera, and voice flows continue to use their current handlers.
- The voice-recording strip uses the same inset pill treatment.
- Idle, text, and voice states share one outer height and horizontal position.
- Read-only reports continue to hide the capture surface.
- Component coverage verifies the idle actions, text-mode transition, save,
  attachment sheet, camera, and voice controls. Existing Maestro capture
  flows remain executable with their stable IDs.

## Out of scope

- Changing upload, camera, voice, or note persistence behavior.
- Adding a new attachment type or a floating action button elsewhere in the
  app.
