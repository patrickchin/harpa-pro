-- 0011_files_project_scope.sql
--
-- Files become project-scoped: `app.files` gains nullable
-- `project_id` + `report_id` FKs, and the owner-only
-- `files_owner_all` policy is replaced with three (well, four)
-- discriminated policies so any project member can read / mutate
-- a file attached to a project they belong to. Avatars + scratch
-- uploads stay NULL/NULL on both columns and remain owner-only.
--
-- See plan in session-state d47700ed-… and docs/v4/arch-storage.md.
-- Pre-launch: row counts are tiny and the backfill is one-shot.

-- ---------- Columns ----------
ALTER TABLE app.files
  ADD COLUMN IF NOT EXISTS project_id app.prj_id
    REFERENCES app.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS report_id  app.rpt_id
    REFERENCES app.reports(id)  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS files_project_id_idx ON app.files (project_id);
CREATE INDEX IF NOT EXISTS files_report_id_idx  ON app.files (report_id);

-- ---------- Backfill ----------
-- Project image / batched image notes route via `note_files`.
UPDATE app.files f
SET project_id = r.project_id,
    report_id  = r.id
FROM app.note_files nf
JOIN app.notes   n ON n.id = nf.note_id
JOIN app.reports r ON r.id = n.report_id
WHERE nf.file_id = f.id
  AND (f.project_id IS NULL OR f.report_id IS NULL);

-- Legacy single-file notes (voice / document / pre-batch image)
-- attach the file via `notes.file_id`.
UPDATE app.files f
SET project_id = r.project_id,
    report_id  = r.id
FROM app.notes   n
JOIN app.reports r ON r.id = n.report_id
WHERE n.file_id = f.id
  AND (f.project_id IS NULL OR f.report_id IS NULL);

-- Thumbnails attached via notes.thumbnail_file_id (image notes).
UPDATE app.files f
SET project_id = r.project_id,
    report_id  = r.id
FROM app.notes   n
JOIN app.reports r ON r.id = n.report_id
WHERE n.thumbnail_file_id = f.id
  AND (f.project_id IS NULL OR f.report_id IS NULL);

-- Note-files thumbnails (batch photo notes).
UPDATE app.files f
SET project_id = r.project_id,
    report_id  = r.id
FROM app.note_files nf
JOIN app.notes   n ON n.id = nf.note_id
JOIN app.reports r ON r.id = n.report_id
WHERE nf.thumbnail_file_id = f.id
  AND (f.project_id IS NULL OR f.report_id IS NULL);

-- Report PDFs (kind='pdf') attach via reports.pdf_file_id.
UPDATE app.files f
SET project_id = r.project_id,
    report_id  = r.id
FROM app.reports r
WHERE r.pdf_file_id = f.id
  AND (f.project_id IS NULL OR f.report_id IS NULL);

-- Avatars + scratch + orphans intentionally stay NULL/NULL.

-- ---------- Policies ----------
-- The old policy was FOR ALL — owner-only on every action.
-- Replace it with separate policies per action so member-writes can
-- be opened up without losing the owner-only INSERT guarantee
-- (you may only upload as yourself).
DROP POLICY IF EXISTS files_owner_all ON app.files;

-- SELECT: owners always see their own files; project members see
-- every file attached to a project they belong to.
CREATE POLICY files_member_read ON app.files FOR SELECT TO app_authenticated
  USING (
    owner_id = current_setting('app.user_id')::app.usr_id
    OR (project_id IS NOT NULL AND app.is_member(project_id))
  );

-- INSERT: owner-only. The API always sets owner_id from the JWT,
-- so callers cannot upload "as" someone else. Project_id is checked
-- by the route, not the policy — we accept any project_id at the DB
-- layer here and rely on the route to assert membership before
-- inserting (the row is still readable + mutable by the uploader
-- via owner_id either way).
CREATE POLICY files_owner_insert ON app.files FOR INSERT TO app_authenticated
  WITH CHECK (owner_id = current_setting('app.user_id')::app.usr_id);

-- UPDATE: any project member, or the original owner.
CREATE POLICY files_member_write ON app.files FOR UPDATE TO app_authenticated
  USING (
    owner_id = current_setting('app.user_id')::app.usr_id
    OR (project_id IS NOT NULL AND app.is_member(project_id))
  )
  WITH CHECK (
    owner_id = current_setting('app.user_id')::app.usr_id
    OR (project_id IS NOT NULL AND app.is_member(project_id))
  );

-- DELETE: same as UPDATE — split into its own policy because
-- Postgres requires per-action policies for U vs D.
CREATE POLICY files_member_delete ON app.files FOR DELETE TO app_authenticated
  USING (
    owner_id = current_setting('app.user_id')::app.usr_id
    OR (project_id IS NOT NULL AND app.is_member(project_id))
  );
