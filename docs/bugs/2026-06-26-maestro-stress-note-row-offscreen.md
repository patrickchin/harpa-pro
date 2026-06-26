# Maestro Stress Flow Asserted Offscreen Newest Note

Date: 2026-06-26

## Symptom

The local iOS release-stress Maestro flow failed in
`.maestro/modules/17-heavy-usage-stress.yaml` immediately after adding 20
notes:

```text
Assertion is false: id: note-row-19 is visible
```

The failure screenshot showed `Notes (20)`, with rows around notes 7 through
12 visible.

## Root Cause

The shared add-text-note helper swipes after each add to keep the input usable.
After enough repeated adds, the final viewport can settle in the middle of the
timeline. The stress flow assumed the newest row was still visible and asserted
`note-row-19` directly.

## Fix

Scroll to `note-row-19` before asserting it. The flow already scrolls from the
newest row to `note-row-0` and back, so this makes the initial position explicit
instead of relying on incidental viewport state.

## Guardrail

For long-list Maestro coverage, never assert a specific row immediately after a
loop of create operations unless the flow first positions the list on that row.
