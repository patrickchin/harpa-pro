-- 0030_reconcile_llm_usage_events_schema.sql
--
-- Reconcile the legacy LLM-usage table shape that was briefly applied to the
-- development database under the retired filename
-- `0003_llm_usage_events.sql`. The current source-of-truth migration is
-- `0005_llm_usage_events.sql`; production already has that shape, so every
-- operation below is conditional and production is a schema no-op.
--
-- The table is small (451 rows in development, 133 in production at the
-- 2026-08-10 preflight). Type changes still take an ACCESS EXCLUSIVE lock, so
-- fail quickly rather than waiting behind live traffic. Invalid legacy values
-- abort before the first DDL statement. Rollback is automatic because the
-- application migrator owns this file's transaction.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $reconcile_llm_usage_events$
DECLARE
  model_data_type text;
  model_max_length integer;
  fixture_udt_schema text;
  fixture_udt_name text;
  status_udt_schema text;
  status_udt_name text;
  status_default text;
  latency_nullable text;
  latency_default text;
  latency_check_definition text;
BEGIN
  IF to_regclass('app.llm_usage_events') IS NULL THEN
    RAISE EXCEPTION 'cannot reconcile missing app.llm_usage_events';
  END IF;

  SELECT data_type, character_maximum_length
    INTO model_data_type, model_max_length
  FROM information_schema.columns
  WHERE table_schema = 'app'
    AND table_name = 'llm_usage_events'
    AND column_name = 'model';

  SELECT udt_schema, udt_name
    INTO fixture_udt_schema, fixture_udt_name
  FROM information_schema.columns
  WHERE table_schema = 'app'
    AND table_name = 'llm_usage_events'
    AND column_name = 'fixture_mode';

  SELECT udt_schema, udt_name, column_default
    INTO status_udt_schema, status_udt_name, status_default
  FROM information_schema.columns
  WHERE table_schema = 'app'
    AND table_name = 'llm_usage_events'
    AND column_name = 'status';

  SELECT is_nullable, column_default
    INTO latency_nullable, latency_default
  FROM information_schema.columns
  WHERE table_schema = 'app'
    AND table_name = 'llm_usage_events'
    AND column_name = 'latency_ms';

  IF model_data_type IS DISTINCT FROM 'character varying'
    OR model_max_length IS NULL
    OR model_max_length NOT IN (64, 128) THEN
    RAISE EXCEPTION 'unexpected app.llm_usage_events.model type: %(%); expected varchar(64|128)',
      model_data_type, model_max_length;
  END IF;

  IF fixture_udt_name IS NULL THEN
    RAISE EXCEPTION 'missing app.llm_usage_events.fixture_mode';
  ELSIF NOT (
    (fixture_udt_schema = 'pg_catalog' AND fixture_udt_name = 'varchar')
    OR (fixture_udt_schema = 'app' AND fixture_udt_name = 'llm_fixture_mode')
  ) THEN
    RAISE EXCEPTION 'unexpected app.llm_usage_events.fixture_mode type: %.%',
      fixture_udt_schema, fixture_udt_name;
  END IF;

  IF status_udt_name IS NULL THEN
    RAISE EXCEPTION 'missing app.llm_usage_events.status';
  ELSIF NOT (
    (status_udt_schema = 'pg_catalog' AND status_udt_name = 'varchar')
    OR (status_udt_schema = 'app' AND status_udt_name = 'llm_usage_status')
  ) THEN
    RAISE EXCEPTION 'unexpected app.llm_usage_events.status type: %.%',
      status_udt_schema, status_udt_name;
  END IF;

  IF latency_nullable IS NULL THEN
    RAISE EXCEPTION 'missing app.llm_usage_events.latency_ms';
  END IF;

  IF EXISTS (SELECT 1 FROM app.llm_usage_events WHERE length(model) > 128) THEN
    RAISE EXCEPTION 'cannot reconcile app.llm_usage_events: model exceeds 128 characters';
  END IF;

  IF EXISTS (SELECT 1 FROM app.llm_usage_events WHERE latency_ms IS NULL) THEN
    RAISE EXCEPTION 'cannot reconcile app.llm_usage_events: null latency_ms values exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM app.llm_usage_events
    WHERE fixture_mode::text NOT IN ('live', 'replay', 'record')
  ) THEN
    RAISE EXCEPTION 'cannot reconcile app.llm_usage_events: invalid fixture_mode values exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM app.llm_usage_events
    WHERE status::text NOT IN ('ok', 'error')
  ) THEN
    RAISE EXCEPTION 'cannot reconcile app.llm_usage_events: invalid status values exist';
  END IF;

  IF model_max_length = 64 THEN
    ALTER TABLE app.llm_usage_events
      ALTER COLUMN model TYPE varchar(128);
  END IF;

  IF fixture_udt_schema = 'pg_catalog' AND fixture_udt_name = 'varchar' THEN
    ALTER TABLE app.llm_usage_events
      ALTER COLUMN fixture_mode TYPE app.llm_fixture_mode
      USING (fixture_mode::text)::app.llm_fixture_mode;
  END IF;

  IF status_udt_schema = 'pg_catalog' AND status_udt_name = 'varchar' THEN
    DROP INDEX IF EXISTS app.llm_usage_events_user_status_created_idx;
    ALTER TABLE app.llm_usage_events
      ALTER COLUMN status DROP DEFAULT,
      ALTER COLUMN status TYPE app.llm_usage_status
      USING (status::text)::app.llm_usage_status;
    CREATE INDEX llm_usage_events_user_status_created_idx
      ON app.llm_usage_events (user_id, created_at)
      WHERE status = 'ok';
  ELSIF status_default IS NOT NULL THEN
    ALTER TABLE app.llm_usage_events ALTER COLUMN status DROP DEFAULT;
  END IF;

  IF latency_default IS DISTINCT FROM '0' THEN
    ALTER TABLE app.llm_usage_events ALTER COLUMN latency_ms SET DEFAULT 0;
  END IF;

  IF latency_nullable = 'YES' THEN
    ALTER TABLE app.llm_usage_events ALTER COLUMN latency_ms SET NOT NULL;
  END IF;

  SELECT pg_get_constraintdef(oid)
    INTO latency_check_definition
  FROM pg_constraint
  WHERE connamespace = 'app'::regnamespace
    AND conrelid = 'app.llm_usage_events'::regclass
    AND conname = 'llm_usage_events_latency_ms_check';

  IF regexp_replace(coalesce(latency_check_definition, ''), '\s', '', 'g')
      IS DISTINCT FROM 'CHECK((latency_ms>=0))' THEN
    ALTER TABLE app.llm_usage_events
      DROP CONSTRAINT IF EXISTS llm_usage_events_latency_ms_check,
      ADD CONSTRAINT llm_usage_events_latency_ms_check CHECK (latency_ms >= 0);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'llm_usage_events'
      AND column_name = 'total_tokens'
  ) THEN
    ALTER TABLE app.llm_usage_events DROP COLUMN total_tokens;
  END IF;

  IF to_regclass('app.llm_usage_events_user_vendor_model_idx') IS NOT NULL THEN
    DROP INDEX app.llm_usage_events_user_vendor_model_idx;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'app'
      AND tablename = 'llm_usage_events'
      AND policyname = 'llm_usage_events_self_read'
  ) THEN
    DROP POLICY llm_usage_events_self_read ON app.llm_usage_events;
  END IF;
END
$reconcile_llm_usage_events$;
