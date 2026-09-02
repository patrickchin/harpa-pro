-- 0032_better_auth_account_issuer.sql
--
-- Expand public.account to the Better Auth 1.7 identity shape while every
-- runtime remains on 1.6.28. The default keeps 1.6 credential writers
-- compatible through the later runtime rollout and its rollback window.
--
-- Unknown providers and identities that would collide after canonicalization
-- fail before DDL. The migration runner owns the surrounding transaction, so
-- every guard, data rewrite, schema change, and ledger write is atomic.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE public."account" IN ACCESS EXCLUSIVE MODE;

DO $better_auth_account_issuer_preflight$
DECLARE
  actual_columns text[];
  actual_constraints text[];
  actual_indexes text[];
  unexpected_provider_count bigint;
  projected_collision_count bigint;
BEGIN
  SELECT array_agg(column_name::text ORDER BY ordinal_position)
    INTO actual_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'account';

  IF actual_columns IS DISTINCT FROM ARRAY[
    'id',
    'account_id',
    'provider_id',
    'user_id',
    'access_token',
    'refresh_token',
    'id_token',
    'access_token_expires_at',
    'refresh_token_expires_at',
    'scope',
    'password',
    'created_at',
    'updated_at'
  ]::text[] THEN
    RAISE EXCEPTION
      'unexpected pre-1.7 public.account column layout (% columns)',
      coalesce(array_length(actual_columns, 1), 0);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'account'
      AND column_name IN ('id', 'account_id', 'provider_id', 'user_id')
      AND (data_type IS DISTINCT FROM 'text' OR is_nullable IS DISTINCT FROM 'NO')
  ) THEN
    RAISE EXCEPTION 'unexpected pre-1.7 public.account identity column types';
  END IF;

  SELECT array_agg(conname::text ORDER BY conname)
    INTO actual_constraints
  FROM pg_constraint
  WHERE conrelid = 'public."account"'::regclass;

  IF actual_constraints IS DISTINCT FROM ARRAY[
    'account_pkey',
    'account_user_id_fkey'
  ]::text[] THEN
    RAISE EXCEPTION
      'unexpected pre-1.7 public.account constraint layout (% constraints)',
      coalesce(array_length(actual_constraints, 1), 0);
  END IF;

  SELECT array_agg(indexname::text ORDER BY indexname)
    INTO actual_indexes
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'account';

  IF actual_indexes IS DISTINCT FROM ARRAY[
    'account_pkey',
    'account_user_id_idx'
  ]::text[] THEN
    RAISE EXCEPTION
      'unexpected pre-1.7 public.account index layout (% indexes)',
      coalesce(array_length(actual_indexes, 1), 0);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_index
    WHERE indrelid = 'public."account"'::regclass
      AND NOT indisvalid
  ) THEN
    RAISE EXCEPTION 'unexpected invalid pre-1.7 public.account index';
  END IF;

  SELECT count(*)
    INTO unexpected_provider_count
  FROM public."account"
  WHERE provider_id IS DISTINCT FROM 'credential';

  IF unexpected_provider_count > 0 THEN
    RAISE EXCEPTION
      'cannot migrate public.account: % non-credential provider rows exist',
      unexpected_provider_count;
  END IF;

  SELECT count(*)
    INTO projected_collision_count
  FROM (
    SELECT user_id
    FROM public."account"
    WHERE provider_id = 'credential'
    GROUP BY user_id
    HAVING count(*) > 1
  ) AS collisions;

  IF projected_collision_count > 0 THEN
    RAISE EXCEPTION
      'cannot migrate public.account: % projected credential identity collisions exist',
      projected_collision_count;
  END IF;
END
$better_auth_account_issuer_preflight$;

ALTER TABLE public."account"
  ADD COLUMN issuer text DEFAULT 'local:credential';

UPDATE public."account"
SET issuer = 'local:credential',
    account_id = user_id
WHERE provider_id = 'credential';

DO $better_auth_account_issuer_post_backfill$
DECLARE
  invalid_identity_count bigint;
  duplicate_identity_count bigint;
BEGIN
  SELECT count(*)
    INTO invalid_identity_count
  FROM public."account"
  WHERE issuer IS NULL
     OR issuer = ''
     OR account_id IS NULL
     OR account_id = ''
     OR provider_id IS DISTINCT FROM 'credential'
     OR issuer IS DISTINCT FROM 'local:credential'
     OR account_id IS DISTINCT FROM user_id;

  IF invalid_identity_count > 0 THEN
    RAISE EXCEPTION
      'cannot migrate public.account: % invalid canonical identities remain',
      invalid_identity_count;
  END IF;

  SELECT count(*)
    INTO duplicate_identity_count
  FROM (
    SELECT issuer, account_id
    FROM public."account"
    GROUP BY issuer, account_id
    HAVING count(*) > 1
  ) AS duplicates;

  IF duplicate_identity_count > 0 THEN
    RAISE EXCEPTION
      'cannot migrate public.account: % duplicate canonical identities remain',
      duplicate_identity_count;
  END IF;
END
$better_auth_account_issuer_post_backfill$;

ALTER TABLE public."account"
  ALTER COLUMN issuer SET NOT NULL;

CREATE UNIQUE INDEX "account_issuer_accountId_uidx"
  ON public."account" (issuer, account_id);

DO $better_auth_account_issuer_verify$
DECLARE
  issuer_nullable text;
  issuer_default text;
  canonical_index_count bigint;
BEGIN
  SELECT is_nullable, column_default
    INTO issuer_nullable, issuer_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'account'
    AND column_name = 'issuer';

  IF issuer_nullable IS DISTINCT FROM 'NO'
    OR issuer_default IS DISTINCT FROM '''local:credential''::text' THEN
    RAISE EXCEPTION 'public.account.issuer compatibility contract was not installed';
  END IF;

  SELECT count(*)
    INTO canonical_index_count
  FROM pg_indexes
  JOIN pg_class index_class
    ON index_class.relname = pg_indexes.indexname
  JOIN pg_namespace index_namespace
    ON index_namespace.oid = index_class.relnamespace
   AND index_namespace.nspname = pg_indexes.schemaname
  JOIN pg_index
    ON pg_index.indexrelid = index_class.oid
  WHERE pg_indexes.schemaname = 'public'
    AND pg_indexes.tablename = 'account'
    AND pg_indexes.indexname = 'account_issuer_accountId_uidx'
    AND pg_index.indisunique
    AND pg_index.indisvalid
    AND regexp_replace(pg_indexes.indexdef, '\s+', ' ', 'g') =
      'CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON public.account USING btree (issuer, account_id)';

  IF canonical_index_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'public.account issuer identity index was not installed exactly';
  END IF;
END
$better_auth_account_issuer_verify$;
