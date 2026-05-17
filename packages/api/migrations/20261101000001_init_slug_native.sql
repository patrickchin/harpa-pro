-- 20261101000001_init_slug_native.sql
-- P3.1 — Initial schema bootstrap, slug-native edition.
--
-- This single file replaces the eight prior migrations:
--   202605120001_init.sql
--   202605120002_me_update.sql
--   202605120003_projects_helpers.sql
--   202605130001_slugs_and_report_numbers.sql
--   202605130002_waitlist.sql
--   202605130003_admin_role.sql
--   202605130004_projects_helpers_v2_slugs_not_null.sql
--   202605170001_slug_8chars.sql
--
-- Pre-production collapse — see docs/v4/design-p31-slug-only-ids.md.
-- All primary keys are app-minted Crockford base32 slugs
-- (prefix '_' base32). The `id` IS the public slug. No parallel
-- `slug` column on projects / reports. UUID is gone.

-- ---------- Schemas ----------
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS app;

-- ---------- Roles ----------
DO $$ BEGIN
  CREATE ROLE app_authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE app_anonymous NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT USAGE ON SCHEMA auth TO app_authenticated;
GRANT USAGE ON SCHEMA app  TO app_authenticated;
GRANT USAGE ON SCHEMA app  TO app_anonymous;

-- ---------- Extensions ----------
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------- ID domains ----------
-- One domain per entity prefix. Regex matches the per-prefix Zod
-- factory in @harpa/api-contract (idSchema) — minLen 8, maxLen 16
-- of Crockford base32 (0-9, a-z minus i/l/o/u). The DOMAIN CHECK is
-- the DB-side belt to the API-side braces.
DO $$ BEGIN
  CREATE DOMAIN app.prj_id AS text CHECK (value ~ '^prj_[0-9a-hjkmnp-tv-z]{8,16}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE DOMAIN app.rpt_id AS text CHECK (value ~ '^rpt_[0-9a-hjkmnp-tv-z]{8,16}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE DOMAIN app.usr_id AS text CHECK (value ~ '^usr_[0-9a-hjkmnp-tv-z]{8,16}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE DOMAIN app.ses_id AS text CHECK (value ~ '^ses_[0-9a-hjkmnp-tv-z]{8,16}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE DOMAIN app.vrf_id AS text CHECK (value ~ '^vrf_[0-9a-hjkmnp-tv-z]{8,16}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE DOMAIN app.not_id AS text CHECK (value ~ '^not_[0-9a-hjkmnp-tv-z]{8,16}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE DOMAIN app.fil_id AS text CHECK (value ~ '^fil_[0-9a-hjkmnp-tv-z]{8,16}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE DOMAIN app.wls_id AS text CHECK (value ~ '^wls_[0-9a-hjkmnp-tv-z]{8,16}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Enums ----------
DO $$ BEGIN CREATE TYPE app.project_role AS ENUM ('owner','editor','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE app.report_status AS ENUM ('draft','finalized');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE app.note_kind AS ENUM ('text','voice','image','document');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE app.file_kind AS ENUM ('voice','image','document','pdf');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- auth ----------
CREATE TABLE IF NOT EXISTS auth.users (
  id            app.usr_id PRIMARY KEY,
  phone         varchar(32) NOT NULL UNIQUE,
  display_name  text,
  company_name  text,
  is_admin      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id          app.ses_id PRIMARY KEY,
  user_id     app.usr_id NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.verifications (
  id                       app.vrf_id PRIMARY KEY,
  phone                    varchar(32) NOT NULL,
  twilio_verification_sid  text,
  consumed_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON auth.users TO app_authenticated;
GRANT SELECT (is_admin) ON auth.users TO app_authenticated;
GRANT UPDATE (display_name, company_name, updated_at) ON auth.users TO app_authenticated;

-- ---------- app: files (declared first so notes / reports can FK it) ----------
CREATE TABLE IF NOT EXISTS app.files (
  id            app.fil_id PRIMARY KEY,
  owner_id      app.usr_id NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind          app.file_kind NOT NULL,
  file_key      text NOT NULL UNIQUE,
  size_bytes    bigint NOT NULL,
  content_type  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- app: projects ----------
CREATE TABLE IF NOT EXISTS app.projects (
  id                  app.prj_id PRIMARY KEY,
  name                text NOT NULL,
  client_name         text,
  address             text,
  owner_id            app.usr_id NOT NULL,
  next_report_number  int NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.project_members (
  project_id  app.prj_id NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  user_id     app.usr_id NOT NULL,
  role        app.project_role NOT NULL DEFAULT 'editor',
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS project_members_user_idx ON app.project_members(user_id);

-- ---------- app: reports ----------
CREATE TABLE IF NOT EXISTS app.reports (
  id                            app.rpt_id PRIMARY KEY,
  project_id                    app.prj_id NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  author_id                     app.usr_id NOT NULL,
  number                        int NOT NULL,
  status                        app.report_status NOT NULL DEFAULT 'draft',
  visit_date                    timestamptz,
  body                          jsonb,
  notes_since_last_generation   integer NOT NULL DEFAULT 0,
  generated_at                  timestamptz,
  finalized_at                  timestamptz,
  pdf_file_id                   app.fil_id REFERENCES app.files(id) ON DELETE SET NULL,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reports_number_unique UNIQUE (project_id, number)
);

-- ---------- app: notes ----------
CREATE TABLE IF NOT EXISTS app.notes (
  id          app.not_id PRIMARY KEY,
  report_id   app.rpt_id NOT NULL REFERENCES app.reports(id) ON DELETE CASCADE,
  author_id   app.usr_id NOT NULL,
  kind        app.note_kind NOT NULL,
  body        text,
  file_id     app.fil_id REFERENCES app.files(id) ON DELETE SET NULL,
  transcript  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- app: user_settings ----------
CREATE TABLE IF NOT EXISTS app.user_settings (
  user_id     app.usr_id PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_vendor   varchar(32) NOT NULL DEFAULT 'openai',
  ai_model    varchar(64) NOT NULL DEFAULT 'gpt-4o-mini',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- app: waitlist_signups ----------
CREATE TABLE IF NOT EXISTS app.waitlist_signups (
  id                         app.wls_id PRIMARY KEY,
  email                      citext NOT NULL UNIQUE,
  company                    text,
  role                       text,
  source                     text,
  ip_hash                    text,
  confirmed_at               timestamptz,
  confirm_token_hash         text,
  confirm_token_expires_at   timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waitlist_signups_confirm_token_hash_idx
  ON app.waitlist_signups (confirm_token_hash)
  WHERE confirm_token_hash IS NOT NULL;

-- ---------- Table grants ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA app TO app_authenticated;

-- Waitlist signups are admin-only for reads/writes — app_authenticated
-- cannot see them (the admin route uses rawDb() superuser connection).
REVOKE SELECT, UPDATE, DELETE ON app.waitlist_signups FROM app_authenticated;

-- app_anonymous: insert-only on waitlist_signups; no other access.
GRANT INSERT ON app.waitlist_signups TO app_anonymous;

-- ---------- RLS ----------
-- The user_id used by every policy comes from current_setting('app.user_id'),
-- which is set by withScopedConnection() in src/db/scope.ts as an app.usr_id
-- slug (e.g. 'usr_abcd12ef34gh').

ALTER TABLE auth.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.project_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.reports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.files            ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.waitlist_signups ENABLE ROW LEVEL SECURITY;

-- ---------- Membership helpers ----------
CREATE OR REPLACE FUNCTION app.is_member(p app.prj_id)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.project_members pm
    WHERE pm.project_id = p
      AND pm.user_id = current_setting('app.user_id')::app.usr_id
  );
$$;

CREATE OR REPLACE FUNCTION app.is_owner(p app.prj_id)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.project_members pm
    WHERE pm.project_id = p
      AND pm.user_id = current_setting('app.user_id')::app.usr_id
      AND pm.role = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION app.is_member(app.prj_id) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_owner(app.prj_id)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_member(app.prj_id) TO app_authenticated;
GRANT EXECUTE ON FUNCTION app.is_owner(app.prj_id)  TO app_authenticated;

-- ---------- Policies ----------
-- auth.users (self only)
CREATE POLICY users_self_select ON auth.users FOR SELECT TO app_authenticated
  USING (id = current_setting('app.user_id')::app.usr_id);
CREATE POLICY users_self_update ON auth.users FOR UPDATE TO app_authenticated
  USING (id = current_setting('app.user_id')::app.usr_id)
  WITH CHECK (id = current_setting('app.user_id')::app.usr_id);

-- projects
CREATE POLICY projects_member_read   ON app.projects FOR SELECT TO app_authenticated
  USING (app.is_member(id));
CREATE POLICY projects_member_insert ON app.projects FOR INSERT TO app_authenticated
  WITH CHECK (owner_id = current_setting('app.user_id')::app.usr_id);
CREATE POLICY projects_member_update ON app.projects FOR UPDATE TO app_authenticated
  USING (app.is_member(id));
CREATE POLICY projects_owner_delete  ON app.projects FOR DELETE TO app_authenticated
  USING (app.is_owner(id));

-- project_members
CREATE POLICY project_members_member_read  ON app.project_members FOR SELECT TO app_authenticated
  USING (app.is_member(project_id));
CREATE POLICY project_members_owner_write  ON app.project_members FOR INSERT TO app_authenticated
  WITH CHECK (app.is_owner(project_id));
CREATE POLICY project_members_owner_update ON app.project_members FOR UPDATE TO app_authenticated
  USING (app.is_owner(project_id));
CREATE POLICY project_members_owner_delete ON app.project_members FOR DELETE TO app_authenticated
  USING (app.is_owner(project_id));

-- reports
CREATE POLICY reports_member_read   ON app.reports FOR SELECT TO app_authenticated
  USING (app.is_member(project_id));
CREATE POLICY reports_member_write  ON app.reports FOR INSERT TO app_authenticated
  WITH CHECK (app.is_member(project_id) AND author_id = current_setting('app.user_id')::app.usr_id);
CREATE POLICY reports_member_update ON app.reports FOR UPDATE TO app_authenticated
  USING (app.is_member(project_id));
CREATE POLICY reports_member_delete ON app.reports FOR DELETE TO app_authenticated
  USING (app.is_member(project_id));

-- notes (via report → project membership)
CREATE POLICY notes_member_read  ON app.notes FOR SELECT TO app_authenticated
  USING (EXISTS (SELECT 1 FROM app.reports r WHERE r.id = report_id AND app.is_member(r.project_id)));
CREATE POLICY notes_member_write ON app.notes FOR INSERT TO app_authenticated
  WITH CHECK (
    author_id = current_setting('app.user_id')::app.usr_id
    AND EXISTS (SELECT 1 FROM app.reports r WHERE r.id = report_id AND app.is_member(r.project_id))
  );
CREATE POLICY notes_author_update ON app.notes FOR UPDATE TO app_authenticated
  USING (author_id = current_setting('app.user_id')::app.usr_id);
CREATE POLICY notes_author_delete ON app.notes FOR DELETE TO app_authenticated
  USING (author_id = current_setting('app.user_id')::app.usr_id);

-- files (owner only)
CREATE POLICY files_owner_all ON app.files FOR ALL TO app_authenticated
  USING      (owner_id = current_setting('app.user_id')::app.usr_id)
  WITH CHECK (owner_id = current_setting('app.user_id')::app.usr_id);

-- user_settings (self only)
CREATE POLICY user_settings_self_all ON app.user_settings FOR ALL TO app_authenticated
  USING      (user_id = current_setting('app.user_id')::app.usr_id)
  WITH CHECK (user_id = current_setting('app.user_id')::app.usr_id);

-- waitlist_signups (anonymous insert; defense-in-depth)
CREATE POLICY waitlist_anon_insert ON app.waitlist_signups FOR INSERT TO app_anonymous
  WITH CHECK (true);

-- ---------- SECURITY DEFINER helpers ----------

-- create_project_with_owner — caller supplies p_id (app-minted slug).
CREATE OR REPLACE FUNCTION app.create_project_with_owner(
  p_id          app.prj_id,
  p_name        text,
  p_client_name text,
  p_address     text
) RETURNS app.prj_id
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE
  v_user app.usr_id := current_setting('app.user_id')::app.usr_id;
BEGIN
  INSERT INTO app.projects(id, name, client_name, address, owner_id)
  VALUES (p_id, p_name, p_client_name, p_address, v_user);

  INSERT INTO app.project_members(project_id, user_id, role)
  VALUES (p_id, v_user, 'owner');

  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION app.create_project_with_owner(app.prj_id, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.create_project_with_owner(app.prj_id, text, text, text) TO app_authenticated;

-- list_project_members — joins auth.users behind RLS.
CREATE OR REPLACE FUNCTION app.list_project_members(p_project_id app.prj_id)
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
  v_user app.usr_id := current_setting('app.user_id')::app.usr_id;
BEGIN
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
REVOKE ALL ON FUNCTION app.list_project_members(app.prj_id) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_project_members(app.prj_id) TO app_authenticated;

-- add_project_member_by_phone
CREATE OR REPLACE FUNCTION app.add_project_member_by_phone(
  p_project_id app.prj_id,
  p_phone      varchar(32),
  p_role       app.project_role
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
REVOKE ALL ON FUNCTION app.add_project_member_by_phone(app.prj_id, varchar, app.project_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.add_project_member_by_phone(app.prj_id, varchar, app.project_role) TO app_authenticated;

-- remove_project_member
CREATE OR REPLACE FUNCTION app.remove_project_member(p_project_id app.prj_id, p_user_id app.usr_id)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE
  v_caller app.usr_id := current_setting('app.user_id')::app.usr_id;
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
REVOKE ALL ON FUNCTION app.remove_project_member(app.prj_id, app.usr_id) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.remove_project_member(app.prj_id, app.usr_id) TO app_authenticated;

-- project_stats
CREATE OR REPLACE FUNCTION app.project_stats(p_project_id app.prj_id)
RETURNS TABLE (
  total_reports   bigint,
  drafts          bigint,
  last_report_at  timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE
  v_caller app.usr_id := current_setting('app.user_id')::app.usr_id;
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
REVOKE ALL ON FUNCTION app.project_stats(app.prj_id) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_stats(app.prj_id) TO app_authenticated;
