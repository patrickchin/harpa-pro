# @harpa/cli

Command-line interface for the Harpa Pro API. Thin HTTP client — every command maps directly to an API call.

## Installation

**Dev (symlinked, no copy):**
```bash
cd apps/cli
pnpm build
npm link
```

**Global install:**
```bash
cd apps/cli
pnpm build
npm pack
npm install -g harpa-cli-0.1.0.tgz
```

## Configuration

Two environment variables, both must be exported in your shell (the CLI does not load `.env` files):

| Variable | Required | Description |
|---|---|---|
| `HARPA_API_URL` | ✅ | Base URL of the API, e.g. `http://localhost:8787` |
| `HARPA_TOKEN` | for authed routes | Bearer JWT from `auth otp verify --raw` |
| `HARPA_DEBUG` | | Set to `1` to print request/response details to stderr |
| `HARPA_IDEMPOTENCY_KEY` | | Override idempotency key for mutating requests |

```bash
export HARPA_API_URL=http://localhost:8787
export HARPA_TOKEN=$(harpa auth otp verify +15550000001 000000 --raw)
```

## Global flags

| Flag | Description |
|---|---|
| `--json` | Emit raw JSON to stdout (for scripting / LLM tool use) |
| `--verbose` | Print response metadata (request ID, rate-limit) to stderr |

## Commands

### Health
```bash
harpa health
```

### Auth
```bash
harpa auth otp start <phone>           # request OTP (E.164 format)
harpa auth otp verify <phone> <code>   # verify OTP, prints session info
harpa auth otp verify <phone> <code> --raw   # print bare JWT only (for shell capture)
harpa auth logout                      # invalidate current session
```

### Me
```bash
harpa me get
harpa me update --display-name "Alice Demo"
```

### Projects
```bash
harpa projects create --name "Demo Tower" --type residential
harpa projects list [--limit N] [--offset N]
harpa projects get <id>
harpa projects update <id> --name "New Name"
harpa projects delete <id>
```

### Project Members
```bash
harpa projects members add <projectId> --phone <E164> --role <owner|editor|viewer>
harpa projects members list <projectId>
harpa projects members remove <projectId> <userId>
```

### Reports
```bash
harpa reports create <projectSlug> --title "Site Inspection 001"
harpa reports list <projectSlug>
harpa reports get <projectSlug> <number>
harpa reports update <projectSlug> <number> --visit-date 2026-05-12
harpa reports generate <projectSlug> <number>    # AI-generate report body from notes
harpa reports regenerate <projectSlug> <number>  # replace body with fresh generation
harpa reports finalize <projectSlug> <number>    # lock report (status → finalized)
harpa reports pdf <projectSlug> <number>         # get signed PDF download URL
harpa reports delete <projectSlug> <number>
```

### Notes
```bash
harpa notes create <reportId> --kind <text|voice|image|document> --body "..."
harpa notes list <reportId>
harpa notes get <noteId>
harpa notes delete <noteId>
```

`--kind` is required.

### Files
```bash
harpa files upload <reportId> <localPath> --kind document
harpa files list <reportId>
harpa files delete <fileId>
```

### Voice
```bash
harpa voice transcribe <localAudioPath>
```

### Settings
```bash
harpa settings ai get
harpa settings ai set --vendor <openai|anthropic|google|kimi|deepseek> --model <model>
```

## Full journey (local docker stack)

```bash
# Start backend (fixture mode — fake Twilio/AI/R2)
docker compose up -d

export HARPA_API_URL=http://localhost:8787

# Auth — OTP code is always 000000 in fixture mode
harpa auth otp start +15550000001
export HARPA_TOKEN=$(harpa auth otp verify +15550000001 000000 --raw)

# Profile
harpa me update --display-name "Alice Demo"
harpa me get

# Project
PROJECT_ID=$(harpa projects create --name "Demo Tower" --type residential --json | jq -r .id)

# Add a member (they must exist — start OTP to register them)
harpa auth otp start +15550000099
harpa auth otp verify +15550000099 000000
harpa projects members add $PROJECT_ID --phone +15550000099 --role editor

# Report
REPORT_ID=$(harpa reports create $PROJECT_ID --title "Site Inspection 001" --json | jq -r .id)

# Notes
harpa notes create $REPORT_ID --kind text --body "Foundation: no cracks found."
harpa notes create $REPORT_ID --kind text --body "Roof: minor wear on north face."

# Generate → finalize → PDF
harpa reports generate $REPORT_ID
harpa reports finalize $REPORT_ID
harpa reports pdf $REPORT_ID

# Settings
harpa settings ai set --vendor openai --model gpt-4o

# Logout
harpa auth logout

# Teardown
docker compose down
```

## LLM / scripting usage

Use `--json` on every command and pipe through `jq`:

```bash
# Clean JSON output, no ANSI colour codes
export NO_COLOR=1

PROJECT_ID=$(harpa projects create --name "Tower" --type residential --json | jq -r .id)
REPORT_ID=$(harpa reports create $PROJECT_ID --title "Inspection" --json | jq -r .id)
harpa notes create $REPORT_ID --kind text --body "Crack on east wall." --json
harpa reports generate $REPORT_ID --json
harpa reports finalize $REPORT_ID --json
harpa reports pdf $REPORT_ID --json | jq -r .url
```

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | API 4xx client error |
| 2 | API 401 unauthorised |
| 3 | API 403 forbidden |
| 4 | API 404 not found |
| 5 | API 409 conflict |
| 6 | API 5xx server error |
| 7 | Network / transport error |

## Development

```bash
pnpm test              # unit tests
pnpm test:integration  # integration tests (requires Docker)
pnpm typecheck
pnpm lint
```

Run without building (via tsx):
```bash
pnpm harpa <command>   # from repo root
```
