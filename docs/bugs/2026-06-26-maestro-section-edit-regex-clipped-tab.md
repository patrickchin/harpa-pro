# Maestro Section Edit Regex Hit Clipped Tab Area

Date: 2026-06-26

## Symptom

The full local iOS Maestro regression failed in
`.maestro/helpers/edit-report-cards.yaml` during module 11:

```text
Assertion is false: id: input-edit-section-heading is visible
```

The preceding `tapOn id: btn-edit-section-.*` reported `COMPLETED`, but the
failure screenshot still showed the report screen rather than the edit sheet.

## Root Cause

The regex selector matched the first section edit button. At this scroll
position that first section row can be clipped under the sticky report tab bar.
iOS XCTest reported the tap as complete even though it did not open the edit
sheet.

## Fix

Target `btn-edit-section-1` for the edit/delete section coverage. The second
section is visible in the stable middle of the viewport after the next-steps
assertion, while still exercising the same per-section edit sheet.

## Guardrail

Avoid broad regex taps for repeated controls when the first match can be
partially hidden by sticky headers or footers. Use a stable indexed testID for
the repeated item the flow actually needs.
