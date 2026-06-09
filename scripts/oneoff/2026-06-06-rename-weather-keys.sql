-- 2026-06-06-rename-weather-keys.sql
--
-- One-off (NOT a tracked migration) — run manually via psql against
-- each environment after deploying the weather.{temperatureC,windKph}
-- → {temperature,wind} rename. See
-- docs/bugs/2026-06-06-report-body-weather-units-in-value.md for the
-- contract change and rationale.
--
-- Usage (per environment):
--   doppler run --config dev -- bash -c 'psql "$DATABASE_URL" -f scripts/oneoff/2026-06-06-rename-weather-keys.sql'
--   doppler run --config prd -- bash -c 'psql "$DATABASE_URL" -f scripts/oneoff/2026-06-06-rename-weather-keys.sql'
--
-- Idempotent: WHERE clauses skip rows that already have the new keys,
-- so re-runs are safe.
--
-- IMPORTANT: each CASE branch must return a non-NULL jsonb value.
-- `to_jsonb(NULL)` is SQL NULL, and `jsonb_set` is STRICT — passing a
-- NULL `new_value` returns NULL for the entire body, which would wipe
-- the row's body. We use 'null'::jsonb (a JSON null literal) instead
-- so the new key is set to JSON null when the legacy value is missing
-- or empty.

-- Step 1: temperatureC -> temperature (string), appending "°C" when
-- the legacy value was non-empty. JSON null / empty stays JSON null.
UPDATE app.reports
SET body = jsonb_set(
  body #- '{weather,temperatureC}',
  '{weather,temperature}',
  CASE
    WHEN btrim(COALESCE(body #>> '{weather,temperatureC}', '')) = '' THEN 'null'::jsonb
    ELSE to_jsonb(btrim(body #>> '{weather,temperatureC}') || '°C')
  END,
  /* create_missing */ true
)
WHERE body IS NOT NULL
  AND body #> '{weather}' IS NOT NULL
  AND body ? 'weather'
  AND (body #> '{weather}') ? 'temperatureC';

-- Step 2: windKph -> wind, appending " km/h" when the legacy value
-- was non-empty. JSON null / empty stays JSON null.
UPDATE app.reports
SET body = jsonb_set(
  body #- '{weather,windKph}',
  '{weather,wind}',
  CASE
    WHEN btrim(COALESCE(body #>> '{weather,windKph}', '')) = '' THEN 'null'::jsonb
    ELSE to_jsonb(btrim(body #>> '{weather,windKph}') || ' km/h')
  END,
  /* create_missing */ true
)
WHERE body IS NOT NULL
  AND body #> '{weather}' IS NOT NULL
  AND body ? 'weather'
  AND (body #> '{weather}') ? 'windKph';
