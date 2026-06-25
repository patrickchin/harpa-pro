-- 0019_account_deletion.sql
--
-- App Store-compliant in-app account deletion. The API calls the
-- SECURITY DEFINER function through the normal scoped `/me` route so
-- `current_setting('app.user_id')` remains the source of authority.

BEGIN;

ALTER TABLE app.user_limit_overrides
  DROP CONSTRAINT IF EXISTS user_limit_overrides_granted_by_fkey;

ALTER TABLE app.user_limit_overrides
  ALTER COLUMN granted_by DROP NOT NULL;

ALTER TABLE app.user_limit_overrides
  ADD CONSTRAINT user_limit_overrides_granted_by_fkey
  FOREIGN KEY (granted_by) REFERENCES public."user"(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION app.delete_current_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_temp
AS $$
DECLARE
  v_user  app.usr_id := current_setting('app.user_id')::app.usr_id;
  v_email text;
BEGIN
  SELECT u.email INTO v_email
  FROM public."user" u
  WHERE u.id = v_user;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Solo projects disappear with the account. Cascades remove reports,
  -- notes, project_members, and project-scoped file rows.
  WITH solo_projects AS (
    SELECT pm.project_id
    FROM app.project_members pm
    WHERE pm.user_id = v_user
      AND (
        SELECT count(*)
        FROM app.project_members pm_count
        WHERE pm_count.project_id = pm.project_id
      ) = 1
  )
  DELETE FROM app.projects p
  USING solo_projects s
  WHERE p.id = s.project_id;

  -- Any remaining project that points at the deleting account must
  -- pick a surviving owner. Prefer an existing owner, otherwise the
  -- oldest remaining member becomes owner.
  WITH owner_candidates AS (
    SELECT DISTINCT ON (pm.project_id)
      pm.project_id,
      pm.user_id
    FROM app.project_members pm
    JOIN app.projects p ON p.id = pm.project_id
    WHERE p.owner_id = v_user
      AND pm.user_id <> v_user
    ORDER BY
      pm.project_id,
      (pm.role = 'owner') DESC,
      pm.joined_at ASC,
      pm.user_id ASC
  ),
  updated_projects AS (
    UPDATE app.projects p
    SET owner_id = c.user_id,
        updated_at = now()
    FROM owner_candidates c
    WHERE p.id = c.project_id
    RETURNING p.id, p.owner_id
  )
  UPDATE app.project_members pm
  SET role = 'owner'
  FROM updated_projects p
  WHERE pm.project_id = p.id
    AND pm.user_id = p.owner_id
    AND pm.role <> 'owner';

  DELETE FROM app.project_members
  WHERE user_id = v_user;

  DELETE FROM app.llm_usage_events
  WHERE user_id = v_user;

  DELETE FROM public."verification"
  WHERE identifier IN (
    v_email,
    'sign-in-otp-' || v_email,
    'email-otp-' || v_email
  );

  DELETE FROM public."user"
  WHERE id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION app.delete_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.delete_current_user() TO app_authenticated;

COMMIT;
