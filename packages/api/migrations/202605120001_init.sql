-- 202605120001_init.sql
-- Initial schema bootstrap. Hand-authored so RLS policies live in the same
-- migration as the tables they protect (per AGENTS.md / arch-database.md).

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS app;

-- ---------- Scoped role + grants ----------
DO $$ BEGIN
  CREATE ROLE app_authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT USAGE ON SCHEMA auth TO app_authenticated;
GRANT USAGE ON SCHEMA app TO app_authenticated;

-- ---------- ENUMs ----------
DO $$ BEGIN CREATE TYPE app.project_role AS ENUM ('owner','editor','viewer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE app.report_status AS ENUM ('draft','finalized'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE app.note_kind AS ENUM ('text','voice','image','document'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE app.file_kind AS ENUM ('voice','image','document','pdf'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- auth ----------
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(32) NOT NULL UNIQUE,
  display_name text,
  company_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(32) NOT NULL,
  twilio_verification_sid text,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON auth.users TO app_authenticated;

-- ---------- app: projects ----------
CREATE TABLE IF NOT EXISTS app.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_name text,
  address text,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.project_members (
  project_id uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role app.project_role NOT NULL DEFAULT 'editor',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS project_members_user_idx ON app.project_members(user_id);

-- ---------- app: reports ----------
CREATE TABLE IF NOT EXISTS app.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  status app.report_status NOT NULL DEFAULT 'draft',
  visit_date timestamptz,
  body jsonb,
  notes_since_last_generation integer NOT NULL DEFAULT 0,
  generated_at timestamptz,
  finalized_at timestamptz,
  pdf_file_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- app: notes ----------
CREATE TABLE IF NOT EXISTS app.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES app.reports(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  kind app.note_kind NOT NULL,
  body text,
  file_id uuid,
  transcript text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- app: files ----------
CREATE TABLE IF NOT EXISTS app.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  kind app.file_kind NOT NULL,
  file_key text NOT NULL UNIQUE,
  size_bytes bigint NOT NULL,
  content_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- app: user_settings ----------
CREATE TABLE IF NOT EXISTS app.user_settings (
  user_id uuid PRIMARY KEY,
  ai_vendor varchar(32) NOT NULL DEFAULT 'openai',
  ai_model varchar(64) NOT NULL DEFAULT 'gpt-4o-mini',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Grants ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA app TO app_authenticated;

-- ---------- RLS ----------
-- The user_id used by every policy comes from current_setting('app.user_id'),
-- which is set by withScopedConnection() in src/db/scope.ts.

ALTER TABLE app.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_settings ENABLE ROW LEVEL SECURITY;

-- Helper: are we a member of project p?
-- SECURITY DEFINER so the function bypasses RLS on app.project_members when
-- called from inside a policy on that same table (otherwise the policy on
-- project_members would call is_member which selects from project_members
-- → infinite recursion).
CREATE OR REPLACE FUNCTION app.is_member(p uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.project_members pm
    WHERE pm.project_id = p AND pm.user_id = current_setting('app.user_id')::uuid
  );
$$;

CREATE OR REPLACE FUNCTION app.is_owner(p uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.project_members pm
    WHERE pm.project_id = p
      AND pm.user_id = current_setting('app.user_id')::uuid
      AND pm.role = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION app.is_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_member(uuid) TO app_authenticated;
GRANT EXECUTE ON FUNCTION app.is_owner(uuid) TO app_authenticated;

-- projects
CREATE POLICY projects_member_read ON app.projects FOR SELECT TO app_authenticated
  USING (app.is_member(id));
CREATE POLICY projects_member_insert ON app.projects FOR INSERT TO app_authenticated
  WITH CHECK (owner_id = current_setting('app.user_id')::uuid);
CREATE POLICY projects_member_update ON app.projects FOR UPDATE TO app_authenticated
  USING (app.is_member(id));
CREATE POLICY projects_owner_delete ON app.projects FOR DELETE TO app_authenticated
  USING (app.is_owner(id));

-- project_members
CREATE POLICY project_members_member_read ON app.project_members FOR SELECT TO app_authenticated
  USING (app.is_member(project_id));
CREATE POLICY project_members_owner_write ON app.project_members FOR INSERT TO app_authenticated
  WITH CHECK (app.is_owner(project_id));
CREATE POLICY project_members_owner_update ON app.project_members FOR UPDATE TO app_authenticated
  USING (app.is_owner(project_id));
CREATE POLICY project_members_owner_delete ON app.project_members FOR DELETE TO app_authenticated
  USING (app.is_owner(project_id));

-- reports
CREATE POLICY reports_member_read ON app.reports FOR SELECT TO app_authenticated
  USING (app.is_member(project_id));
CREATE POLICY reports_member_write ON app.reports FOR INSERT TO app_authenticated
  WITH CHECK (app.is_member(project_id) AND author_id = current_setting('app.user_id')::uuid);
CREATE POLICY reports_member_update ON app.reports FOR UPDATE TO app_authenticated
  USING (app.is_member(project_id));
CREATE POLICY reports_member_delete ON app.reports FOR DELETE TO app_authenticated
  USING (app.is_member(project_id));

-- notes (via report → project membership)
CREATE POLICY notes_member_read ON app.notes FOR SELECT TO app_authenticated
  USING (EXISTS (SELECT 1 FROM app.reports r WHERE r.id = report_id AND app.is_member(r.project_id)));
CREATE POLICY notes_member_write ON app.notes FOR INSERT TO app_authenticated
  WITH CHECK (
    author_id = current_setting('app.user_id')::uuid
    AND EXISTS (SELECT 1 FROM app.reports r WHERE r.id = report_id AND app.is_member(r.project_id))
  );
CREATE POLICY notes_author_update ON app.notes FOR UPDATE TO app_authenticated
  USING (author_id = current_setting('app.user_id')::uuid);
CREATE POLICY notes_author_delete ON app.notes FOR DELETE TO app_authenticated
  USING (author_id = current_setting('app.user_id')::uuid);

-- files (owner only)
CREATE POLICY files_owner_all ON app.files FOR ALL TO app_authenticated
  USING (owner_id = current_setting('app.user_id')::uuid)
  WITH CHECK (owner_id = current_setting('app.user_id')::uuid);

-- user_settings (self only)
CREATE POLICY user_settings_self_all ON app.user_settings FOR ALL TO app_authenticated
  USING (user_id = current_setting('app.user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.user_id')::uuid);
