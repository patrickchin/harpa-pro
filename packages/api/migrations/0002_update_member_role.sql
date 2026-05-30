-- 0002_update_member_role.sql
-- Adds app.update_member_role SECURITY DEFINER to support
-- PATCH /projects/{project}/members/{user}.
--
-- Guards:
--   1. Caller must be owner of the project.
--   2. Target must be an existing member.
--   3. Idempotent: same-role PATCH is a no-op (no DB write).
--   4. Last-owner guard: owner → non-owner is blocked when only one owner exists.

CREATE OR REPLACE FUNCTION app.update_member_role(
  p_project_id app.prj_id,
  p_user_id    app.usr_id,
  p_new_role   app.project_role
)
RETURNS TABLE (
  user_id      app.usr_id,
  display_name text,
  phone        varchar(32),
  role         app.project_role,
  joined_at    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, auth, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_caller      app.usr_id := current_setting('app.user_id')::app.usr_id;
  v_cur_role    app.project_role;
  v_owner_count int;
BEGIN
  -- 1. Caller must be an owner of this project.
  IF NOT EXISTS (
    SELECT 1 FROM app.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = v_caller
      AND pm.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'not_an_owner' USING ERRCODE = '42501';
  END IF;

  -- 2. Target must be an existing member.
  SELECT pm.role INTO v_cur_role
  FROM app.project_members pm
  WHERE pm.project_id = p_project_id AND pm.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Idempotency: same role is a no-op; skip the update.
  IF v_cur_role <> p_new_role THEN
    -- 4. Last-owner guard: demoting an owner requires at least one other owner.
    IF v_cur_role = 'owner' AND p_new_role <> 'owner' THEN
      SELECT count(*) INTO v_owner_count
      FROM app.project_members
      WHERE project_id = p_project_id AND role = 'owner';

      IF v_owner_count <= 1 THEN
        -- 23514 = check_violation; mapPgError maps this to 'conflict' → 409.
        RAISE EXCEPTION 'last_owner' USING ERRCODE = '23514';
      END IF;
    END IF;

    UPDATE app.project_members
    SET role = p_new_role
    WHERE project_id = p_project_id AND user_id = p_user_id;
  END IF;

  RETURN QUERY
    SELECT pm.user_id, u.display_name, u.phone, pm.role, pm.joined_at
    FROM app.project_members pm
    JOIN auth.users u ON u.id = pm.user_id
    WHERE pm.project_id = p_project_id AND pm.user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION app.update_member_role(app.prj_id, app.usr_id, app.project_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.update_member_role(app.prj_id, app.usr_id, app.project_role)
  TO app_authenticated;
