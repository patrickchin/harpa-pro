-- 0014_better_auth_init.sql
--
-- Migrate auth from the hand-rolled Twilio-OTP schema to better-auth.
-- This is a rip-and-replace per the spec: the legacy `auth` schema
-- (auth.users / auth.sessions / auth.verifications) is dropped
-- entirely, and better-auth's CLI-generated tables
-- (public."user" / "session" / "account" / "verification") take its
-- place. App-side FKs that pointed at auth.users(id) are reattached
-- to public."user"(id).
--
-- Deployed against a wiped dev database (per the spec); no data
-- preservation or back-fill — the migration assumes either an empty
-- legacy auth schema or a willingness to lose its rows.
--
-- See:
--   * docs/superpowers/specs/2026-06-02-migrate-auth-to-better-auth-design.md
--   * docs/v4/arch-auth-and-rls.md
--   * packages/api/src/db/auth-schema.ts (CLI-generated, lock-stepped
--     with the column list below)

BEGIN;

-- 1. Drop FKs that pointed at auth.users (so we can drop the schema).
--    Auto-generated names are `<table>_<col>_fkey`. Listed against
--    every column that REFERENCES auth.users in 0001 + 0006.
ALTER TABLE app.files                  DROP CONSTRAINT IF EXISTS files_owner_id_fkey;
ALTER TABLE app.user_settings          DROP CONSTRAINT IF EXISTS user_settings_user_id_fkey;
ALTER TABLE app.user_limit_overrides   DROP CONSTRAINT IF EXISTS user_limit_overrides_user_id_fkey;
ALTER TABLE app.user_limit_overrides   DROP CONSTRAINT IF EXISTS user_limit_overrides_granted_by_fkey;

-- 1b. Wipe rows that referenced auth.users so the post-migration FK
--     to public."user" can be re-attached cleanly. Per the spec
--     ("rip-and-replace, no data preservation") this migration
--     assumes the dev DB is being wiped — but the PR-preview workflow
--     branches Neon from a parent that may carry stale rows. CASCADE
--     also clears anything FK-pointing at app.files (note_files,
--     notes.pdf_file_id, voice_notes.file_id, etc.).
TRUNCATE TABLE
  app.files,
  app.user_settings,
  app.user_limit_overrides
CASCADE;

-- 2. Drop phone-coupled functions (they JOIN/SELECT auth.users.phone).
--    Recreated below against public."user".email.
DROP FUNCTION IF EXISTS app.add_project_member_by_phone(app.prj_id, varchar, app.project_role);
DROP FUNCTION IF EXISTS app.list_project_members(app.prj_id);
DROP FUNCTION IF EXISTS app.update_member_role(app.prj_id, app.usr_id, app.project_role);

-- 3. Drop the legacy auth schema. CASCADE clears auth.sessions /
--    auth.verifications + RLS policies on auth.users in one shot.
DROP SCHEMA IF EXISTS auth CASCADE;

-- 4. Create better-auth tables in public. Column list comes from
--    @better-auth/cli generate output (db/auth-schema.ts) — keep
--    this SQL in lock-step with that file. IDs are bare `text`; the
--    slug format (`usr_*`, `ses_*`, `vrf_*`, `idn_*`) is enforced by
--    better-auth's `advanced.database.generateId` callback at write
--    time, not by a CHECK constraint here. No `IF NOT EXISTS` —
--    this migration is the sole owner; double-run must fail loudly.

CREATE TABLE public."user" (
  id              text PRIMARY KEY,
  name            text NOT NULL DEFAULT '',
  email           text NOT NULL UNIQUE,
  email_verified  boolean NOT NULL DEFAULT false,
  image           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  display_name    text,
  company_name    text,
  is_admin        boolean NOT NULL DEFAULT false,
  plan            text NOT NULL DEFAULT 'free'
                  CHECK (plan IN ('free', 'pro', 'enterprise'))
);

CREATE TABLE public."session" (
  id          text PRIMARY KEY,
  expires_at  timestamptz NOT NULL,
  token       text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL,
  ip_address  text,
  user_agent  text,
  user_id     text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE
);
CREATE INDEX session_user_id_idx ON public."session"(user_id);

CREATE TABLE public."account" (
  id                          text PRIMARY KEY,
  account_id                  text NOT NULL,
  provider_id                 text NOT NULL,
  user_id                     text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  access_token                text,
  refresh_token               text,
  id_token                    text,
  access_token_expires_at     timestamptz,
  refresh_token_expires_at    timestamptz,
  scope                       text,
  password                    text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL
);
CREATE INDEX account_user_id_idx ON public."account"(user_id);

CREATE TABLE public."verification" (
  id          text PRIMARY KEY,
  identifier  text NOT NULL,
  value       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier_idx ON public."verification"(identifier);

-- 5. Re-attach app.* FKs to public."user"(id). The column type stays
--    `app.usr_id` (slug-prefixed text domain) — the FK target is now
--    bare `text`, but the slug format is preserved by generateId.
ALTER TABLE app.files
  ADD CONSTRAINT files_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE app.user_settings
  ADD CONSTRAINT user_settings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE app.user_limit_overrides
  ADD CONSTRAINT user_limit_overrides_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE app.user_limit_overrides
  ADD CONSTRAINT user_limit_overrides_granted_by_fkey
  FOREIGN KEY (granted_by) REFERENCES public."user"(id) ON DELETE RESTRICT;

-- 6. Recreate the phone-coupled functions against public."user".email.
--    Identical guard logic; the `phone` return column is replaced by
--    `email`, and the lookup in `add_project_member_by_email` matches
--    on lower(email) so callers don't have to normalise.

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

  SELECT u.id INTO v_target
  FROM public."user" u
  WHERE lower(u.email) = lower(p_email);

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

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
GRANT EXECUTE ON FUNCTION app.update_member_role(app.prj_id, app.usr_id, app.project_role)
  TO app_authenticated;

-- 7. Grants + RLS for app_authenticated against public."user".
--    Mirrors the old auth.users grants — display_name / company_name
--    are user-updatable; email / is_admin / plan are read-only from
--    the app role's POV.
GRANT SELECT ON public."user" TO app_authenticated;
GRANT UPDATE (display_name, company_name, updated_at) ON public."user" TO app_authenticated;

ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_self_select ON public."user"
  FOR SELECT TO app_authenticated
  USING (id = current_setting('app.user_id'));

CREATE POLICY user_self_update ON public."user"
  FOR UPDATE TO app_authenticated
  USING      (id = current_setting('app.user_id'))
  WITH CHECK (id = current_setting('app.user_id'));

-- No RLS on public."session" / "account" / "verification" — they
-- are only accessed by better-auth via the unscoped pool, never
-- from app routes via the scoped accessor. A stray
-- `db.select().from(session)` would still be blocked by the absence
-- of any GRANT to app_authenticated.

COMMIT;
