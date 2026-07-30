-- 0026_activity_note_events.sql
--
-- Expand the curated activity registry with successful timeline-note
-- creation. The event level remains derived by the API rather than stored.
-- This migration changes constraints only and does not rewrite existing rows.

ALTER TABLE app.activity_events
  DROP CONSTRAINT activity_events_type_check,
  DROP CONSTRAINT activity_events_subject_check;

ALTER TABLE app.activity_events
  ADD CONSTRAINT activity_events_type_check CHECK (
    (event_type = 'user.signed_up' AND subject_type = 'user')
    OR (event_type = 'project.created' AND subject_type = 'project')
    OR (event_type = 'report.created' AND subject_type = 'report')
    OR (event_type IN (
      'note.text_created',
      'note.voice_created',
      'note.image_created',
      'note.document_created'
    ) AND subject_type = 'note')
  ) NOT VALID,
  ADD CONSTRAINT activity_events_subject_check CHECK (
    (event_type = 'user.signed_up'
      AND (subject_id IS NULL OR subject_id ~ '^usr_[0-9a-hjkmnp-tv-z]{8,16}$'))
    OR (event_type = 'project.created'
      AND subject_id ~ '^prj_[0-9a-hjkmnp-tv-z]{8,16}$')
    OR (event_type = 'report.created'
      AND subject_id ~ '^rpt_[0-9a-hjkmnp-tv-z]{8,16}$')
    OR (event_type IN (
      'note.text_created',
      'note.voice_created',
      'note.image_created',
      'note.document_created'
    ) AND subject_id ~ '^not_[0-9a-hjkmnp-tv-z]{8,16}$')
  ) NOT VALID;

ALTER TABLE app.activity_events
  VALIDATE CONSTRAINT activity_events_type_check;

ALTER TABLE app.activity_events
  VALIDATE CONSTRAINT activity_events_subject_check;
