# CLI (`apps/cli`)

> **Purpose:** Debug / API testing / LLM-driven usage tool for the harpa-pro v4 API.
>
> Lessons applied: [Pitfall 1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests) (tests ship with commands), [Pitfall 13](pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken) (test the default wiring).

## Scope

- API debugging during development, automated route smoke testing, LLM-driven workflows (`--json` mode).
- **Not** a mobile-app replacement. Stateless / env-only / 12-factor in v1 — no config files, no keychain, no shell completion.

## Stack

- **Framework:** `citty` (chosen over commander/yargs/oclif for ESM-first, TS-native, minimal deps).
- **HTTP client:** `openapi-fetch` typed from `@harpa/api-contract` (drift = compile error).
- **Env:** Zod via `lib/env.ts`.
- **Output:** `chalk` for human, raw JSON for `--json`.
- **Testing:** Vitest + Testcontainers (reuses `packages/api/__tests__/setup-pg.ts`).

## Layout

```
apps/cli/
  package.json          # bin: { harpa: "./dist/index.js" }
  src/
    index.ts            # citty root, mounts subcommands
    lib/
      env.ts            # Zod schema for HARPA_*
      client.ts         # typed openapi-fetch factory
      render.ts         # human-readable formatters
      error.ts          # exit-code mapping + stderr formatter
    commands/           # auth, me, projects, members, reports, reports-ai,
                        # notes, files, voice, settings, health
    __tests__/          # one *.integration.test.ts per command group + unit tests
```

## Env contract (`lib/env.ts`)

```ts
const CliEnv = z.object({
  HARPA_API_URL: z.string().url(),
  HARPA_TOKEN: z.string().optional(),
  HARPA_DEBUG: z.enum(['0', '1']).default('0'),
  HARPA_IDEMPOTENCY_KEY: z.string().uuid().optional(),
});
export const env = CliEnv.parse(process.env);
```

Parsed at top of `src/index.ts` — fails fast on missing/invalid env. Commands needing `HARPA_TOKEN` exit `3` with a clear message if absent. All groups except `auth otp start|verify` require the token.

## Typed HTTP client (`lib/client.ts`)

```ts
export function createApiClient(token?: string) {
  return createClient<paths>({
    baseUrl: env.HARPA_API_URL,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(env.HARPA_IDEMPOTENCY_KEY ? { 'idempotency-key': env.HARPA_IDEMPOTENCY_KEY } : {}),
    },
  });
}
```

## Output contract

- **Default:** human-readable via `lib/render.ts` (chalk).
- **`--json` (global):** raw API JSON to stdout, no progress logs, errors still to stderr.
- **`--verbose` (global):** prints `x-request-id`, `idempotent-replay`, `x-ratelimit-*`, duration after the result.
- **`--debug` (via `HARPA_DEBUG=1`):** also prints response headers + raw body on error.

### Error format (stderr)

```
Error: <http-code> <error.code>
<error.message>

Request ID: <requestId>
```

### Exit codes

| HTTP status | Exit | Meaning |
|---|---|---|
| 2xx | 0 | Success |
| 400, 422 | 2 | Validation error |
| 401, 403 | 3 | Auth error |
| 404 | 4 | Not found |
| 429 | 5 | Rate limited |
| 5xx | 6 | Server error |
| Network / parse | 7 | Transport error |

```ts
export function mapStatusToExitCode(status: number): number {
  if (status >= 200 && status < 300) return 0;
  if (status === 400 || status === 422) return 2;
  if (status === 401 || status === 403) return 3;
  if (status === 404) return 4;
  if (status === 429) return 5;
  if (status >= 500) return 6;
  return 1;
}
```

## Command surface

Every API route has a CLI command. `apps/cli/src/commands/` is the source of truth; flags use kebab-case, positional args where sensible.

### Auth (`commands/auth.ts`)

| API route | CLI command | Notes |
|---|---|---|
| `POST /api/auth/email-otp/send-verification-otp` | `harpa auth otp start <email>` | |
| `POST /api/auth/sign-in/email-otp` | `harpa auth otp verify <email> <code>` | `--raw` prints just the token |
| `POST /api/auth/sign-out` | `harpa auth logout` | |

```bash
export HARPA_TOKEN=$(harpa auth otp verify alice@e2e.harpapro.com 123456 --raw | jq -r .token)
```

### Me (`commands/me.ts`)

| API route | CLI command |
|---|---|
| `GET /me` | `harpa me get` |
| `PATCH /me` | `harpa me update --display-name <n> --company-name <n>` |
| `GET /me/usage` | `harpa me usage` |

### Projects (`commands/projects.ts`)

| API route | CLI command |
|---|---|
| `GET /projects` | `harpa projects list [--cursor <c>] [--limit <n>]` |
| `POST /projects` | `harpa projects create --name --client-name --address` |
| `GET /projects/:id` | `harpa projects get <id>` |
| `PATCH /projects/:id` | `harpa projects update <id> [--name --client-name --address]` |
| `DELETE /projects/:id` | `harpa projects delete <id>` |
| `GET /projects/:id/members` | `harpa projects members list <projectId>` |
| `POST /projects/:id/members` | `harpa projects members add <projectId> --email <e>` |
| `DELETE /projects/:id/members/:userId` | `harpa projects members remove <projectId> <userId>` |

### Reports (`commands/reports.ts`)

| API route | CLI command |
|---|---|
| `GET /projects/:id/reports` | `harpa reports list <projectId> [--cursor --limit]` |
| `POST /projects/:id/reports` | `harpa reports create <projectId> --title` |
| `GET /reports/:reportId` | `harpa reports get <reportId>` |
| `PATCH /reports/:reportId` | `harpa reports update <reportId> [--title --weather]` |
| `DELETE /reports/:reportId` | `harpa reports delete <reportId>` |
| `POST /reports/:reportId/generate` | `harpa reports generate <reportId> [--idempotency-key]` |
| `POST /reports/:reportId/finalize` | `harpa reports finalize <reportId>` |
| `POST /reports/:reportId/regenerate` | `harpa reports regenerate <reportId> [--idempotency-key]` |
| `POST /reports/:reportId/pdf` | `harpa reports pdf <reportId>` |

`--idempotency-key` overrides `HARPA_IDEMPOTENCY_KEY`. No auto-generation — user is responsible for idempotency.

### Notes (`commands/notes.ts`)

| API route | CLI command |
|---|---|
| `GET /reports/:reportId/notes` | `harpa notes list <reportId>` |
| `POST /reports/:reportId/notes` | `harpa notes create <reportId> --kind <text\|voice\|image> [--body --file-id]` |
| `PATCH /notes/:noteId` | `harpa notes update <noteId> --body` |
| `DELETE /notes/:noteId` | `harpa notes delete <noteId>` |

### Files (`commands/files.ts`)

| API route | CLI command |
|---|---|
| `POST /files/presign` | `harpa files presign --kind --content-type --size` |
| `POST /files` | `harpa files register --kind --file-key --size` |
| `GET /files/:id/url` | `harpa files url <fileId>` |

`harpa files upload --file <path> --kind <k>` chains presign → streaming PUT → register.

### Voice (`commands/voice.ts`)

| API route | CLI command |
|---|---|
| `POST /voice/transcribe` | `harpa voice transcribe (--file-id \| --file <path>)` |
| `POST /voice/summarize` | `harpa voice summarize --transcript <text>` |

### Settings (`commands/settings.ts`)

| API route | CLI command |
|---|---|
| `GET /settings/ai` | `harpa settings ai get` |
| `PATCH /settings/ai` | `harpa settings ai update --provider` |

## Idempotency + rate limiting

- `HARPA_IDEMPOTENCY_KEY` (env) sent on every idempotent route; `--idempotency-key` flag overrides per-call.
- `Idempotent-Replay: true` → `(replayed from cache)` in human mode; surfaced via `--verbose`.
- 429: human mode prints `Retry after <n> seconds`; no automatic retry.

## Testing

### Unit

- `env.test.ts`: Zod parse cases.
- `render.test.ts`: snapshot per renderer.
- `error.test.ts`: exit-code mapping, stderr format.

### Integration (Testcontainers)

One file per command group. Each test:

1. Spins up Postgres via `setup-pg.ts`.
2. Boots the API in-process via `createApp()`.
3. Mints a test token via `signTestToken(userId, sessionId)`.
4. Calls the command handler directly (no `spawn`) with mocked `console.log` / `console.error`.
5. Asserts exit code, stdout shape, and DB side-effects.

**Default-wiring rule (Pitfall 13):** at least one happy-path test per group runs through the real `createApiClient()` with no stubs, proving openapi-fetch + `@harpa/api-contract` types + the route handler hang together.

```ts
it('projects list (default HTTP client)', async () => {
  const client = createApiClient(testToken);
  const res = await client.GET('/projects', {});
  expect(res.response.status).toBe(200);
  expect(res.data?.items).toBeInstanceOf(Array);
});
```

### Help-text drift gate

`help.test.ts` snapshots `harpa --help` and `harpa <group> --help`. CI fails on drift; `scripts/check-cli-help-drift.sh` is wired into `pnpm lint`.

### Fixture mode

Integration tests inherit `AI_FIXTURE_MODE=replay` and `R2_FIXTURE_MODE=replay`. Better-auth OTP is read via the dev-only `POST /api/dev/last-otp` route (mounted when `NODE_ENV != production`).

## Build & dev

```json
// apps/cli/package.json (excerpt)
{
  "name": "@harpa/cli",
  "type": "module",
  "bin": { "harpa": "./dist/index.js" },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --project tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@harpa/api-contract": "workspace:*",
    "@unjs/citty": "^0.1.6",
    "chalk": "^5.3.0",
    "openapi-fetch": "^0.12.2",
    "zod": "^3.23.8"
  }
}
```

Root alias: `pnpm harpa <args>` runs `pnpm --filter @harpa/cli dev`.

Production: `pnpm --filter @harpa/cli build` → `dist/index.js` shebang `#!/usr/bin/env node`.

## CI

- `pnpm test:cli` (unit + integration) in `.github/workflows/cli.yml` (or `unit.yml`).
- Coverage gate: ≥ 80% on `apps/cli/src/`.
- Help-drift gate via `scripts/check-cli-help-drift.sh`, wired into `pnpm lint`.

## Risk register

| Risk | Mitigation |
|---|---|
| OTP requires real Resend in dev | Better-auth writes OTP to `public.verification` regardless; tests read via dev-only `/api/dev/last-otp`. |
| Large file uploads timeout | `files upload` uses streaming PUT (`fs.createReadStream`). |
| `openapi-fetch` types drift | `@harpa/api-contract` workspace dep → compile-time error. |
| `--json` polluted by progress logs | All `console.log` progress gated on `!options.json`. |
| Missing token UX | Check at command entry, exit 3 with example auth flow. |

## Phased implementation

> **Status (CLI.1 → CLI.12): all phases complete on `feat/cli`.** Implementation at `apps/cli/`. CI wired via `.github/workflows/cli.yml`; help/command-tree drift gated by `scripts/check-cli-help-drift.sh`.

12 commits, each = one route group + tests + docs. Ordered core-first so AI + reports flow works early:

1. **CLI.1** — Scaffold (env, client, error, root command).
2. **CLI.2** — Auth (`otp start`, `otp verify --raw`, `logout`).
3. **CLI.3** — Me + renderers + `--json` global flag.
4. **CLI.4** — Projects CRUD + pagination + default-wiring test.
5. **CLI.5** — Project members.
6. **CLI.6** — Reports CRUD.
7. **CLI.7** — Report AI (generate, finalize, regenerate, pdf) + idempotency.
8. **CLI.8** — Notes.
9. **CLI.9** — Files + `upload` helper.
10. **CLI.10** — Voice + `transcribe --file` helper.
11. **CLI.11** — Settings.
12. **CLI.12** — CI, root alias, help-drift gate, docs.

## Decisions

- **No auto-generated idempotency keys.** Hides retry semantics from the user.
- **No progress bars.** Breaks `--json`.
- **No stdin JSON input.** Flags suffice for all 37 routes.
- **Direct function imports in tests.** One `execSync` smoke test in `help.test.ts` proves bin wiring.
- **No default `HARPA_API_URL`.** Fail-fast per AGENTS.md rule #1.
- **Import `setup-pg.ts` directly** via `@harpa/api` devDependency. No vendoring.
