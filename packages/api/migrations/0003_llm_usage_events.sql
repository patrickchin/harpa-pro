-- 0003_llm_usage_events.sql
--
-- Per-user LLM token accounting (be-2 / plan-p3 §P3.15.5). Every chat,
-- transcribe, and generate_report call lands one row here from the
-- chokepoint in packages/api/src/services/ai.ts. Fixture-mode replays
-- carry the canonical `usage` block recorded on the fixture, so we get
-- deterministic accounting in tests as well.
--
-- /me/usage (be-3) aggregates this table for the in-app usage screen;
-- billing and abuse detection consume the same source of truth.
--
-- Why a generated total: keeps aggregation queries (`SUM(total_tokens)`)
-- safe even if the API forgets to recompute on a future schema bump.

-- ---------- Domain ----------
DO $$ BEGIN
  CREATE DOMAIN app.lue_id AS text CHECK (value ~ '^lue_[0-9a-hjkmnp-tv-z]{8,16}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Enum ----------
DO $$ BEGIN
  CREATE TYPE app.llm_operation AS ENUM ('chat', 'transcribe', 'generate_report');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Table ----------
CREATE TABLE IF NOT EXISTS app.llm_usage_events (
  id              app.lue_id PRIMARY KEY,
  user_id         app.usr_id NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id      app.prj_id REFERENCES app.projects(id) ON DELETE SET NULL,
  report_id       app.rpt_id REFERENCES app.reports(id) ON DELETE SET NULL,
  vendor          varchar(32) NOT NULL,
  model           varchar(64) NOT NULL,
  operation       app.llm_operation NOT NULL,
  input_tokens    integer NOT NULL DEFAULT 0 CHECK (input_tokens  >= 0),
  output_tokens   integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cached_tokens   integer NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
  total_tokens    integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  latency_ms      integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  fixture_mode    varchar(16) NOT NULL,
  status          varchar(16) NOT NULL DEFAULT 'ok',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Hot path: per-user timeline (used by /me/usage and the future usage screen).
CREATE INDEX IF NOT EXISTS llm_usage_events_user_created_idx
  ON app.llm_usage_events(user_id, created_at DESC);
-- Vendor/model rollup (billing breakdown by provider).
CREATE INDEX IF NOT EXISTS llm_usage_events_user_vendor_model_idx
  ON app.llm_usage_events(user_id, vendor, model);

-- ---------- Grants + RLS ----------
GRANT SELECT, INSERT ON app.llm_usage_events TO app_authenticated;

ALTER TABLE app.llm_usage_events ENABLE ROW LEVEL SECURITY;

-- Users see their own usage rows only.
CREATE POLICY llm_usage_events_self_read ON app.llm_usage_events
  FOR SELECT TO app_authenticated
  USING (user_id = current_setting('app.user_id')::app.usr_id);

-- INSERTs are restricted to the caller's own user_id — the AI chokepoint
-- always passes the authenticated userId, so a row that claims a
-- different user_id is a bug (or an attack via a leaked scoped role).
CREATE POLICY llm_usage_events_self_insert ON app.llm_usage_events
  FOR INSERT TO app_authenticated
  WITH CHECK (user_id = current_setting('app.user_id')::app.usr_id);
