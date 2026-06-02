-- 0014_better_auth_init.sql
--
-- Rip-and-replace the hand-rolled phone-OTP auth with better-auth
-- (email-OTP via Resend). Wipes the `auth` schema, creates the four
-- better-auth tables in `public`, and re-points every app-side FK at
-- `public.user(id)`. See:
--   - docs/superpowers/specs/2026-06-02-migrate-auth-to-better-auth-design.md
--   - docs/v4/arch-auth-and-rls.md
--
-- This migration is the sole owner of the better-auth tables. No
-- IF NOT EXISTS on CREATE TABLE — running twice should fail loudly.
--
-- Column shape lock-stepped with packages/api/src/db/auth-schema.ts
-- (CLI-generated). Slug IDs are minted at write time by
-- advanced.database.generateId; they are NOT enforced by a DB CHECK
-- on the better-auth tables. The slug regex IS enforced at the
-- app.usr_id boundary on every FK from app.* into public.user.

BEGIN;

-- ---------------------------------------------------------------
-- 1. Drop FKs from app tables that pointed at auth.users.
-- ---------------------------------------------------------------
ALTER TABLE app.projects             DROP CONSTRAINT IF EXISTS projects_owner_id_fkey;
ALTER TABLE app.project_members      DROP CONSTRAINT IF EXISTS project_members_user_id_fkey;
ALTER TABLE app.user_settings        DROP CONSTRAINT IF EXISTS user_settings_user_id_fkey;
ALTER TABLE app.files                DROP CONSTRAINT IF EXISTS files_owner_id_fkey;
ALTER TABLE app.user_limit_overrides DROP CONSTRAINT IF EXISTS user_limit_overrides_user_id_fkey;
ALTER TABLE app.user_limit_overrides DROP CONSTRAINT IF EXISTS user_limit_overrides_granted_by_fkey;

-- ---------------------------------------------------------------
-- 2. Drop phone-coupled SQL functions and the auth schema entirely.
--    No production users yet → no data to migrate.
-- ---------------------------------------------------------------
DROP FUNCTION IF EXISTS app.add_project_member_by_phone(app.prj_id, varchar, app.project_role);
DROP FUNCTION IF EXISTS app.list_project_members(app.prj_id);
DROP FUNCTION IF EXISTS app.update_member_role(app.prj_id, app.usr_id, app.project_role);
DROP SCHEMA IF EXISTS auth CASCADE;

-- ---------------------------------------------------------------
-- 3. Create better-auth tables in `public`.
-- ---------------------------------------------------------------
CREATE TABLE public."user" (
  id              text PRIMARY KEY,
  name            text NOT NULL DEFAULT '',
  email           text NOT NULL UNIQUE,
  email_verified  boolean NOT NULL DEFAULT false,
  image           text,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  display_name    text,
  company_name    text,
  is_admin        boolean DEFAULT false,
  plan            text DEFAULT 'free'
);

CREATE TABLE public."session" (
  id          text PRIMARY KEY,
  expires_at  timestamp NOT NULL,
  token       text NOT NULL UNIQUE,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL,
  ip_address  text,
  user_agent  text,
  user_id     text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE
);
CREATE INDEX session_userId_idx ON public."session"(user_id);

CREATE TABLE public."account" (
  id                       text PRIMARY KEY,
  account_id               text NOT NULL,
  provider_id              text NOT NULL,
  user_id                  text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  access_token             text,
  refresh_token            text,
  id_token                 text,
  access_token_expires_at  timestamp,
  refresh_token_expires_at timestamp,
  scope                    text,
  password                 text,
  created_at               timestamp NOT NULL DEFAULT now(),
  updated_at               timestamp NOT NULL
);
CREATE INDEX account_userId_idx ON public."account"(user_id);

CREATE TABLE public."verification" (
  id          text PRIMARY KEY,
  identifier  text NOT NULL,
  value       text NOT NULL,
  expires_at  timestamp NOT NULL,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier_idx ON public."verification"(identifier);

-- ---------------------------------------------------------------
-- 4. Re-add FKs from app.* tables to public.user(id).
-- ---------------------------------------------------------------
ALTER TABLE app.projects
  ADD CONSTRAINT projects_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE app.project_members
  ADD CONSTRAINT project_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE app.user_settings
  ADD CONSTRAINT user_settings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE app.files
  ADD CONSTRAINT files_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE app.user_limit_overrides
  ADD CONSTRAINT user_limit_overrides_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE app.user_limit_overrides
  ADD CONSTRAINT user_limit_overrides_granted_by_fkey
  FOREIGN KEY (granted_by) REFERENCES public."user"(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------
-- 5. Recreate phone-coupled functions against public.user, swapping
--    phone lookups for email and dropping `phone` from return shapes.
--    Replaces the originals from migrations 0001 and 0002.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.list_project_members(p_project_id app.prj_id)
RETURNS TABLE (
  user_id      app.usr_id,
  display_name text,
  email        text,
  role         app.project_role,
  joined_at    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_user app.usr_id := current_setting('app.user_id')::app.usr_id;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.project_members pm
    WHERE pm.project_id = p_project_id AND pm.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT pm.user_id, u.display_name, u.email, pm.role, pm.joined_at
    FROM app.project_members pm
    JOIN public."user" u ON u.id = pm.user_id
    WHERE pm.project_id = p_project_id
    ORDER BY pm.joined_at;
END;
$$;
REVOKE ALL ON FUNCTION app.list_project_members(app.prj_id) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_project_members(app.prj_id) TO app_authenticated;

CREATE OR REPLACE FUNCTION app.add_project_member_by_email(
  p_project_id app.prj_id,
  p_email      text,
  p_role       app.project_role
)
RETURNS TABLE (
  user_id      app.usr_id,
  display_name text,
  email        text,
  role         app.project_role,
  joined_at    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_caller app.usr_id := current_setting('app.user_id')::app.usr_id;
  v_target app.usr_id;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = v_caller
      AND pm.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'not_an_owner' USING ERRCODE = '42501';
  END IF;

  SELECT u.id::app.usr_id INTO v_target
  FROM public."user" u
  WHERE lower(u.email) = lower(p_email);
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Refuse to re-invite an existing member; see 0001 for rationale.
  IF EXISTS (
    SELECT 1 FROM app.project_members pm
    WHERE pm.project_id = p_project_id AND pm.user_id = v_target
  ) THEN
    RAISE EXCEPTION 'already_member' USING ERRCODE = '23505';
  END IF;

  INSERT INTO app.project_members(project_id, user_id, role)
  VALUES (p_project_id, v_target, p_role);

  RETURN QUERY
    SELECT pm.user_id, u.display_name, u.email, pm.role, pm.joined_at
    FROM app.project_members pm
    JOIN public."user" u ON u.id = pm.user_id
    WHERE pm.project_id = p_project_id AND pm.user_id = v_target;
END;
$$;
REVOKE ALL ON FUNCTION app.add_project_member_by_email(app.prj_id, text, app.project_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.add_project_member_by_email(app.prj_id, text, app.project_role) TO app_authenticated;

CREATE OR REPLACE FUNCTION app.update_member_role(
  p_project_id app.prj_id,
  p_user_id    app.usr_id,
  p_new_role   app.project_role
)
RETURNS TABLE (
  user_id      app.usr_id,
  display_name text,
  email        text,
  role         app.project_role,
  joined_at    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_caller      app.usr_id := current_setting('app.user_id')::app.usr_id;
  v_cur_role    app.project_role;
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

  SELECT pm.role INTO v_cur_role
  FROM app.project_members pm
  WHERE pm.project_id = p_project_id AND pm.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_cur_role <> p_new_role THEN
    IF v_cur_role = 'owner' AND p_new_role <> 'owner' THEN
      SELECT count(*) INTO v_owner_count
      FROM app.project_members
      WHERE project_id = p_project_id AND role = 'owner';

      IF v_owner_count <= 1 THEN
        RAISE EXCEPTION 'last_owner' USING ERRCODE = '23514';
      END IF;
    END IF;

    UPDATE app.project_members
    SET role = p_new_role
    WHERE project_id = p_project_id AND user_id = p_user_id;
  END IF;

  RETURN QUERY
    SELECT pm.user_id, u.display_name, u.email, pm.role, pm.joined_at
    FROM app.project_members pm
    JOIN public."user" u ON u.id = pm.user_id
    WHERE pm.project_id = p_project_id AND pm.user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION app.update_member_role(app.prj_id, app.usr_id, app.project_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.update_member_role(app.prj_id, app.usr_id, app.project_role) TO app_authenticated;

-- ---------------------------------------------------------------
-- 6. Grants for app_authenticated to read its own row from public.user.
--    Mirrors the old auth.users grants — display_name + company_name
--    are user-updatable; everything else is read-only from app code.
-- ---------------------------------------------------------------
GRANT SELECT ON public."user" TO app_authenticated;
GRANT UPDATE (display_name, company_name, updated_at) ON public."user" TO app_authenticated;

-- ---------------------------------------------------------------
-- 7. RLS on public.user — limits app_authenticated to the caller's
--    own row. Better-auth's adapter uses the unscoped pool and bypasses
--    these policies. Without this, a stray `db.select().from(user)` in
--    a route handler would leak the entire user table.
--
--    No RLS on session/account/verification — better-auth queries them
--    via the unscoped pool by design; app code never reads them.
-- ---------------------------------------------------------------
ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_self_read ON public."user"
  FOR SELECT TO app_authenticated
  USING (id = current_setting('app.user_id', true));
CREATE POLICY user_self_update ON public."user"
  FOR UPDATE TO app_authenticated
  USING      (id = current_setting('app.user_id', true))
  WITH CHECK (id = current_setting('app.user_id', true));

COMMIT;
