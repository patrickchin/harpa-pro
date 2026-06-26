# Maestro Account Delete Label Drift

Date: 2026-06-26

## Symptom

The full local iOS Maestro regression failed in
`.maestro/modules/14-account.yaml` after opening the delete-account sheet:

```text
Assertion is false: "Projects deleted" is visible
```

The failure screenshot showed the sheet rendered correctly, including the
summary row:

```text
Projects deleted: Wiring Smoke Project
```

## Root Cause

The rendered row is exposed to Maestro as one combined accessibility string,
for example `Projects deleted: Wiring Smoke Project`. The Maestro assertion was
looking for the short label only, so it did not match the full element text.

## Fix

Update both account delete Maestro flows to assert `.*Projects deleted.*` so
the test tracks the current row without depending on the preview item value.

## Guardrail

When asserting mixed bold/body rows, match the whole accessible row with a
bounded regex instead of a short exact label. Maestro may expose nested text as
one combined accessibility string.
