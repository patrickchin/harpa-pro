#!/usr/bin/env bash
# Wipe the local fixture-mode Postgres so a Maestro flow that starts on
# sign-up gets a fresh account. Safe to run repeatedly. Does NOT drop
# tables — just truncates the rows. Seeds:
#  - Test Two (test2@harpapro.com) so legacy invite-path smoke coverage
#    has a real target user to add.
#  - Test Account (test@harpapro.com, used by p3-report-wiring.yaml) with a
#    seeded project + draft report + one text note. iOS XCTest cannot
#    reliably deliver `inputText` to React Native's multiline TextInput
#    (the note input bar), so the wiring flow signs IN to this seeded
#    state and exercises generate → finalize → delete without typing
#    a note. Note-create wiring itself is covered by unit tests.
#
# The API container must have TEST_ACCOUNT_EMAILS and TEST_ACCOUNT_PASSWORD
# configured; after the SQL reset we run the API seed script so these
# deterministic users receive better-auth credential accounts.
set -euo pipefail

docker exec -i harpa-pro-pg psql -U postgres -d harpa -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE app.notes, app.files, app.reports, app.project_members,
         app.projects, app.user_settings, app.waitlist_signups,
         public."session", public."account", public."verification", public."user"
  RESTART IDENTITY CASCADE;

INSERT INTO public."user" (id, name, email, email_verified, display_name, company_name, created_at, updated_at)
VALUES ('usr_bbbbbbbbbbbb', 'Test Two', 'test2@harpapro.com', true, 'Test Two', 'QA Industries', now(), now());

-- Test Account — the p3-report-wiring.yaml signed-in user
INSERT INTO public."user" (id, name, email, email_verified, display_name, company_name, created_at, updated_at)
VALUES ('usr_aaaaaaaaaaaa', 'Test Account', 'test@harpapro.com', true, 'Test Account', 'Wiring Co', now(), now());

INSERT INTO app.projects (id, name, client_name, address, owner_id, next_report_number)
VALUES ('prj_aaaaaaaaaaaa', 'Wiring Smoke Project', 'Wiring Client', '1 Wiring Way',
        'usr_aaaaaaaaaaaa', 2);

INSERT INTO app.project_members (project_id, user_id, role)
VALUES ('prj_aaaaaaaaaaaa', 'usr_aaaaaaaaaaaa', 'owner');

INSERT INTO app.reports (id, project_id, author_id, number, status, visit_date,
                         body, notes_since_last_generation)
VALUES ('rpt_aaaaaaaaaaaa', 'prj_aaaaaaaaaaaa', 'usr_aaaaaaaaaaaa', 1, 'draft',
        now(), NULL, 1);

INSERT INTO app.notes (id, report_id, author_id, kind, body)
VALUES ('not_aaaaaaaaaaaa', 'rpt_aaaaaaaaaaaa', 'usr_aaaaaaaaaaaa', 'text',
        'Foundations poured, drainage installed, crew of three on site.');
SQL
docker compose exec -T api pnpm --filter @harpa/api db:seed-test-account
echo "DB reset (seeded test2@harpapro.com, test@harpapro.com + credential accounts + draft report)."
