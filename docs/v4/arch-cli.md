# CLI (`apps/cli`)

> **Purpose:** Debug, test, and automate supported Harpa Pro API routes.
>
> This design applies [Pitfall 1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests)
> and [Pitfall 13](pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken).

## Scope

- The CLI supports common auth, profile, project, report, note, file,
  voice, and AI-settings operations.
- It supports scripts through JSON output and stable exit codes.
- It does not expose every API route. The current command tree in
  `apps/cli/src/commands/` is authoritative.
- It is stateless. It does not load config files, store credentials,
  or replace the mobile app.

## Stack

- **Commands:** `citty`.
- **Typed API client:** `openapi-fetch` with types from
  `@harpa/api-contract`.
- **Environment:** Zod in `src/lib/env.ts`.
- **Output:** `chalk` for human output and plain JSON for scripts.
- **Tests:** Vitest and Testcontainers.

## Layout

```text
apps/cli/
  package.json
  src/
    index.ts
    lib/
      env.ts
      env-runtime.ts
      client.ts
      render.ts
      error.ts
      run.ts
    commands/
    __tests__/
  scripts/
```

## Environment contract

| Variable                | Required                  | Purpose                                                    |
| ----------------------- | ------------------------- | ---------------------------------------------------------- |
| `HARPA_API_URL`         | Yes for command execution | API origin, such as `http://localhost:8787`.               |
| `HARPA_TOKEN`           | Authenticated commands    | Better Auth bearer token.                                  |
| `HARPA_DEBUG`           | No                        | Set to `1` to include response details on errors.          |
| `HARPA_IDEMPOTENCY_KEY` | No                        | Non-empty idempotency header value for typed API requests. |

`getEnv()` parses the environment on the first command execution.
`harpa --help` and `harpa --version` do not require environment values.
Commands fail before their request when the environment is invalid.

Health and email-OTP start or verify do not require `HARPA_TOKEN`.
`auth logout` and all other authenticated commands require it.

## HTTP clients

The Better Auth routes under `/api/auth/**` are not part of the generated
OpenAPI contract. Auth commands use raw `fetch` through one wrapper.

All other commands use `createApiClient(env, options)`. The client reads
the API URL, bearer token, and optional idempotency key from parsed env.
Integration tests can override the fetch function without replacing the
typed client.

## Output contract

- The default format is human-readable.
- `--json` writes the API JSON result to stdout. Errors stay on stderr.
- `--verbose` writes available request ID, replay, and rate-limit headers
  to stderr.
- `HARPA_DEBUG=1` also writes response headers and the raw error body.

The human error format is:

```text
Error: <http-status> <error-code>
<error-message>

Request ID: <request-id>
```

### Exit codes

| Result                                 | Exit code |
| -------------------------------------- | --------- |
| Success                                | 0         |
| Other client error, including HTTP 409 | 1         |
| HTTP 400 or 422 validation error       | 2         |
| HTTP 401, HTTP 403, or missing token   | 3         |
| HTTP 404                               | 4         |
| HTTP 429                               | 5         |
| HTTP 5xx                               | 6         |
| Network or response-parse error        | 7         |

## Command surface

Flags use kebab case. Project identifiers are slugs such as
`prj_xxxxxxxx`. Reports use a project slug and the report number.

### Health and auth

| API route                                        | CLI command                                    |
| ------------------------------------------------ | ---------------------------------------------- |
| `GET /healthz`                                   | `harpa health`                                 |
| `POST /api/auth/email-otp/send-verification-otp` | `harpa auth otp start <email>`                 |
| `POST /api/auth/sign-in/email-otp`               | `harpa auth otp verify <email> <code> [--raw]` |
| `POST /api/auth/sign-out`                        | `harpa auth logout`                            |

Use `--raw` to print only the bearer token:

```bash
OTP_CODE=123456 # Replace with the code from the email.
export HARPA_TOKEN="$(harpa auth otp verify user@example.com "$OTP_CODE" --raw)"
```

### Profile

| API route       | CLI command                                                       |
| --------------- | ----------------------------------------------------------------- |
| `GET /me`       | `harpa me get`                                                    |
| `PATCH /me`     | `harpa me update [--display-name <name>] [--company-name <name>]` |
| `GET /me/usage` | `harpa me usage`                                                  |

### Projects and members

| API route                                   | CLI command                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /projects`                             | `harpa projects list [--cursor <cursor>] [--limit <count>]`                                    |
| `POST /projects`                            | `harpa projects create --name <name> [--client-name <name>] [--address <address>]`             |
| `GET /projects/{project}`                   | `harpa projects get <project>`                                                                 |
| `PATCH /projects/{project}`                 | `harpa projects update <project> [--name <name>] [--client-name <name>] [--address <address>]` |
| `DELETE /projects/{project}`                | `harpa projects delete <project>`                                                              |
| `GET /projects/{project}/members`           | `harpa projects members list <project>`                                                        |
| `POST /projects/{project}/members`          | `harpa projects members add <project> --email <email> [--role <role>]`                         |
| `DELETE /projects/{project}/members/{user}` | `harpa projects members remove <project> <email>`                                              |

The remove command resolves the email to a user ID from the member list.
The CLI does not currently expose the member-role update route.

### Reports

| API route                                     | CLI command                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /projects/{project}/reports`             | `harpa reports list <project> [--cursor <cursor>] [--limit <count>]`                       |
| `POST /projects/{project}/reports`            | `harpa reports create <project> [--visit-date <date>]`                                     |
| `GET /projects/{project}/reports/{number}`    | `harpa reports get <project> <number>`                                                     |
| `PATCH /projects/{project}/reports/{number}`  | `harpa reports update <project> <number> [--visit-date <date>]`                            |
| `DELETE /projects/{project}/reports/{number}` | `harpa reports delete <project> <number>`                                                  |
| `POST .../generate`                           | `harpa reports generate <project> <number> [--fixture <name>] [--idempotency-key <key>]`   |
| `POST .../regenerate`                         | `harpa reports regenerate <project> <number> [--fixture <name>] [--idempotency-key <key>]` |
| `POST .../finalize`                           | `harpa reports finalize <project> <number>`                                                |
| `POST .../unfinalize`                         | `harpa reports unfinalize <project> <number>`                                              |
| `POST .../pdf`                                | `harpa reports pdf <project> <number>`                                                     |

### Notes

| API route                      | CLI command                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `GET /reports/{report}/notes`  | `harpa notes list <project> <report-number> [--cursor <cursor>] [--limit <count>]`                                  |
| `POST /reports/{report}/notes` | `harpa notes create <project> <report-number> --kind <kind> [--body <text>] [--file-id <id>] [--transcript <text>]` |
| `PATCH /notes/{note}`          | `harpa notes update <note-id> --body <text>`                                                                        |
| `DELETE /notes/{note}`         | `harpa notes delete <note-id>`                                                                                      |

The list and create commands resolve the report UUID from the project slug
and report number. Supported note kinds are `text`, `voice`, `image`, and
`document`.

### Files

| API route             | CLI command                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `POST /files/presign` | `harpa files presign --kind <kind> --content-type <type> --size <bytes>`                   |
| `POST /files`         | `harpa files register --kind <kind> --file-key <key> --content-type <type> --size <bytes>` |
| `GET /files/{id}/url` | `harpa files url <file-id>`                                                                |

`harpa files upload --file <path> --kind <kind>` performs presign, a
streaming PUT, and registration. It accepts an optional `--content-type`.

### Voice and settings

| API route                | CLI command                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `POST /voice/transcribe` | `harpa voice transcribe --file-id <id> [--fixture <name>] [--idempotency-key <key>]`     |
| `POST /voice/summarize`  | `harpa voice summarize --transcript <text> [--fixture <name>] [--idempotency-key <key>]` |
| `GET /settings/ai`       | `harpa settings ai get`                                                                  |
| `PATCH /settings/ai`     | `harpa settings ai set --vendor openai --model <model>`                                  |
| `PATCH /settings/ai`     | `harpa settings ai set --clear`                                                          |

The current settings contract accepts the `openai` vendor only.

## Idempotency and rate limits

`HARPA_IDEMPOTENCY_KEY` adds the header to typed API requests. The server
uses it only on routes with idempotency middleware. The report AI and voice
commands also accept `--idempotency-key`, which overrides the env value.

The CLI does not generate keys or retry HTTP 429 responses. `--verbose`
shows replay and rate-limit headers when the server returns them.

## Testing

Unit tests cover env parsing, the typed client, rendering, error mapping,
and the serialized command tree.

Integration tests import
`packages/api/src/__tests__/setup-pg.ts`, start real Postgres, and mount the
Hono app in-process. They sign in through Better Auth email OTP, then read
the test OTP directly from the verification table. Typed commands use the
real `createApiClient()` with an `app.fetch` adapter.

AI and R2 use replay in the CLI integration workflow. Run the suites with:

```bash
pnpm --filter @harpa/cli test
pnpm --filter @harpa/cli test:integration
```

`src/__tests__/help.test.ts` snapshots command metadata and arguments. It is
a proxy for the help surface, not a snapshot of rendered terminal output.
CI runs `bash scripts/check-cli-help-drift.sh` as a separate step.

## Build and development

```bash
pnpm --filter @harpa/cli dev -- <command>
pnpm --filter @harpa/cli build
pnpm harpa <command>
```

The workspace `dev` script runs `tsx src/index.ts`; it is not a watcher.
The build uses `tsc -b` and writes the executable to `dist/index.js`.

`.github/workflows/cli.yml` runs these checks:

1. Typecheck.
2. Lint.
3. Unit tests.
4. Help-command drift check.
5. Testcontainers integration tests.

The CLI currently has no enforced coverage threshold and no root
`pnpm test:cli` alias.

## Historical implementation record

The original CLI.1 through CLI.12 sequence delivered the scaffold, auth,
profile, projects, members, reports, notes, files, voice, settings, tests,
and CI. Those phase labels are historical. Current behavior comes from the
command implementation and tests, not from the original branch plan.

## Decisions

- Do not generate idempotency keys automatically.
- Do not print progress bars because they pollute script output.
- Do not accept arbitrary stdin JSON. Use the typed command flags.
- Do not provide a default `HARPA_API_URL`.
- Parse env lazily so help remains available without configuration.
