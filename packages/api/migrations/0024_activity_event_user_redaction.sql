-- 0024_activity_event_user_redaction.sql
--
-- Keep business events after account deletion without retaining a stable
-- identifier for the deleted person. A database trigger covers the supported
-- `/me` deletion helper and any future privileged deletion path.

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
    END
  WHERE actor_user_id = OLD.id
     OR (subject_type = 'user' AND subject_id = OLD.id::text);

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION app.redact_activity_user_on_delete() FROM PUBLIC;

DROP TRIGGER IF EXISTS activity_events_redact_user_before_delete
  ON public."user";

CREATE TRIGGER activity_events_redact_user_before_delete
BEFORE DELETE ON public."user"
FOR EACH ROW
EXECUTE FUNCTION app.redact_activity_user_on_delete();
