-- 0005_llm_usage_events.sql
--
-- Per-request observability sink for every LLM call made through the
-- `services/ai.ts` chokepoint. Drives `/me/usage` token totals + the
-- per-(vendor,model,operation) breakdown surfaced on the mobile usage
-- screen and CLI `harpa me usage`.
--
-- RLS: rows are user-scoped via `app.user_id`. Insert + select policies
-- both pin on the caller's claim — `withScopedConnection()` is what
-- sets `current_setting('app.user_id')`, so an INSERT routed through
-- a forged user_id never lands (Pitfall 6).
--
-- Expand-only. No drops, no constraint tightening on existing tables.

DO $$ BEGIN
  CREATE DOMAIN app.lue_id AS text CHECK (value ~ '^lue_[0-9a-hjkmnp-tv-z]{8,16}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.llm_operation AS ENUM ('chat', 'transcribe', 'generate_report');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.llm_fixture_mode AS ENUM ('live', 'replay', 'record');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.llm_usage_status AS ENUM ('ok', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS app.llm_usage_events (
  id             app.lue_id PRIMARY KEY,
  user_id        app.usr_id NOT NULL,
  project_id     app.prj_id REFERENCES app.projects(id) ON DELETE SET NULL,
  report_id      app.rpt_id REFERENCES app.reports(id)  ON DELETE SET NULL,
  vendor         varchar(32) NOT NULL,
  model          varchar(128) NOT NULL,
  operation      app.llm_operation NOT NULL,
  input_tokens   integer NOT NULL DEFAULT 0 CHECK (input_tokens   >= 0),
  output_tokens  integer NOT NULL DEFAULT 0 CHECK (output_tokens  >= 0),
  cached_tokens  integer NOT NULL DEFAULT 0 CHECK (cached_tokens  >= 0),
  latency_ms     integer NOT NULL DEFAULT 0 CHECK (latency_ms     >= 0),
  fixture_mode   app.llm_fixture_mode NOT NULL,
  status         app.llm_usage_status NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_usage_events_user_created_idx
  ON app.llm_usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS llm_usage_events_user_model_idx
  ON app.llm_usage_events (user_id, vendor, model, operation);

CREATE INDEX IF NOT EXISTS llm_usage_events_report_idx
  ON app.llm_usage_events (report_id)
  WHERE report_id IS NOT NULL;

GRANT SELECT, INSERT ON app.llm_usage_events TO app_authenticated;

ALTER TABLE app.llm_usage_events ENABLE ROW LEVEL SECURITY;

-- Self-select: a user can read their own usage events.
DROP POLICY IF EXISTS llm_usage_events_self_select ON app.llm_usage_events;
CREATE POLICY llm_usage_events_self_select ON app.llm_usage_events
  FOR SELECT TO app_authenticated
  USING (user_id = current_setting('app.user_id')::app.usr_id);

-- Self-insert: the row's user_id must match the caller's claim. The
-- service-layer chokepoint also pins user_id, but this policy is what
-- prevents a forged INSERT from a hand-crafted SQL path.
DROP POLICY IF EXISTS llm_usage_events_self_insert ON app.llm_usage_events;
CREATE POLICY llm_usage_events_self_insert ON app.llm_usage_events
  FOR INSERT TO app_authenticated
  WITH CHECK (user_id = current_setting('app.user_id')::app.usr_id);
