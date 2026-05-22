-- 0005_llm_usage_events.sql
--
-- Spend-attribution table for AI provider calls. Closes the v3
-- blind spot where transcribe and chat costs landed against no
-- particular (project, report, user) tuple.
--
-- Written by `services/usage.ts → recordUsage()` from inside the
-- voice aggregator (`POST /reports/:report/notes/voice`) and any
-- future route that wraps a `chat` / `transcribe` call. Both halves
-- of a single aggregator invocation share the same (project_id,
-- report_id, user_id) so a downstream report can attribute spend.
--
-- Expand-only. No drops. project_id / report_id are nullable so
-- ad-hoc (non-report-scoped) calls — should we ever add them — can
-- still be recorded against the user.
--
-- RLS: insertion happens under the per-request scoped role (Pitfall 6),
-- but selection is restricted to admin reporting only — we don't
-- expose this table through the API. A policy gates SELECT to rows
-- the caller owns (user_id match) so any future "my spend" endpoint
-- can read it safely without further plumbing.
--
-- Refs: docs/v4/arch-voice-pipeline.md §D9 (attribution),
--       docs/v4/pitfalls.md §13 (default-wiring).

-- ---------- ID domain ----------
DO $$ BEGIN
  CREATE DOMAIN app.lue_id AS text CHECK (value ~ '^lue_[0-9a-hjkmnp-tv-z]{8,16}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Table ----------
CREATE TABLE IF NOT EXISTS app.llm_usage_events (
  id          app.lue_id PRIMARY KEY,
  user_id     app.usr_id NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  app.prj_id REFERENCES app.projects(id) ON DELETE SET NULL,
  report_id   app.rpt_id REFERENCES app.reports(id) ON DELETE SET NULL,
  vendor      text       NOT NULL,
  model       text       NOT NULL,
  operation   text       NOT NULL CHECK (operation IN ('chat','transcribe','generate-report')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_usage_events_user_idx    ON app.llm_usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS llm_usage_events_report_idx  ON app.llm_usage_events(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS llm_usage_events_project_idx ON app.llm_usage_events(project_id, created_at DESC);

-- ---------- Grants ----------
-- Scoped role inserts; selection of one's own rows is allowed but
-- no API route currently surfaces them. Admin tooling reads via a
-- direct DB connection.
GRANT SELECT, INSERT ON app.llm_usage_events TO app_authenticated;

-- ---------- RLS ----------
ALTER TABLE app.llm_usage_events ENABLE ROW LEVEL SECURITY;

-- Caller can read their own rows.
CREATE POLICY llm_usage_events_self_select ON app.llm_usage_events
  FOR SELECT TO app_authenticated
  USING (user_id = current_setting('app.user_id')::app.usr_id);

-- Caller can insert rows attributed to themselves only.
CREATE POLICY llm_usage_events_self_insert ON app.llm_usage_events
  FOR INSERT TO app_authenticated
  WITH CHECK (user_id = current_setting('app.user_id')::app.usr_id);
