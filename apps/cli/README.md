# @harpa/cli

The Harpa Pro CLI is a thin client for supported API routes. It is useful for
debugging, smoke tests, scripts, and agent-driven workflows.

The package is private and is not published to npm.

## Run the CLI

From the repository root:

```bash
pnpm harpa --help
pnpm harpa <command>
```

To create a local executable link:

```bash
pnpm --filter @harpa/cli build
cd apps/cli
npm link
```

## Configuration

The CLI does not load `.env` files. Export values in the current shell.

| Variable                | Required                  | Description                                  |
| ----------------------- | ------------------------- | -------------------------------------------- |
| `HARPA_API_URL`         | Yes for command execution | API origin, such as `http://localhost:8787`. |
| `HARPA_TOKEN`           | Authenticated commands    | Bearer token from a successful sign-in.      |
| `HARPA_DEBUG`           | No                        | Set to `1` for response details on errors.   |
| `HARPA_IDEMPOTENCY_KEY` | No                        | Non-empty idempotency header value.          |

Help and version output do not require these variables.

## Output flags

Most leaf commands accept these flags:

| Flag        | Description                                                |
| ----------- | ---------------------------------------------------------- |
| `--json`    | Write the API JSON result to stdout.                       |
| `--verbose` | Write available request and rate-limit metadata to stderr. |

## Authentication

Normal users sign in with email OTP:

```bash
export HARPA_API_URL=https://api.example.com
harpa auth otp start user@example.com
OTP_CODE=123456 # Replace with the code from the email.
export HARPA_TOKEN="$(harpa auth otp verify user@example.com "$OTP_CODE" --raw)"
harpa me get
```

`auth otp verify --raw` writes only the bearer token. `auth logout` revokes
the current token.

## Commands

The command implementation and `harpa --help` are authoritative. The CLI does
not expose every API route.

### Health and profile

```bash
harpa health
harpa me get
harpa me update --display-name "Alice Demo" --company-name "Demo Co"
harpa me usage
```

### Projects and members

```bash
harpa projects list [--cursor <cursor>] [--limit <count>]
harpa projects create --name "Demo Tower" \
  --client-name "Acme" --address "1 Main Street"
harpa projects get <projectSlug>
harpa projects update <projectSlug> --name "New name"
harpa projects delete <projectSlug>

harpa projects members list <projectSlug>
harpa projects members add <projectSlug> \
  --email teammate@example.com --role editor
harpa projects members remove <projectSlug> teammate@example.com
```

The member must already have a Harpa Pro account. Remove accepts an email and
resolves the matching user ID before the delete request.

### Reports

```bash
harpa reports list <projectSlug> [--cursor <cursor>] [--limit <count>]
harpa reports create <projectSlug> [--visit-date 2026-08-04]
harpa reports get <projectSlug> <reportNumber>
harpa reports update <projectSlug> <reportNumber> --visit-date 2026-08-06
harpa reports generate <projectSlug> <reportNumber>
harpa reports regenerate <projectSlug> <reportNumber>
harpa reports finalize <projectSlug> <reportNumber>
harpa reports unfinalize <projectSlug> <reportNumber>
harpa reports pdf <projectSlug> <reportNumber>
harpa reports delete <projectSlug> <reportNumber>
```

`generate` and `regenerate` accept `--fixture <name>` in server replay mode.
They also accept `--idempotency-key <key>`.

### Notes

```bash
harpa notes list <projectSlug> <reportNumber>
harpa notes create <projectSlug> <reportNumber> \
  --kind text --body "Foundation: no cracks found."
harpa notes create <projectSlug> <reportNumber> \
  --kind image --file-id <fileId>
harpa notes update <noteId> --body "Updated note"
harpa notes delete <noteId>
```

Supported note kinds are `text`, `voice`, `image`, and `document`.

### Files

```bash
harpa files presign --kind image --content-type image/jpeg --size 1024
harpa files register --kind image --file-key <key> \
  --content-type image/jpeg --size 1024
harpa files url <fileId>
harpa files upload --file ./photo.jpg --kind image
```

`files upload` streams the local file through presign, PUT, and registration.

### Voice and AI settings

```bash
harpa voice transcribe --file-id <fileId>
harpa voice summarize --transcript "Crew poured concrete at 08:00."

harpa settings ai get
harpa settings ai set --vendor openai --model gpt-4.1-mini
harpa settings ai set --clear
```

Voice commands accept `--fixture <name>` in server replay mode and
`--idempotency-key <key>`. Current user settings support OpenAI only.

## Local Docker journey

The Docker Compose stack uses seeded password accounts and MinIO. Choose a
local-only password of at least 16 characters. Do not reuse a real password.

```bash
export TEST_ACCOUNT_PASSWORD='local-test-password-change-me'
docker compose up -d

export HARPA_API_URL=http://localhost:8787
export HARPA_TOKEN="$(
  curl -fsS -X POST "$HARPA_API_URL/api/auth/sign-in/email" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"test@harpapro.com\",\"password\":\"$TEST_ACCOUNT_PASSWORD\"}" \
  | jq -r .token
)"

PROJECT_ID="$(
  pnpm harpa projects create --name "Demo Tower" --json | jq -r .id
)"
REPORT_NUMBER="$(
  pnpm harpa reports create "$PROJECT_ID" \
    --visit-date 2026-08-04 --json | jq -r .number
)"

pnpm harpa projects members add "$PROJECT_ID" \
  --email test2@harpapro.com --role editor
pnpm harpa notes create "$PROJECT_ID" "$REPORT_NUMBER" \
  --kind text --body "Foundation: no cracks found."
pnpm harpa reports generate "$PROJECT_ID" "$REPORT_NUMBER"
pnpm harpa reports pdf "$PROJECT_ID" "$REPORT_NUMBER"
pnpm harpa reports finalize "$PROJECT_ID" "$REPORT_NUMBER"
```

The local API selects replay when `AI_LIVE` is not `1`. The mobile
`EXPO_PUBLIC_USE_FIXTURES` flag does not control this server setting.

Stop the stack when the journey is complete:

```bash
docker compose down
```

## Exit codes

| Code | Meaning                                               |
| ---- | ----------------------------------------------------- |
| 0    | Success.                                              |
| 1    | Generic or unmapped client error, including HTTP 409. |
| 2    | HTTP 400 or 422 validation error.                     |
| 3    | HTTP 401, HTTP 403, or missing token.                 |
| 4    | HTTP 404.                                             |
| 5    | HTTP 429.                                             |
| 6    | HTTP 5xx.                                             |
| 7    | Network or response-parse error.                      |

## Development

```bash
pnpm --filter @harpa/cli typecheck
pnpm --filter @harpa/cli lint
pnpm --filter @harpa/cli test
pnpm --filter @harpa/cli test:integration
pnpm --filter @harpa/cli build
```

Integration tests require Docker. The CLI workflow also runs
`bash scripts/check-cli-help-drift.sh` from the repository root.
