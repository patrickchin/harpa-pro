-- 202605170001_slug_8chars.sql
-- Bump app.random_slug from 6 to 8 characters to match lib/slug.ts.
-- Rollback: change generate_series(1, 8) back to generate_series(1, 6).

CREATE OR REPLACE FUNCTION app.random_slug(prefix text) RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT prefix || '_' || string_agg(
    substr('0123456789abcdefghjkmnpqrstvwxyz', floor(random()*32)::int + 1, 1),
    ''
  )
  FROM generate_series(1, 8)
$$;
