-- 0023_activity_event_dedupe_redaction.sql
--
-- Complete account-deletion redaction by removing the deleted user ID from
-- signup dedupe keys. The event's random aud_* ID remains a unique,
-- non-user-derived replacement.

UPDATE app.activity_events
SET dedupe_key = 'redacted:' || id::text
WHERE event_type = 'user.signed_up'
  AND actor_user_id IS NULL
  AND subject_id IS NULL
  AND dedupe_key ~ '^user\.signed_up:usr_[0-9a-hjkmnp-tv-z]{8,16}$';

CREATE OR REPLACE FUNCTION app.redact_activity_user_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_temp
AS $$
BEGIN
  UPDATE app.activity_events
  SET
    actor_user_id = CASE
      WHEN actor_user_id = OLD.id THEN NULL
      ELSE actor_user_id
    END,
    subject_id = CASE
      WHEN subject_type = 'user' AND subject_id = OLD.id::text THEN NULL
      ELSE subject_id
    END,
    dedupe_key = CASE
      WHEN event_type = 'user.signed_up' AND subject_id = OLD.id::text
        THEN 'redacted:' || id::text
      ELSE dedupe_key
    END
  WHERE actor_user_id = OLD.id
     OR (subject_type = 'user' AND subject_id = OLD.id::text);

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION app.redact_activity_user_on_delete() FROM PUBLIC;
