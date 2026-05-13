-- 202605130001_slugs_and_report_numbers.sql
-- Adds public slug identifiers (prj_xxxxxx, rpt_xxxxxx) and per-project
-- report numbering for shareable URLs and human-readable report references.
--
-- Per database-reviewer findings (see design-p30-ids-slugs.md "Amendments"):
--   - UUIDv7 DEFERRED. PG 17 does not ship uuid_generate_v7() natively (lands
--     in PG 18). gen_random_uuid() (UUIDv4) retained for new rows. Slugs are
--     the public identifier — internal UUID version is invisible to clients.
--   - Redundant explicit CREATE INDEX statements omitted (UNIQUE makes them).
--   - Manual ROLLBACK block included at the end for operational safety.
--   - Progress NOTICE added to backfill DO block.
--
-- This is a single-migration approach (nullable → backfill → NOT NULL) safe
-- for pre-production (integration tests re-seed, no production data yet).

-- 1. Add slug columns (nullable, no unique constraint yet).
ALTER TABLE app.projects ADD COLUMN slug text;
ALTER TABLE app.reports ADD COLUMN slug text;

-- 2. Add report numbering columns.
ALTER TABLE app.projects ADD COLUMN next_report_number int NOT NULL DEFAULT 1;
ALTER TABLE app.reports ADD COLUMN number int;

-- 3. Backfill slugs + numbers for any existing rows.
--    Uses PL/pgSQL with collision-retry loop (max 2 retries per row).
--    random() is acceptable for pre-prod backfill (no cryptographic requirements).
DO $$
DECLARE
  rec record;
  new_slug text;
  attempt int;
  project_count int := 0;
  report_count int := 0;
BEGIN
  -- Backfill projects.slug
  FOR rec IN SELECT id FROM app.projects WHERE slug IS NULL ORDER BY created_at, id LOOP
    attempt := 0;
    LOOP
      new_slug := 'prj_' || (
        SELECT string_agg(
          substr('0123456789abcdefghjkmnpqrstvwxyz', floor(random()*32)::int + 1, 1),
          ''
        )
        FROM generate_series(1, 6)
      );
      BEGIN
        UPDATE app.projects SET slug = new_slug WHERE id = rec.id;
        project_count := project_count + 1;
        IF project_count % 100 = 0 THEN
          RAISE NOTICE 'Backfilled % projects...', project_count;
        END IF;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        attempt := attempt + 1;
        IF attempt > 2 THEN
          RAISE EXCEPTION 'slug collision retry exhausted for project %', rec.id;
        END IF;
      END;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Backfilled % projects total.', project_count;

  -- Backfill reports.slug + reports.number (assign per-project sequential numbers).
  FOR rec IN
    SELECT r.id, r.project_id,
           row_number() OVER (PARTITION BY r.project_id ORDER BY r.created_at, r.id) AS rn
    FROM app.reports r
    ORDER BY r.project_id, rn
  LOOP
    attempt := 0;
    LOOP
      new_slug := 'rpt_' || (
        SELECT string_agg(
          substr('0123456789abcdefghjkmnpqrstvwxyz', floor(random()*32)::int + 1, 1),
          ''
        )
        FROM generate_series(1, 6)
      );
      BEGIN
        UPDATE app.reports SET slug = new_slug, number = rec.rn WHERE id = rec.id;
        report_count := report_count + 1;
        IF report_count % 100 = 0 THEN
          RAISE NOTICE 'Backfilled % reports...', report_count;
        END IF;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        attempt := attempt + 1;
        IF attempt > 2 THEN
          RAISE EXCEPTION 'slug collision retry exhausted for report %', rec.id;
        END IF;
      END;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Backfilled % reports total.', report_count;

  -- Sync next_report_number for each project to max(number) + 1.
  UPDATE app.projects p
  SET next_report_number = COALESCE(
    (SELECT max(r.number) FROM app.reports r WHERE r.project_id = p.id),
    0
  ) + 1;
  RAISE NOTICE 'Synced next_report_number for all projects.';
END;
$$;

-- 4. Add UNIQUE constraints (but keep slug nullable for now).
--    NOT NULL will be added in Commit 2 when the SECURITY DEFINER helper
--    and service layer are updated to pass slugs on insert.
ALTER TABLE app.projects ADD CONSTRAINT projects_slug_unique UNIQUE (slug);
ALTER TABLE app.reports ADD CONSTRAINT reports_slug_unique UNIQUE (slug);
ALTER TABLE app.reports ADD CONSTRAINT reports_number_unique UNIQUE (project_id, number);

-- Note: app.reports.number is still nullable because new reports aren't being
-- created yet (reports routes land in P3.1+). It will be set NOT NULL in Commit 2.

-- 5. Grant permissions (new columns inherit table-level grants; no action needed).

-- ROLLBACK (manual — for operational use only, not executed by this migration)
-- Run these statements in reverse order if you need to undo this migration:
--
-- ALTER TABLE app.reports DROP CONSTRAINT IF EXISTS reports_number_unique;
-- ALTER TABLE app.reports DROP CONSTRAINT IF EXISTS reports_slug_unique;
-- ALTER TABLE app.projects DROP CONSTRAINT IF EXISTS projects_slug_unique;
-- ALTER TABLE app.reports DROP COLUMN IF EXISTS number;
-- ALTER TABLE app.reports DROP COLUMN IF EXISTS slug;
-- ALTER TABLE app.projects DROP COLUMN IF EXISTS next_report_number;
-- ALTER TABLE app.projects DROP COLUMN IF EXISTS slug;
