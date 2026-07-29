-- 0023_activity_events.sql
--
-- Curated, product-level activity for the private admin feed. This is an
-- append-oriented business ledger, not a request/debug log. Labels and other
-- personal or project data are joined at read time rather than copied here.
--
-- Forward-only: if this table must be removed before release, add a follow-up
-- migration rather than editing an already-applied file.

DO $$ BEGIN
  CREATE DOMAIN app.aud_id AS text
    CHECK (value ~ '^aud_[0-9a-hjkmnp-tv-z]{8,16}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS app.activity_events (
  id             app.aud_id PRIMARY KEY,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  event_type     text NOT NULL,
  actor_user_id  app.usr_id,
  subject_type   text NOT NULL,
  subject_id     text,
  project_id     app.prj_id,
  request_id     text,
  dedupe_key     text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT activity_events_type_check CHECK (
    (event_type = 'user.signed_up' AND subject_type = 'user')
    OR (event_type = 'project.created' AND subject_type = 'project')
    OR (event_type = 'report.created' AND subject_type = 'report')
  ),
  CONSTRAINT activity_events_subject_check CHECK (
    (event_type = 'user.signed_up'
      AND (subject_id IS NULL OR subject_id ~ '^usr_[0-9a-hjkmnp-tv-z]{8,16}$'))
    OR (event_type = 'project.created'
      AND subject_id ~ '^prj_[0-9a-hjkmnp-tv-z]{8,16}$')
    OR (event_type = 'report.created'
      AND subject_id ~ '^rpt_[0-9a-hjkmnp-tv-z]{8,16}$')
  ),
  CONSTRAINT activity_events_request_id_check CHECK (
    request_id IS NULL OR request_id ~ '^[A-Za-z0-9_-]{6,128}$'
  ),
  CONSTRAINT activity_events_metadata_object_check CHECK (
    jsonb_typeof(metadata) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS activity_events_occurred_idx
  ON app.activity_events (occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS activity_events_event_occurred_idx
  ON app.activity_events (event_type, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS activity_events_actor_occurred_idx
  ON app.activity_events (actor_user_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS activity_events_project_occurred_idx
  ON app.activity_events (project_id, occurred_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS activity_events_dedupe_key_unique
  ON app.activity_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

GRANT INSERT ON app.activity_events TO app_authenticated;

ALTER TABLE app.activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_events_self_insert
  ON app.activity_events;

CREATE POLICY activity_events_self_insert
  ON app.activity_events FOR INSERT TO app_authenticated
  WITH CHECK (
    actor_user_id = current_setting('app.user_id')::app.usr_id
  );
