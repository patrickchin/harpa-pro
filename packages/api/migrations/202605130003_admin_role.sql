-- 202605130003_admin_role.sql
-- M1.6: Add an `is_admin` flag to auth.users so we can gate
-- `GET /admin/waitlist.csv` (and any future admin endpoint).
--
-- The flag is read by the admin middleware in
-- packages/api/src/middleware/admin.ts on top of the standard
-- bearer-JWT validation. Admin endpoints use `rawDb()` (full
-- privileges) since they're allowed to read every row by
-- definition; the middleware is what limits the surface area.

ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Allow the scoped role to see its own admin flag (so middleware
-- can re-check via the scoped connection if it ever wants to).
GRANT SELECT (is_admin) ON auth.users TO app_authenticated;
