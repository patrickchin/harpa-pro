-- 202605130004_projects_helpers_v2_slugs_not_null.sql
-- P3.0 Commit 2: tighten slug/number constraints + update SECURITY DEFINER
-- helper to accept a slug parameter so the service layer can pre-generate
-- slugs and retry on collision (see services/projects.ts).
--
-- Companion: docs/v4/design-p30-ids-slugs.md, P3.0 Commit 2.
--
-- Sequence:
--   1. Drop old create_project_with_owner(text, text, text). The new
--      4-arg signature replaces it; routes are updated in the same
--      commit so no other callers exist after this migration runs.
--   2. Create new create_project_with_owner(text, text, text, text) that
--      writes the caller-supplied slug.
--   3. Flip slug/number NOT NULL on projects.slug, reports.slug,
--      reports.number. Backfill landed in 202605130001; no rows should
--      still be NULL by the time this runs.

-- 1. Drop the 3-arg overload. Nothing else depends on it once routes
--    switch to slug-aware createProject.
DROP FUNCTION IF EXISTS app.create_project_with_owner(text, text, text);

-- 2. New helper that accepts the caller-generated slug. The service
--    layer owns slug generation + retry-on-collision; the helper just
--    inserts. If two callers race and pick the same slug, the UNIQUE
--    constraint surfaces a 23505 unique_violation which the service
--    catches and retries with a fresh slug.
CREATE OR REPLACE FUNCTION app.create_project_with_owner(
  p_name text,
  p_client_name text,
  p_address text,
  p_slug text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE
  v_user uuid := current_setting('app.user_id')::uuid;
  v_id uuid;
BEGIN
  INSERT INTO app.projects(name, client_name, address, owner_id, slug)
  VALUES (p_name, p_client_name, p_address, v_user, p_slug)
  RETURNING id INTO v_id;

  INSERT INTO app.project_members(project_id, user_id, role)
  VALUES (v_id, v_user, 'owner');

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION app.create_project_with_owner(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.create_project_with_owner(text, text, text, text) TO app_authenticated;

-- 3. Flip NOT NULL. Backfill happened in 202605130001; no rows should
--    be NULL by now. If the constraint fails the migration aborts —
--    that signals data drift and needs manual investigation.
--
--    Belt-and-braces: also add SQL DEFAULTs for slug columns and an
--    auto-number trigger for reports so direct INSERTs (test seeds,
--    ad-hoc admin SQL) don't trip the constraint. The service layer
--    still pre-generates slugs and report numbers in JS so the
--    retry-on-collision pattern owns observability and metrics —
--    explicit values from the service bypass these defaults entirely.

-- Random Crockford-base32 slug generator (matches lib/slug.ts).
-- VOLATILE so PostgreSQL recomputes per row.
CREATE OR REPLACE FUNCTION app.random_slug(prefix text) RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT prefix || '_' || string_agg(
    substr('0123456789abcdefghjkmnpqrstvwxyz', floor(random()*32)::int + 1, 1),
    ''
  )
  FROM generate_series(1, 6)
$$;

ALTER TABLE app.projects ALTER COLUMN slug SET DEFAULT app.random_slug('prj');
ALTER TABLE app.reports  ALTER COLUMN slug SET DEFAULT app.random_slug('rpt');

-- Auto-assign reports.number from the parent project's counter when
-- the caller does not provide one. Service layer createReport uses
-- a CTE that bumps next_report_number AND supplies number atomically,
-- so this trigger is a no-op there.
CREATE OR REPLACE FUNCTION app.reports_autonumber() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  IF NEW.number IS NULL THEN
    UPDATE app.projects
       SET next_report_number = next_report_number + 1,
           updated_at = now()
     WHERE id = NEW.project_id
    RETURNING next_report_number - 1 INTO v_n;
    NEW.number := v_n;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reports_autonumber_trigger ON app.reports;
CREATE TRIGGER reports_autonumber_trigger
BEFORE INSERT ON app.reports
FOR EACH ROW EXECUTE FUNCTION app.reports_autonumber();

ALTER TABLE app.projects ALTER COLUMN slug SET NOT NULL;
ALTER TABLE app.reports  ALTER COLUMN slug SET NOT NULL;
ALTER TABLE app.reports  ALTER COLUMN number SET NOT NULL;

-- ROLLBACK (manual — for operational use only, not executed by this migration)
-- ALTER TABLE app.reports  ALTER COLUMN number DROP NOT NULL;
-- ALTER TABLE app.reports  ALTER COLUMN slug DROP NOT NULL;
-- ALTER TABLE app.projects ALTER COLUMN slug DROP NOT NULL;
-- DROP TRIGGER IF EXISTS reports_autonumber_trigger ON app.reports;
-- DROP FUNCTION IF EXISTS app.reports_autonumber();
-- ALTER TABLE app.reports  ALTER COLUMN slug DROP DEFAULT;
-- ALTER TABLE app.projects ALTER COLUMN slug DROP DEFAULT;
-- DROP FUNCTION IF EXISTS app.random_slug(text);
-- DROP FUNCTION IF EXISTS app.create_project_with_owner(text, text, text, text);
-- -- re-create previous 3-arg helper from 202605120003 if needed.
