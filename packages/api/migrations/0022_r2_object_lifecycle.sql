-- 0022_r2_object_lifecycle.sql
--
-- Persist presigned-upload intent and account-deletion cleanup work.
-- Account deletion plans storage cleanup and removes relational data in one
-- transaction, so a process crash after commit cannot lose the R2 work.

BEGIN;

CREATE TABLE app.file_upload_leases (
  file_id             app.fil_id PRIMARY KEY,
  owner_id            app.usr_id NOT NULL
                      REFERENCES public."user"(id) ON DELETE CASCADE,
  file_key            text NOT NULL UNIQUE,
  scope               text NOT NULL
                      CHECK (scope IN ('project', 'avatar', 'scratch')),
  project_id          app.prj_id
                      REFERENCES app.projects(id) ON DELETE SET NULL,
  report_id           app.rpt_id
                      REFERENCES app.reports(id) ON DELETE SET NULL,
  content_type        text NOT NULL,
  size_bytes          bigint NOT NULL CHECK (size_bytes >= 0),
  presign_expires_at  timestamptz NOT NULL,
  consumed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX file_upload_leases_owner_idx
  ON app.file_upload_leases(owner_id);

CREATE INDEX file_upload_leases_expiry_idx
  ON app.file_upload_leases(presign_expires_at);

GRANT SELECT, INSERT
  ON app.file_upload_leases
  TO app_authenticated;

GRANT UPDATE (consumed_at)
  ON app.file_upload_leases
  TO app_authenticated;

ALTER TABLE app.file_upload_leases ENABLE ROW LEVEL SECURITY;

CREATE POLICY file_upload_leases_owner_all
  ON app.file_upload_leases
  FOR ALL
  TO app_authenticated
  USING (
    owner_id = current_setting('app.user_id')::app.usr_id
  )
  WITH CHECK (
    owner_id = current_setting('app.user_id')::app.usr_id
  );

CREATE TABLE app.storage_delete_jobs (
  user_id        app.usr_id NOT NULL,
  job_kind       text NOT NULL
                 CHECK (
                   job_kind IN (
                     'account_delete_initial',
                     'account_delete_final'
                   )
                 ),
  run_after      timestamptz NOT NULL,
  payload        jsonb NOT NULL,
  attempt_count  integer NOT NULL DEFAULT 0
                 CHECK (attempt_count >= 0),
  locked_at      timestamptz,
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_kind)
);

CREATE INDEX storage_delete_jobs_due_idx
  ON app.storage_delete_jobs(run_after, locked_at);

-- The scoped application role must never claim or rewrite cleanup work.
-- The raw backend connection used by the drainer remains the table owner and
-- therefore bypasses RLS.
REVOKE ALL PRIVILEGES
  ON app.storage_delete_jobs
  FROM PUBLIC, app_authenticated;

ALTER TABLE app.storage_delete_jobs ENABLE ROW LEVEL SECURITY;

-- Rolling-deploy compatibility gate. The migration starts closed because old
-- app machines can still mint lease-less presigns. After the new app version
-- is fully deployed, CI arms enforce_after for one presign TTL + 30 seconds.
-- Until then account deletion is blocked and new registration keeps the
-- legacy fallback, so no untracked live capability can escape cleanup.
CREATE TABLE app.storage_lifecycle_rollout (
  singleton              boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enforce_after          timestamptz,
  account_delete_enabled boolean NOT NULL DEFAULT false,
  armed_at               timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app.storage_lifecycle_rollout(singleton)
VALUES (true);

REVOKE ALL PRIVILEGES
  ON app.storage_lifecycle_rollout
  FROM PUBLIC, app_authenticated;

ALTER TABLE app.storage_lifecycle_rollout ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.file_upload_leases_enforced()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT rollout.enforce_after <= now()
      FROM app.storage_lifecycle_rollout rollout
      WHERE rollout.singleton
    ),
    false
  )
$$;

REVOKE ALL ON FUNCTION app.file_upload_leases_enforced() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.file_upload_leases_enforced()
  TO app_authenticated;

CREATE OR REPLACE FUNCTION app.delete_current_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_temp
AS $$
DECLARE
  v_user               app.usr_id := current_setting('app.user_id')::app.usr_id;
  v_email              text;
  v_project_ids        app.prj_id[] := ARRAY[]::app.prj_id[];
  v_solo_project_ids   app.prj_id[] := ARRAY[]::app.prj_id[];
  v_initial_keys       text[] := ARRAY[]::text[];
  v_final_keys         text[] := ARRAY[]::text[];
  v_sweep_prefixes     text[] := ARRAY[]::text[];
  v_planned_at         timestamptz;
  v_final_run_after    timestamptz;
BEGIN
  -- This row is the serialization point for app.files and upload-lease
  -- inserts, whose owner FKs take a conflicting key-share lock.
  SELECT u.email
  INTO v_email
  FROM public."user" u
  WHERE u.id = v_user
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT app.file_upload_leases_enforced()
     OR NOT COALESCE(
       (
         SELECT rollout.account_delete_enabled
         FROM app.storage_lifecycle_rollout rollout
         WHERE rollout.singleton
       ),
       false
     ) THEN
    RAISE EXCEPTION 'file_upload_lease_rollout_pending'
      USING ERRCODE = '55000';
  END IF;

  -- Lock projects before membership rows so concurrent account deletions in a
  -- shared project acquire locks in the same order. Project locks also block
  -- new memberships at their FK check until the solo/shared decision commits.
  SELECT ARRAY(
    SELECT p.id
    FROM app.projects p
    JOIN app.project_members caller_membership
      ON caller_membership.project_id = p.id
     AND caller_membership.user_id = v_user
    ORDER BY p.id
    FOR UPDATE OF p
  )
  INTO v_project_ids;

  PERFORM pm.project_id
  FROM app.project_members pm
  WHERE pm.project_id = ANY(v_project_ids)
  ORDER BY pm.project_id, pm.user_id
  FOR UPDATE;

  -- Existing owned file and lease rows cannot change underneath the payload
  -- snapshot. New rows are serialized through the locked public.user FK.
  PERFORM f.id
  FROM app.files f
  WHERE f.owner_id = v_user
  ORDER BY f.id
  FOR UPDATE;

  PERFORM l.file_id
  FROM app.file_upload_leases l
  WHERE l.owner_id = v_user
  ORDER BY l.file_id
  FOR UPDATE;

  v_planned_at := clock_timestamp();

  SELECT COALESCE(
           array_agg(member_project.project_id ORDER BY member_project.project_id),
           ARRAY[]::app.prj_id[]
         )
  INTO v_solo_project_ids
  FROM (
    SELECT deleting_membership.project_id
    FROM app.project_members deleting_membership
    WHERE deleting_membership.user_id = v_user
      AND deleting_membership.project_id = ANY(v_project_ids)
      AND NOT EXISTS (
        SELECT 1
        FROM app.project_members surviving_membership
        WHERE surviving_membership.project_id =
              deleting_membership.project_id
          AND surviving_membership.user_id <> v_user
      )
  ) member_project;

  SELECT COALESCE(
           array_agg(storage_key.file_key ORDER BY storage_key.file_key),
           ARRAY[]::text[]
         )
  INTO v_initial_keys
  FROM (
    SELECT f.file_key
    FROM app.files f
    WHERE f.owner_id = v_user

    UNION

    SELECT l.file_key
    FROM app.file_upload_leases l
    WHERE l.owner_id = v_user
  ) storage_key;

  -- A consumed presign can still be replayed until expiry, and an in-flight
  -- PUT can finish just after it. Keep keys through the 30-second safety
  -- window in the delayed pass, not only unconsumed leases.
  SELECT COALESCE(
           array_agg(l.file_key ORDER BY l.file_key),
           ARRAY[]::text[]
         ),
         max(l.presign_expires_at) + interval '30 seconds'
  INTO v_final_keys, v_final_run_after
  FROM app.file_upload_leases l
  WHERE l.owner_id = v_user
    AND l.presign_expires_at + interval '30 seconds' > v_planned_at;

  SELECT ARRAY[
           format('users/%s/avatar/', v_user),
           format('users/%s/scratch/', v_user)
         ] || COALESCE(
           array_agg(
             format('projects/%s/', solo_project_id)
             ORDER BY solo_project_id
           ),
           ARRAY[]::text[]
         )
  INTO v_sweep_prefixes
  FROM unnest(v_solo_project_ids) AS solo_project_id;

  INSERT INTO app.storage_delete_jobs (
    user_id,
    job_kind,
    run_after,
    payload,
    created_at,
    updated_at
  )
  VALUES (
    v_user,
    'account_delete_initial',
    v_planned_at,
    jsonb_build_object(
      'userId', v_user::text,
      'exactKeys', to_jsonb(v_initial_keys),
      'sweepPrefixes', to_jsonb(v_sweep_prefixes)
    ),
    v_planned_at,
    v_planned_at
  );

  IF cardinality(v_final_keys) > 0 THEN
    INSERT INTO app.storage_delete_jobs (
      user_id,
      job_kind,
      run_after,
      payload,
      created_at,
      updated_at
    )
    VALUES (
      v_user,
      'account_delete_final',
      v_final_run_after,
      jsonb_build_object(
        'userId', v_user::text,
        'exactKeys', to_jsonb(v_final_keys),
        'sweepPrefixes', jsonb_build_array()
      ),
      v_planned_at,
      v_planned_at
    );
  END IF;

  -- Solo projects disappear with the account. Cascades remove reports,
  -- notes, memberships, and project-scoped file rows.
  DELETE FROM app.projects p
  WHERE p.id = ANY(v_solo_project_ids);

  -- Any remaining project that points at the deleting account must pick a
  -- surviving owner. Prefer an existing owner, otherwise the oldest member.
  WITH owner_candidates AS (
    SELECT DISTINCT ON (pm.project_id)
      pm.project_id,
      pm.user_id
    FROM app.project_members pm
    JOIN app.projects p ON p.id = pm.project_id
    WHERE p.owner_id = v_user
      AND pm.user_id <> v_user
    ORDER BY
      pm.project_id,
      (pm.role = 'owner') DESC,
      pm.joined_at ASC,
      pm.user_id ASC
  ),
  updated_projects AS (
    UPDATE app.projects p
    SET owner_id = candidate.user_id,
        updated_at = now()
    FROM owner_candidates candidate
    WHERE p.id = candidate.project_id
    RETURNING p.id, p.owner_id
  )
  UPDATE app.project_members pm
  SET role = 'owner'
  FROM updated_projects p
  WHERE pm.project_id = p.id
    AND pm.user_id = p.owner_id
    AND pm.role <> 'owner';

  DELETE FROM app.project_members
  WHERE user_id = v_user;

  DELETE FROM app.llm_usage_events
  WHERE user_id = v_user;

  DELETE FROM public."verification"
  WHERE identifier IN (
    v_email,
    'sign-in-otp-' || v_email,
    'email-otp-' || v_email
  );

  DELETE FROM public."user"
  WHERE id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION app.delete_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.delete_current_user() TO app_authenticated;

COMMIT;
