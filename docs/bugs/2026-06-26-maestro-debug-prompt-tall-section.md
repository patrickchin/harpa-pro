# Maestro Debug Prompt Tall Section

Date: 2026-06-26

## Symptom

The full local iOS Maestro regression failed in
`.maestro/modules/12-report-debug.yaml` while scrolling to `debug-prompt`:

```text
No visible element found: id: debug-prompt
```

The failure screenshot showed the `PROMPT — USER (LIVE)` card was already
visible, but the card and its JSON body were taller than the iPhone viewport.

## Root Cause

`scrollUntilVisible` defaulted to `visibilityPercentage: 100`, which asks
Maestro to find the entire `debug-prompt` section in the viewport. That is not
possible once the report-debug prompt contains the larger module 11 edited
report body.

## Fix

Treat `debug-prompt` like the later `debug-report-notes` and
`debug-llm-response` sections: use the scroll as positioning with a low
visibility threshold, then assert the section and text testIDs separately.

## Guardrail

For Maestro selectors attached to sections or cards that can exceed the
viewport height, never rely on default full visibility. Use a small
`visibilityPercentage`, optionally center the element, and let follow-up
assertions prove the intended content exists.
