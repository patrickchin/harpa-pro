#!/usr/bin/env bash
# Wipe the local fixture-mode Postgres so a Maestro flow that starts on
# sign-up gets a fresh account. Safe to run repeatedly. Does NOT drop
# tables — just truncates the rows. Seeds:
#  - Bob Editor (+15550100200) so the invite step in
#    core-end-to-end.yaml has a real target user to add.
#  - Alice Tester (+15550100100, used by p3-report-wiring.yaml) with a
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
         auth.sessions, auth.verifications, auth.users
  RESTART IDENTITY CASCADE;

INSERT INTO auth.users (id, phone, display_name, company_name)
VALUES ('usr_bbbbbbbbbbbb', '+15550100200', 'Bob Editor', 'QA Industries');

-- Alice — the p3-report-wiring.yaml signed-in user
INSERT INTO auth.users (id, phone, display_name, company_name)
VALUES ('usr_aaaaaaaaaaaa', '+15550100100', 'Alice Tester', 'Wiring Co');

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
echo "DB reset (seeded +15550100200 Bob, +15550100100 Alice + draft report)."
