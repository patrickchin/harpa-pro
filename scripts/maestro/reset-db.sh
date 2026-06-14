#!/usr/bin/env bash
# Wipe the local fixture-mode Postgres so a Maestro flow that starts on
# sign-up gets a fresh account. Safe to run repeatedly. Does NOT drop
# tables — just truncates the rows. Seeds:
#  - Bob Editor (bob@e2e.harpapro.com) so the invite step in
#    core-end-to-end.yaml has a real target user to add.
#  - Alice Tester (alice@e2e.harpapro.com, used by p3-report-wiring.yaml) with a
#    seeded project + draft report + one text note. iOS XCTest cannot
#    reliably deliver `inputText` to React Native's multiline TextInput
#    (the note input bar), so the wiring flow signs IN to this seeded
#    state and exercises generate → finalize → delete without typing
#    a note. Note-create wiring itself is covered by unit tests.
#
# Required env: DEV_OTP_TOKEN (>=32 chars). Maestro's last-otp.js
# helper sends this as the x-dev-otp-token header to the dev OTP
# introspection route. The API also requires it at boot to mount the
# route, so a Maestro run with DEV_OTP_TOKEN unset would silently
# 404 on every login. Fail fast here so that's noisy instead.
set -euo pipefail

: "${DEV_OTP_TOKEN:?DEV_OTP_TOKEN must be set (>=32 chars). Source it from your secrets manager (e.g. \`export DEV_OTP_TOKEN=\$(doppler secrets get DEV_OTP_TOKEN --plain --config dev)\`). Must match the API's DEV_OTP_TOKEN.}"
if (( ${#DEV_OTP_TOKEN} < 32 )); then
  echo "DEV_OTP_TOKEN must be at least 32 chars (got ${#DEV_OTP_TOKEN})." >&2
  exit 1
fi

docker exec -i harpa-pro-pg psql -U postgres -d harpa -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE app.notes, app.files, app.reports, app.project_members,
         app.projects, app.user_settings, app.waitlist_signups,
         public."session", public."account", public."verification", public."user"
  RESTART IDENTITY CASCADE;

INSERT INTO public."user" (id, name, email, email_verified, display_name, company_name, created_at, updated_at)
VALUES ('usr_bbbbbbbbbbbb', 'Bob Editor', 'bob@e2e.harpapro.com', true, 'Bob Editor', 'QA Industries', now(), now());

-- Alice — the p3-report-wiring.yaml signed-in user
INSERT INTO public."user" (id, name, email, email_verified, display_name, company_name, created_at, updated_at)
VALUES ('usr_aaaaaaaaaaaa', 'Alice Tester', 'alice@e2e.harpapro.com', true, 'Alice Tester', 'Wiring Co', now(), now());

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
echo "DB reset (seeded bob@e2e.harpapro.com, alice@e2e.harpapro.com + draft report)."
