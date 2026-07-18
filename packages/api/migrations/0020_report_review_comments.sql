-- Published-report review comments.
--
-- Comments are intentionally separate from app.notes: review feedback must
-- never mutate the frozen report body or participate in note regeneration.

DO $$ BEGIN
  CREATE DOMAIN app.rcm_id AS text
    CHECK (value ~ '^rcm_[0-9a-hjkmnp-tv-z]{8,16}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS app.report_comments (
  id          app.rcm_id PRIMARY KEY,
  report_id   app.rpt_id NOT NULL
    REFERENCES app.reports(id) ON DELETE CASCADE,
  author_id   app.usr_id NOT NULL
    REFERENCES public."user"(id) ON DELETE CASCADE,
  body        text NOT NULL
    CHECK (btrim(body) <> '' AND char_length(body) <= 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_comments_report_created_idx
  ON app.report_comments(report_id, created_at, id);

GRANT SELECT, INSERT ON app.report_comments TO app_authenticated;

ALTER TABLE app.report_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_comments_member_read
  ON app.report_comments FOR SELECT TO app_authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM app.reports r
      WHERE r.id = report_id
        AND r.status = 'finalized'
        AND app.is_member(r.project_id)
    )
  );

CREATE POLICY report_comments_member_insert
  ON app.report_comments FOR INSERT TO app_authenticated
  WITH CHECK (
    author_id = current_setting('app.user_id')::app.usr_id
    AND EXISTS (
      SELECT 1
      FROM app.reports r
      WHERE r.id = report_id
        AND r.status = 'finalized'
        AND app.is_member(r.project_id)
    )
  );

-- public."user" only exposes the caller's own row through RLS. This helper
-- may read an author's display name only after proving the caller can read the
-- finalized report through current project membership.
CREATE OR REPLACE FUNCTION app.list_report_comments(p_report_id app.rpt_id)
RETURNS TABLE (
  id                  app.rcm_id,
  report_id           app.rpt_id,
  author_id           app.usr_id,
  author_display_name text,
  body                text,
  created_at          timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public, pg_temp
AS $$
  SELECT c.id,
         c.report_id,
         c.author_id,
         COALESCE(
           NULLIF(btrim(u.display_name), ''),
           NULLIF(btrim(u.name), ''),
           'Project member'
         ) AS author_display_name,
         c.body,
         c.created_at
  FROM app.report_comments c
  JOIN app.reports r ON r.id = c.report_id
  JOIN public."user" u ON u.id = c.author_id
  WHERE c.report_id = p_report_id
    AND r.status = 'finalized'
    AND app.is_member(r.project_id)
  ORDER BY c.created_at ASC, c.id ASC;
$$;

REVOKE ALL ON FUNCTION app.list_report_comments(app.rpt_id) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_report_comments(app.rpt_id)
  TO app_authenticated;
