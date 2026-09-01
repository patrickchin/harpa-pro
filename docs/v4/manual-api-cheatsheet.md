# Manual API cheatsheet

Use this procedure to run a local API smoke test with Docker Compose. The
stack uses Postgres and MinIO locally. AI calls use checked-in replay
fixtures.

This procedure does not call Cloudflare R2, Resend, or a live AI provider.

## Prerequisites

- Start Docker Desktop.
- Install repository dependencies before you use host-side `pnpm` commands.
- Install `curl`, `jq`, and `awk`.
- Choose a local password with at least 16 characters.

Do not use a production password in the local stack.

## Start the local stack

Run these commands from the repository root:

```bash
read -rs TEST_ACCOUNT_PASSWORD
export TEST_ACCOUNT_PASSWORD
docker compose up --build -d
docker compose ps
```

The stack performs these actions:

1. Starts Postgres on `localhost:5433`.
2. Runs application migrations.
3. Seeds the configured test accounts.
4. Starts MinIO on `localhost:9000`.
5. Starts the API on `localhost:8787`.

Wait until the API is ready:

```bash
curl --fail --silent --show-error \
  http://127.0.0.1:8787/readyz | jq
```

If the command fails, inspect bounded service output:

```bash
docker compose logs --no-color --tail=100 api migrate seed-test-accounts
```

## Sign in

Use an account from `TEST_ACCOUNT_EMAILS`. The Compose default includes
`test@harpapro.com`.

```bash
API_BASE='http://127.0.0.1:8787'
EMAIL='test@harpapro.com'
JSON_HEADER='content-type: application/json'

TOKEN=$(curl --fail --silent --show-error --dump-header - \
  --output /dev/null \
  --request POST "$API_BASE/api/auth/sign-in/email" \
  --header "$JSON_HEADER" \
  --data "{\"email\":\"$EMAIL\",\"password\":\"$TEST_ACCOUNT_PASSWORD\"}" \
  | awk 'tolower($1)=="set-auth-token:" {print $2}' \
  | tr -d '\r\n')

test -n "$TOKEN"
AUTH_HEADER="authorization: Bearer $TOKEN"
```

The `set-auth-token` response header comes from the Better Auth bearer
plugin. Do not log the token or store it in a tracked file.

## Create a project, report, and note

```bash
PROJECT_ID=$(curl --fail --silent --show-error \
  --request POST "$API_BASE/projects" \
  --header "$AUTH_HEADER" \
  --header "$JSON_HEADER" \
  --data '{"name":"Manual API check"}' \
  | jq -r '.id')

REPORT_JSON=$(curl --fail --silent --show-error \
  --request POST "$API_BASE/projects/$PROJECT_ID/reports" \
  --header "$AUTH_HEADER" \
  --header "$JSON_HEADER" \
  --data '{}')

REPORT_ID=$(printf '%s' "$REPORT_JSON" | jq -r '.id')
REPORT_NUMBER=$(printf '%s' "$REPORT_JSON" | jq -r '.number')

curl --fail --silent --show-error \
  --request POST "$API_BASE/reports/$REPORT_ID/notes" \
  --header "$AUTH_HEADER" \
  --header "$JSON_HEADER" \
  --data '{"kind":"text","body":"Concrete pour completed at 14:00."}' \
  | jq
```

Report actions use the project ID and project-local report number. Note
routes use the report ID.

## Generate, finalize, and render a PDF

```bash
curl --fail --silent --show-error \
  --request POST \
  "$API_BASE/projects/$PROJECT_ID/reports/$REPORT_NUMBER/generate" \
  --header "$AUTH_HEADER" \
  --header "$JSON_HEADER" \
  --header 'idempotency-key: manual-generate-1' \
  --data '{"fixtureName":"generate-report.voice-1"}' \
  | jq

curl --fail --silent --show-error \
  --request POST \
  "$API_BASE/projects/$PROJECT_ID/reports/$REPORT_NUMBER/finalize" \
  --header "$AUTH_HEADER" \
  | jq

curl --fail --silent --show-error \
  --request POST \
  "$API_BASE/projects/$PROJECT_ID/reports/$REPORT_NUMBER/pdf" \
  --header "$AUTH_HEADER" \
  | jq
```

MinIO stores the PDF object. The response contains a signed URL that uses
`localhost:9000`.

Return the report to draft status before testing regeneration errors:

```bash
curl --fail --silent --show-error \
  --request POST \
  "$API_BASE/projects/$PROJECT_ID/reports/$REPORT_NUMBER/unfinalize" \
  --header "$AUTH_HEADER" \
  | jq
```

## Check error envelopes

Do not use `--fail` for these commands. The non-2xx status is the expected
result.

```bash
# Missing bearer token: 401 with code "unauthorized".
curl --silent --show-error --include \
  "$API_BASE/me"

# Unknown project or report: 404 with code "not_found".
curl --silent --show-error --include \
  --request POST \
  "$API_BASE/projects/prj_00000000/reports/999/generate" \
  --header "$AUTH_HEADER" \
  --header "$JSON_HEADER" \
  --data '{}'

# Invalid fixture name: 400 before the fixture store is called.
curl --silent --show-error --include \
  --request POST \
  "$API_BASE/projects/$PROJECT_ID/reports/$REPORT_NUMBER/regenerate" \
  --header "$AUTH_HEADER" \
  --header "$JSON_HEADER" \
  --data '{"fixtureName":"../../../etc/passwd"}'

# Missing replay fixture: 502 with code "ai_provider_error".
curl --silent --show-error --include \
  --request POST \
  "$API_BASE/projects/$PROJECT_ID/reports/$REPORT_NUMBER/regenerate" \
  --header "$AUTH_HEADER" \
  --header "$JSON_HEADER" \
  --data '{"fixtureName":"generate-report.does-not-exist"}'
```

The wire response does not include the fixture name or provider error. The
API log contains operator diagnostics with the request ID.

## Inspect the contract

```bash
curl --fail --silent --show-error \
  "$API_BASE/openapi.json" \
  | jq '.paths | keys'
```

The OpenAPI document does not include Better Auth plugin routes or the
legacy programmatic admin routes.

## Stop the stack

Stop containers without deleting the named Postgres and MinIO volumes:

```bash
docker compose stop
unset TOKEN AUTH_HEADER TEST_ACCOUNT_PASSWORD
```

`docker compose down -v` deletes the local database and stored objects. Use
that command only when you intend to remove all local stack data.

## Important boundaries

- `AI_LIVE` is unset in Compose, so the API selects replay fixtures.
- `R2_FIXTURE_MODE=live` selects the real S3 client against local MinIO.
- `EXPO_PUBLIC_USE_FIXTURES` changes mobile input behavior only. It does not
  configure the API or make a remote API safe.
- The production provider, database, and storage state is not tested by this
  local procedure.
