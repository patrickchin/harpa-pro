-- 0028_report_version_monotonic.sql
--
-- Report updated_at is an optimistic-concurrency token exposed at millisecond
-- precision. PDF attachment must always advance it beyond the stored token,
-- even when two writes share a clock millisecond or the database clock moves
-- behind a future-dated row.

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
      updated_at = GREATEST(
        date_trunc('milliseconds', clock_timestamp()),
        date_trunc('milliseconds', r.updated_at) + interval '1 millisecond'
      )
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
