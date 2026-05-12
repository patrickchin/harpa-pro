-- 202605120003_projects_helpers.sql
-- SECURITY DEFINER helpers for the projects + members surface.
--
-- The per-request scope role `app_authenticated` has RLS on every app.*
-- table and on auth.users. That's correct as the default — but a few
-- normal flows need to bridge tables in a way that re-enters RLS and
-- either deadlocks or denies legitimate access:
--
--   * creating a project + inserting your own owner-membership row in
--     a single transaction (chicken-and-egg: project_members insert
--     policy needs you to already be an owner)
--   * listing project members (joins app.project_members to
--     auth.users; the caller can only SELECT themselves on auth.users)
--   * resolving a phone number to a user id when inviting a member
--     (same auth.users RLS issue)
--
-- All helpers below:
--   * are SECURITY DEFINER with SET search_path = app, auth, pg_temp
--     so they bypass RLS on the tables they read/write
--   * derive the caller from current_setting('app.user_id'), so the
--     scope wrapper is still the source of truth for authorisation
--   * EXECUTE-granted to app_authenticated only

-- ---------- create_project_with_owner ----------
CREATE OR REPLACE FUNCTION app.create_project_with_owner(
  p_name text,
  p_client_name text,
  p_address text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE
  v_user uuid := current_setting('app.user_id')::uuid;
  v_id uuid;
BEGIN
  INSERT INTO app.projects(name, client_name, address, owner_id)
  VALUES (p_name, p_client_name, p_address, v_user)
  RETURNING id INTO v_id;

  INSERT INTO app.project_members(project_id, user_id, role)
  VALUES (v_id, v_user, 'owner');

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION app.create_project_with_owner(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.create_project_with_owner(text, text, text) TO app_authenticated;

-- ---------- list_project_members ----------
CREATE OR REPLACE FUNCTION app.list_project_members(p_project_id uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  phone varchar(32),
  role app.project_role,
  joined_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, auth, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_user uuid := current_setting('app.user_id')::uuid;
BEGIN
  -- Caller must be a member of the project to list it.
  IF NOT EXISTS (
    SELECT 1 FROM app.project_members pm
    WHERE pm.project_id = p_project_id AND pm.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT pm.user_id, u.display_name, u.phone, pm.role, pm.joined_at
    FROM app.project_members pm
    JOIN auth.users u ON u.id = pm.user_id
    WHERE pm.project_id = p_project_id
    ORDER BY pm.joined_at;
END;
$$;
REVOKE ALL ON FUNCTION app.list_project_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_project_members(uuid) TO app_authenticated;

-- ---------- add_project_member_by_phone ----------
-- Returns the inserted/conflicting member row. Requires caller is an
-- owner of the project. Returns NULL user_id if the phone has never
-- logged in (callers can decide to surface a 404 vs. invite-pending).
CREATE OR REPLACE FUNCTION app.add_project_member_by_phone(
  p_project_id uuid,
  p_phone varchar(32),
  p_role app.project_role
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  phone varchar(32),
  role app.project_role,
  joined_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, auth, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_caller uuid := current_setting('app.user_id')::uuid;
  v_target uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = v_caller
      AND pm.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'not_an_owner' USING ERRCODE = '42501';
  END IF;

  SELECT u.id INTO v_target FROM auth.users u WHERE u.phone = p_phone;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO app.project_members(project_id, user_id, role)
  VALUES (p_project_id, v_target, p_role)
  ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN QUERY
    SELECT pm.user_id, u.display_name, u.phone, pm.role, pm.joined_at
    FROM app.project_members pm
    JOIN auth.users u ON u.id = pm.user_id
    WHERE pm.project_id = p_project_id AND pm.user_id = v_target;
END;
$$;
REVOKE ALL ON FUNCTION app.add_project_member_by_phone(uuid, varchar, app.project_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.add_project_member_by_phone(uuid, varchar, app.project_role) TO app_authenticated;

-- ---------- remove_project_member ----------
CREATE OR REPLACE FUNCTION app.remove_project_member(p_project_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE
  v_caller uuid := current_setting('app.user_id')::uuid;
  v_owner_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = v_caller
      AND pm.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'not_an_owner' USING ERRCODE = '42501';
  END IF;

  -- Refuse to remove the last owner.
  IF p_user_id = v_caller THEN
    SELECT count(*) INTO v_owner_count FROM app.project_members
    WHERE project_id = p_project_id AND role = 'owner';
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'last_owner' USING ERRCODE = '23514';
    END IF;
  END IF;

  DELETE FROM app.project_members
  WHERE project_id = p_project_id AND user_id = p_user_id;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION app.remove_project_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.remove_project_member(uuid, uuid) TO app_authenticated;

-- ---------- project_stats helper ----------
-- Reports + drafts + last-report-at for a project. Caller must be a
-- member; returns nulls when the project has no reports.
CREATE OR REPLACE FUNCTION app.project_stats(p_project_id uuid)
RETURNS TABLE (
  total_reports bigint,
  drafts bigint,
  last_report_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE
  v_caller uuid := current_setting('app.user_id')::uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.project_members pm
    WHERE pm.project_id = p_project_id AND pm.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      count(*)::bigint AS total_reports,
      count(*) FILTER (WHERE status = 'draft')::bigint AS drafts,
      max(created_at) AS last_report_at
    FROM app.reports
    WHERE project_id = p_project_id;
END;
$$;
REVOKE ALL ON FUNCTION app.project_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_stats(uuid) TO app_authenticated;
