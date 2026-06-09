-- 0016_notes_placement_to_report_attachments.sql
--
-- Move v1 image note placement into report.body target attachments.
-- Invalid stale indices are intentionally skipped; v2 only preserves
-- placements that still point at an existing issue/summary section.

DO $$
DECLARE
  rec record;
  target_key text;
  target_index int;
  current_body jsonb;
  target jsonb;
  attachments jsonb;
  images jsonb;
BEGIN
  FOR rec IN
    SELECT n.id, n.report_id, n.placement
    FROM app.notes n
    JOIN app.reports r ON r.id = n.report_id
    WHERE n.kind = 'image'
      AND n.placement IS NOT NULL
      AND r.body IS NOT NULL
    ORDER BY n.created_at ASC, n.id ASC
  LOOP
    target_key := CASE rec.placement ->> 'kind'
      WHEN 'issue' THEN 'issues'
      WHEN 'section' THEN 'summarySections'
      ELSE NULL
    END;
    IF target_key IS NULL THEN
      CONTINUE;
    END IF;

    target_index := (rec.placement ->> 'index')::int;

    SELECT body INTO current_body
    FROM app.reports
    WHERE id = rec.report_id;

    IF current_body IS NULL
       OR jsonb_typeof(current_body -> target_key) <> 'array'
       OR jsonb_array_length(current_body -> target_key) <= target_index THEN
      CONTINUE;
    END IF;

    target := current_body #> ARRAY[target_key, target_index::text];
    attachments := COALESCE(target -> 'attachments', '{}'::jsonb);
    images := COALESCE(attachments -> 'images', '[]'::jsonb);

    IF images ? rec.id THEN
      CONTINUE;
    END IF;

    current_body := jsonb_set(
      jsonb_set(
        current_body,
        ARRAY[target_key, target_index::text, 'attachments'],
        attachments,
        true
      ),
      ARRAY[target_key, target_index::text, 'attachments', 'images'],
      images || to_jsonb(ARRAY[rec.id]::text[]),
      true
    );

    UPDATE app.reports
    SET body = current_body
    WHERE id = rec.report_id;
  END LOOP;
END $$;
