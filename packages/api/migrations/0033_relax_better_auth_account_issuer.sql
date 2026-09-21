-- 0033_relax_better_auth_account_issuer.sql
--
-- Better Auth 1.7.3 restored account identity to (provider_id, account_id).
-- Releases 1.7.3+ no longer write issuer, so the 1.7.2 NOT NULL contract
-- would reject every newly linked account. Keep the column and credential
-- default for a bounded 1.7.2 rollback, but remove the obsolete identity index
-- and allow the current runtime to omit issuer.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE public."account" IN ACCESS EXCLUSIVE MODE;

DO $better_auth_account_issuer_relax_preflight$
DECLARE
  issuer_nullable text;
  issuer_default text;
  canonical_index_count bigint;
  incompatible_account_count bigint;
BEGIN
  SELECT is_nullable, column_default
    INTO issuer_nullable, issuer_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'account'
    AND column_name = 'issuer'
    AND data_type = 'text';

  IF issuer_nullable IS DISTINCT FROM 'NO'
    OR issuer_default IS DISTINCT FROM '''local:credential''::text' THEN
    RAISE EXCEPTION
      'unexpected Better Auth 1.7.2 issuer column contract';
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
    RAISE EXCEPTION
      'unexpected Better Auth 1.7.2 issuer identity index contract';
  END IF;

  SELECT count(*)
    INTO incompatible_account_count
  FROM public."account"
  WHERE provider_id IS DISTINCT FROM 'credential'
     OR issuer IS DISTINCT FROM 'local:credential'
     OR account_id IS DISTINCT FROM user_id;

  IF incompatible_account_count > 0 THEN
    RAISE EXCEPTION
      'cannot relax public.account issuer: % incompatible account rows exist',
      incompatible_account_count;
  END IF;
END
$better_auth_account_issuer_relax_preflight$;

DROP INDEX public."account_issuer_accountId_uidx";

ALTER TABLE public."account"
  ALTER COLUMN issuer DROP NOT NULL;

DO $better_auth_account_issuer_relax_verify$
DECLARE
  issuer_nullable text;
  issuer_default text;
BEGIN
  SELECT is_nullable, column_default
    INTO issuer_nullable, issuer_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'account'
    AND column_name = 'issuer';

  IF issuer_nullable IS DISTINCT FROM 'YES'
    OR issuer_default IS DISTINCT FROM '''local:credential''::text' THEN
    RAISE EXCEPTION
      'public.account.issuer rollback-compatible contract was not installed';
  END IF;

  IF to_regclass('public."account_issuer_accountId_uidx"') IS NOT NULL THEN
    RAISE EXCEPTION
      'obsolete public.account issuer identity index still exists';
  END IF;
END
$better_auth_account_issuer_relax_verify$;
