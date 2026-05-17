#!/usr/bin/env bash
# Wipe the local fixture-mode Postgres so a Maestro flow that starts on
# sign-up gets a fresh account. Safe to run repeatedly. Does NOT drop
# tables — just truncates the rows. Seeds one extra user (Bob Editor,
# +15550100200) so the invite step has a real target user to add.
set -euo pipefail
docker exec -i harpa-pro-pg psql -U postgres -d harpa -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE app.notes, app.files, app.reports, app.project_members,
         app.projects, app.user_settings, app.waitlist_signups,
         auth.sessions, auth.verifications, auth.users
  RESTART IDENTITY CASCADE;

INSERT INTO auth.users (id, phone, display_name, company_name)
VALUES ('usr_bbbbbbbbbbbb', '+15550100200', 'Bob Editor', 'QA Industries');
SQL
echo "DB reset (with +15550100200 seeded)."
