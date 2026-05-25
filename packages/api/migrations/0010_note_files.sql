-- 0010_note_files.sql
--
-- Batch photo notes: one note → many files via a join table.
-- See docs/superpowers/specs/2026-05-25-batch-photo-notes-design.md.
--
-- Expand-only: new table + backfill existing single-file image notes
-- into the join table, then clear legacy columns on image rows.

CREATE TABLE app.note_files (
  id                  text PRIMARY KEY,
  note_id             text NOT NULL REFERENCES app.notes(id) ON DELETE CASCADE,
  file_id             text NOT NULL REFERENCES app.files(id),
  thumbnail_file_id   text REFERENCES app.files(id) ON DELETE SET NULL,
  position            integer NOT NULL DEFAULT 0,
  caption             text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, position)
);

CREATE INDEX note_files_note_id_idx ON app.note_files (note_id, position);

-- Backfill: every existing image note that has a file_id → one note_files row.
-- Preserves original created_at for historical fidelity.
INSERT INTO app.note_files (id, note_id, file_id, thumbnail_file_id, position, created_at)
SELECT
  'nfl_' || substr(md5(random()::text || id), 1, 10),
  id,
  file_id,
  thumbnail_file_id,
  0,
  created_at
FROM app.notes
WHERE kind = 'image' AND file_id IS NOT NULL;

-- Clear legacy columns on image notes (voice/document keep theirs).
UPDATE app.notes
SET file_id = NULL, thumbnail_file_id = NULL
WHERE kind = 'image' AND file_id IS NOT NULL;

-- Grants + RLS: note_files inherits access from parent note.
GRANT SELECT, INSERT, UPDATE, DELETE ON app.note_files TO app_authenticated;

ALTER TABLE app.note_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY note_files_member_read ON app.note_files FOR SELECT TO app_authenticated
  USING (EXISTS (
    SELECT 1 FROM app.notes n
    JOIN app.reports r ON r.id = n.report_id
    WHERE n.id = note_id AND app.is_member(r.project_id)
  ));

CREATE POLICY note_files_member_insert ON app.note_files FOR INSERT TO app_authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM app.notes n
    JOIN app.reports r ON r.id = n.report_id
    WHERE n.id = note_id
      AND n.author_id = current_setting('app.user_id')::app.usr_id
      AND app.is_member(r.project_id)
  ));

CREATE POLICY note_files_author_delete ON app.note_files FOR DELETE TO app_authenticated
  USING (EXISTS (
    SELECT 1 FROM app.notes n
    WHERE n.id = note_id AND n.author_id = current_setting('app.user_id')::app.usr_id
  ));
