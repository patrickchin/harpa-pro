---
name: cli-fixture-testing
description: End-to-end exercise of the harpa-pro API via the `harpa` CLI against the docker-compose stack in fixture-replay mode. Use when validating fixture wiring (R2, Twilio, AI), regenerating canned vendor responses, or smoke-testing the auth/projects/reports/notes/settings flow.
origin: project
---

# CLI fixture testing

Validates the API's external-service fixtures (AI providers, R2 storage,
Twilio OTP) by driving the full happy path with the installed `harpa`
CLI binary against the local docker-compose stack.

## When to use

- After adding/changing an AI fixture in `packages/ai-fixtures/fixtures/`.
- After adding a new vendor to `VENDOR_MODELS` in `services/ai.ts`.
- After touching `services/storage.ts` (R2Storage) or `auth/twilio.ts`.
- Before submitting a PR that touches the report-generation pipeline.

## Prerequisites

1. Docker stack up: `docker compose up -d pg api`
   - `R2_FIXTURE_MODE=replay`, `AI_FIXTURE_MODE=replay` (set in compose).
   - Twilio is in fake mode; OTP code is `000000`.
2. CLI installed globally:
   ```bash
   cd apps/cli && pnpm build && npm link
   harpa --version   # → 0.1.0
   ```

## Full journey

```bash
export HARPA_API_URL=http://localhost:8787
export NO_COLOR=1

# 1. Auth (Twilio fake OTP)
harpa auth otp start +15550000001
export HARPA_TOKEN=$(harpa auth otp verify +15550000001 000000 --raw)

# 2. Create a project (returns slug `prj_xxxxxx`)
SLUG=$(harpa projects create --name "Fixture Test" --json \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['slug'])")

# 3. Create a report (slug-scoped, returns number=1)
harpa reports create $SLUG --json

# 4. Attach a text note (still UUID-keyed — /reports/{reportId}/notes)
REPORT_ID=$(harpa reports get $SLUG 1 --json \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
harpa notes create $REPORT_ID --kind text --body "Crew of three on rebar."

# 5. Generate a report body using the openai fixture
harpa reports generate $SLUG 1 --fixture generate-report.full --json

# 6. Cycle through vendors — route reads getAiSettings() and routes
#    fixture lookup to <name>.<vendor>.json (openai keeps un-suffixed).
for V in openai anthropic kimi google zai deepseek; do
  M=$(case $V in
    openai)    echo gpt-4o;;
    anthropic) echo claude-3-5-sonnet;;
    kimi)      echo moonshot-v1-32k;;
    google)    echo gemini-1.5-pro;;
    zai)       echo glm-4-plus;;
    deepseek)  echo deepseek-reasoner;;
  esac)
  harpa settings ai set --vendor $V --model $M --json > /dev/null
  harpa reports regenerate $SLUG 1 --fixture generate-report.full --json \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print('$V ->', d['report']['body']['summarySections'][0]['body'])"
done
```

Expected output of the per-vendor loop (each line proves the right
fixture file was loaded — the `[vendor]` prefix is baked into the
fixture's `summarySections[0].body`):

```
openai     -> [openai] Steady progress on east footing despite minor delivery delay.
anthropic  -> [anthropic] Steady progress on east footing despite minor delivery delay.
kimi       -> [kimi] Steady progress on east footing despite minor delivery delay.
google     -> [google] Steady progress on east footing despite minor delivery delay.
zai        -> [zai] Steady progress on east footing despite minor delivery delay.
deepseek   -> [deepseek] Steady progress on east footing despite minor delivery delay.
```

If two vendors return the same string, the API isn't reading
`getAiSettings()` (or the fixture file is missing — check
`packages/ai-fixtures/fixtures/generate-report.full.<vendor>.json`).

## Path conventions in the CLI

The API uses slug + number routing; the CLI mirrors this.

| Resource          | CLI args                          | API path                                         |
| ----------------- | --------------------------------- | ------------------------------------------------ |
| projects get/upd/del | `<projectSlug>`                | `/projects/{projectSlug}`                        |
| reports list/create  | `<projectSlug>`                | `/projects/{projectSlug}/reports`                |
| reports get/upd/del/ai | `<projectSlug> <number>`     | `/projects/{projectSlug}/reports/{number}/...`   |
| notes create/list    | `<reportId>` (UUID)            | `/reports/{reportId}/notes`                      |

Notes still use the UUID because there's no slug surface for them yet.

## Troubleshooting

- **`pnpm harpa <cmd>`** prefixes lines with the workspace banner and
  pollutes captured JSON. Invoke `harpa` directly (after `npm link`),
  or use `node --import tsx apps/cli/src/index.ts <cmd>` to bypass the
  build entirely.
- **Same body text across vendors** → API container has stale fixture
  files. Fix:
  - `docker cp packages/ai-fixtures/fixtures harpa-pro-opus-api-1:/app/packages/ai-fixtures/`, or
  - rebuild image: `docker compose build api && docker compose up -d api`.
  The `fixtures/` dir is bind-mounted in `docker-compose.yml`, so on
  the next compose-up it picks up host changes automatically.
- **`ERR_MODULE_NOT_FOUND` for `@aws-sdk/client-s3`** at API boot →
  R2 SDK was added but the container image is older than the lockfile.
  `docker compose build api` then `docker compose up -d api`.
- **`projectSlug` not found** → the route resolver only accepts
  Crockford slugs like `prj_xxxxxx`, not UUIDs. Look at the `slug`
  field on the create response, not `id`.

## Files this skill touches

- `apps/cli/src/commands/{auth,projects,reports,reports-ai,notes,settings}.ts`
- `packages/api/src/services/ai.ts` (vendor → fixture name)
- `packages/api/src/routes/reports.ts` (reads `getAiSettings()` to
  pass vendor into `aiGenerateReport()`)
- `packages/ai-fixtures/fixtures/*.json` (vendor-tagged response bodies)
- `docker-compose.yml` (fixtures bind mount)
