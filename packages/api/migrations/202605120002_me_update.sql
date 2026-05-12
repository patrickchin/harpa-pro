-- 202605120002_me_update.sql
-- Allow the per-request scope to update the caller's own auth.users row
-- (PATCH /me display_name + company_name). RLS enforces self-only.

GRANT UPDATE (display_name, company_name, updated_at) ON auth.users TO app_authenticated;

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_self_select ON auth.users;
CREATE POLICY users_self_select ON auth.users FOR SELECT TO app_authenticated
  USING (id = current_setting('app.user_id')::uuid);

DROP POLICY IF EXISTS users_self_update ON auth.users;
CREATE POLICY users_self_update ON auth.users FOR UPDATE TO app_authenticated
  USING (id = current_setting('app.user_id')::uuid)
  WITH CHECK (id = current_setting('app.user_id')::uuid);
