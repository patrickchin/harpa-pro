-- 202605130002_waitlist.sql
-- M1 — Waitlist (double opt-in).
-- See docs/marketing/plan-m1-waitlist.md §M1.1.
--
-- `app_anonymous` is a new scoped role used by the public marketing
-- waitlist signup endpoint. The route handler (routes/waitlist.ts) uses
-- `rawDb()` for its actual writes (matching the auth/* pattern, since
-- the caller has no JWT) — the scoped role + scope test exists as
-- defence-in-depth: it proves that IF the connection were to be
-- pinned to `app_anonymous`, only INSERT is permitted. Any future
-- regression that accidentally exposes the table to anonymous SELECT
-- or UPDATE/DELETE will be caught by waitlist.scope.test.ts.

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------- Scoped role ----------
DO $$ BEGIN
  CREATE ROLE app_anonymous NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT USAGE ON SCHEMA app TO app_anonymous;

-- ---------- Table ----------
CREATE TABLE IF NOT EXISTS app.waitlist_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  company text,
  role text,
  source text,
  ip_hash text,
  confirmed_at timestamptz,
  confirm_token_hash text,
  confirm_token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waitlist_signups_confirm_token_hash_idx
  ON app.waitlist_signups (confirm_token_hash)
  WHERE confirm_token_hash IS NOT NULL;

-- ---------- Grants ----------
GRANT INSERT ON app.waitlist_signups TO app_anonymous;
-- Explicitly no SELECT / UPDATE / DELETE for app_anonymous.

-- ---------- RLS ----------
ALTER TABLE app.waitlist_signups ENABLE ROW LEVEL SECURITY;

-- Permissive insert policy for anonymous role; column grants already
-- restrict to INSERT, but RLS-on requires an explicit policy for inserts
-- to succeed.
CREATE POLICY waitlist_anon_insert ON app.waitlist_signups
  FOR INSERT TO app_anonymous
  WITH CHECK (true);
