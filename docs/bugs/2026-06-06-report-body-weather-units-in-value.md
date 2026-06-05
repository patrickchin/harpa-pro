# 2026-06-06 — `weather.{temperatureC,windKph}` renamed to `{temperature,wind}` with units in value

**Pattern:** R5 (prompt/schema drift in `generateReport`) — follow-up
to the same-day [string-y wire shape change](2026-06-06-report-body-string-wire.md).

## Smell

After the string-y rewrite, `weather.temperatureC` / `weather.windKph`
were `string | null` but the *name* still pinned a unit. The LLM kept
emitting strings like `"15"` and the UI hard-coded `°C` / ` km/h`
suffixes around the value. That is fine for UK sites but locks the
contract into a single unit system and forces the LLM to silently
convert whatever the field crew said into Celsius/kph.

The data is a *phrase* extracted from voice ("about 20°C", "5 mph",
"a chilly 60 Fahrenheit"). Better to let the unit ride with the
value than to force a conversion that the model isn't reliably good
at.

## Fix

- Renamed contract keys: `weather.temperatureC` → `weather.temperature`,
  `weather.windKph` → `weather.wind`. Both remain `string | null`.
- Updated both prompts (`REPORT_SYSTEM_PROMPT`,
  `REPORT_UPDATE_SYSTEM_PROMPT`) — schema lines, field guidance, and
  EXAMPLE payload — to instruct the model to *include the unit in
  the value* (e.g. `"20°C"`, `"5 mph"`, `"12 km/h"`).
- `VoiceReportView` now renders the values verbatim (no hard-coded
  unit suffix).
- Mobile `report-body-adapter.ts` simplified: weather strings pass
  through both directions. No JS-side backwards-compat shim — the
  migration handles all existing rows in one pass.
- One-off SQL at `scripts/oneoff/2026-06-06-rename-weather-keys.sql`
  renames the JSONB keys in `app.reports.body` in place, suffixing
  `°C` / ` km/h` onto the legacy values so existing reports keep
  rendering meaningfully under the new schema. Run manually per
  environment (`doppler run --config <env> -- bash -c 'psql
  "$DATABASE_URL" -f scripts/oneoff/2026-06-06-rename-weather-keys.sql'`).
  Not a tracked migration — kept in the repo for traceability, will
  not auto-run again. Idempotent (guards on `body #> '{weather}' ?
  'oldKey'`).
- Fixtures rehashed (prompts changed → request hashes changed).

## Why testing didn't catch it earlier

Renaming a contract key to drop a unit suffix doesn't break tests —
the schema, the fixtures, and the UI all spoke "Celsius/kph" by
convention, so nothing surfaced the unit lock-in. This change is
prompted by product reasoning ("not every site is in the UK"), not
a Sentry report. The R5 testing reform from PR #133 still applies:
the drift guard auto-adapts to the new field names via reflection,
and the live lane is the value-shape safety net for whatever
units the LLM actually emits.

## Recurrence guard

If a contract field's *name* encodes a unit, every consumer is
forced to share that unit. Prefer naming the field for what it
*is* (`temperature`, `wind`) and have the LLM emit the unit
alongside the value. This is consistent with the wider string-y
philosophy: the wire is text the model produced, not a typed
measurement.
