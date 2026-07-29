-- 0026_project_write_roles.sql
--
-- Defense-in-depth project role enforcement.
--
-- Membership keeps project content readable. Only owners and editors may
-- mutate project content; member management and project deletion retain their
-- existing owner-only policies. Route guards remain the first boundary, while
-- these policies prevent a missed guard from granting viewer writes.

CREATE OR REPLACE FUNCTION app.can_edit_project(p app.prj_id)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.project_members pm
    WHERE pm.project_id = p
      AND pm.user_id = current_setting('app.user_id')::app.usr_id
      AND pm.role IN ('owner', 'editor')
  );
$$;

REVOKE ALL ON FUNCTION app.can_edit_project(app.prj_id) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_edit_project(app.prj_id) TO app_authenticated;

-- Projects: membership still grants reads; metadata writes require a writer.
DROP POLICY IF EXISTS projects_member_update ON app.projects;
CREATE POLICY projects_writer_update
ON app.projects
FOR UPDATE
TO app_authenticated
USING (app.can_edit_project(id))
WITH CHECK (app.can_edit_project(id));

-- Reports: owners/editors may create and mutate; viewers remain read-only.
DROP POLICY IF EXISTS reports_member_write ON app.reports;
DROP POLICY IF EXISTS reports_member_update ON app.reports;
DROP POLICY IF EXISTS reports_member_delete ON app.reports;

CREATE POLICY reports_writer_insert
ON app.reports
FOR INSERT
TO app_authenticated
WITH CHECK (
  app.can_edit_project(project_id)
  AND author_id = current_setting('app.user_id')::app.usr_id
);

CREATE POLICY reports_writer_update
ON app.reports
FOR UPDATE
TO app_authenticated
USING (app.can_edit_project(project_id))
WITH CHECK (app.can_edit_project(project_id));

CREATE POLICY reports_writer_delete
ON app.reports
FOR DELETE
TO app_authenticated
USING (app.can_edit_project(project_id));

-- Notes: writers may create notes and may edit/delete only their own notes.
DROP POLICY IF EXISTS notes_member_write ON app.notes;
DROP POLICY IF EXISTS notes_author_update ON app.notes;
DROP POLICY IF EXISTS notes_author_delete ON app.notes;

CREATE POLICY notes_writer_insert
ON app.notes
FOR INSERT
TO app_authenticated
WITH CHECK (
  author_id = current_setting('app.user_id')::app.usr_id
  AND EXISTS (
    SELECT 1
    FROM app.reports r
    WHERE r.id = report_id
      AND app.can_edit_project(r.project_id)
  )
);

CREATE POLICY notes_writer_author_update
ON app.notes
FOR UPDATE
TO app_authenticated
USING (
  author_id = current_setting('app.user_id')::app.usr_id
  AND EXISTS (
    SELECT 1
    FROM app.reports r
    WHERE r.id = report_id
      AND app.can_edit_project(r.project_id)
  )
)
WITH CHECK (
  author_id = current_setting('app.user_id')::app.usr_id
  AND EXISTS (
    SELECT 1
    FROM app.reports r
    WHERE r.id = report_id
      AND app.can_edit_project(r.project_id)
  )
);

CREATE POLICY notes_writer_author_delete
ON app.notes
FOR DELETE
TO app_authenticated
USING (
  author_id = current_setting('app.user_id')::app.usr_id
  AND EXISTS (
    SELECT 1
    FROM app.reports r
    WHERE r.id = report_id
      AND app.can_edit_project(r.project_id)
  )
);

-- Batch note files inherit both author ownership and writer role.
DROP POLICY IF EXISTS note_files_member_insert ON app.note_files;
DROP POLICY IF EXISTS note_files_author_delete ON app.note_files;

CREATE POLICY note_files_writer_insert
ON app.note_files
FOR INSERT
TO app_authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM app.notes n
    JOIN app.reports r ON r.id = n.report_id
    WHERE n.id = note_id
      AND n.author_id = current_setting('app.user_id')::app.usr_id
      AND app.can_edit_project(r.project_id)
  )
);

CREATE POLICY note_files_writer_author_delete
ON app.note_files
FOR DELETE
TO app_authenticated
USING (
  EXISTS (
    SELECT 1
    FROM app.notes n
    JOIN app.reports r ON r.id = n.report_id
    WHERE n.id = note_id
      AND n.author_id = current_setting('app.user_id')::app.usr_id
      AND app.can_edit_project(r.project_id)
  )
);

-- Files: personal files remain owner-managed. Project-scoped files are
-- mutable by project writers, regardless of which teammate uploaded them.
DROP POLICY IF EXISTS files_owner_insert ON app.files;
DROP POLICY IF EXISTS files_member_write ON app.files;
DROP POLICY IF EXISTS files_member_delete ON app.files;

CREATE POLICY files_owner_or_writer_insert
ON app.files
FOR INSERT
TO app_authenticated
WITH CHECK (
  owner_id = current_setting('app.user_id')::app.usr_id
  AND (
    project_id IS NULL
    OR app.can_edit_project(project_id)
    OR (
      kind = 'pdf'
      AND app.is_member(project_id)
    )
  )
);

CREATE POLICY files_owner_or_writer_update
ON app.files
FOR UPDATE
TO app_authenticated
USING (
  (
    project_id IS NULL
    AND owner_id = current_setting('app.user_id')::app.usr_id
  )
  OR (
    project_id IS NOT NULL
    AND app.can_edit_project(project_id)
  )
)
WITH CHECK (
  (
    project_id IS NULL
    AND owner_id = current_setting('app.user_id')::app.usr_id
  )
  OR (
    project_id IS NOT NULL
    AND app.can_edit_project(project_id)
  )
);

CREATE POLICY files_owner_or_writer_delete
ON app.files
FOR DELETE
TO app_authenticated
USING (
  (
    project_id IS NULL
    AND owner_id = current_setting('app.user_id')::app.usr_id
  )
  OR (
    project_id IS NOT NULL
    AND app.can_edit_project(project_id)
  )
);

-- PDF export is intentionally available to every current member. Rendering a
-- PDF creates a file row and records that file on the report, but must not
-- grant viewers a general report UPDATE policy. This narrow function validates
-- both membership and the exact PDF file relationship before changing only
-- pdf_file_id.
CREATE OR REPLACE FUNCTION app.attach_report_pdf(
  p_report app.rpt_id,
  p_file app.fil_id
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  UPDATE app.reports r
  SET pdf_file_id = p_file,
      updated_at = now()
  WHERE r.id = p_report
    AND app.is_member(r.project_id)
    AND EXISTS (
      SELECT 1
      FROM app.files f
      WHERE f.id = p_file
        AND f.kind = 'pdf'
        AND f.owner_id = current_setting('app.user_id')::app.usr_id
        AND f.project_id = r.project_id
        AND f.report_id = r.id
    );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION app.attach_report_pdf(app.rpt_id, app.fil_id) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.attach_report_pdf(app.rpt_id, app.fil_id)
TO app_authenticated;
