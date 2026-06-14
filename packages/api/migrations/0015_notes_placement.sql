-- 0015_notes_placement.sql
--
-- Photo-group placement (docs/v4/design-photo-placement.md).
--
-- Adds a nullable `placement` jsonb column to `app.notes` so the
-- mobile client can pin an image-note's photo group to a specific
-- issue or detailed section of the generated report.
--
-- Shape:
--   { "kind": "issue"   | "section",
--     "index": <non-negative int> }
--
-- Contract enforced by a CHECK constraint so future buggy writers
-- (or a misbehaving sql client) can't smuggle other shapes in.
-- Index stability across regeneration is handled in the mobile
-- client (self-healing on orphan, see design doc §Self-healing).
--
-- Expand-only:
--   - Nullable column; legacy notes stay NULL.
--   - No backfill.
--   - No drops, no renames, no rewrites of existing rows.
--   - CHECK uses `IS NULL OR …` so all existing NULL rows pass.

ALTER TABLE app.notes
  ADD COLUMN IF NOT EXISTS placement jsonb;

-- Validate shape. NOT VALID would skip the existing rows but every
-- existing row is NULL, so a fully-validated constraint is fine.
ALTER TABLE app.notes
  DROP CONSTRAINT IF EXISTS notes_placement_shape_chk;

ALTER TABLE app.notes
  ADD CONSTRAINT notes_placement_shape_chk CHECK (
    placement IS NULL
    OR (
      jsonb_typeof(placement) = 'object'
      AND placement ? 'kind'
      AND placement ? 'index'
      AND (placement ->> 'kind') IN ('issue', 'section')
      AND jsonb_typeof(placement -> 'index') = 'number'
      AND ((placement ->> 'index')::int) >= 0
    )
  );
