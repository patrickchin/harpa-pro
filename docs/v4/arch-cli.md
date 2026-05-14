# CLI (`apps/cli`)

> **Purpose:** Debug / API testing / LLM-driven usage tool for the harpa-pro v4 API.
>
> **Non-goal:** Not a mobile-app replacement. No config files, no keychain, no completion, no end-user power-user features in v1.
>
> Lessons applied: [Pitfall 1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests) (tests ship with commands), [Pitfall 13](pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken) (test the default wiring).

## Purpose & non-goals

**Purpose:**
- Human-readable API debugging during development
- Automated API route smoke testing (CI + local)
- LLM-driven workflows (JSON output mode)
- Quick manual inspection of API behaviour without opening a browser / mobile app

**Explicitly NOT in v1:**
- Mobile-app feature parity (no project/report UI, no "app" replacement)
- Config files (`.harparc`, `~/.harpa/config.json`)
- Keychain integration (`harpa auth login --save`)
- Shell completion (`harpa completion zsh`)
- End-user power-tool features (watch mode, long-polling, webhooks)

These may land post-v1 if demand surfaces, but the initial implementation is stateless / env-only / 12-factor.

## Stack

- **Framework:** `citty` ([@unjs/citty](https://github.com/unjs/citty))
- **HTTP client:** `openapi-fetch` with types from `@harpa/api-contract`
- **Env parsing:** Zod via `lib/env.ts` (same pattern as `packages/api/src/env.ts`)
- **Output:** `chalk` for human-readable, raw JSON for `--json`
- **Testing:** Vitest unit (formatters, error mapping, exit codes) + integration (Testcontainers, reuse `packages/api/__tests__/setup-pg.ts`)

### Why citty?

| Consideration | citty | commander | yargs | oclif |
|---|---|---|---|---|
| ESM-first | ✅ | ✅ (v10+) | ⚠️ (dual) | ✅ |
| TypeScript-native | ✅ | ⚠️ (types only) | ⚠️ (types only) | ✅ |
| Nested commands | ✅ | ✅ | ✅ | ✅ |
| Minimal deps | ✅ (2 deps) | ⚠️ (many) | ⚠️ (many) | ❌ (50+) |
| Monorepo-friendly | ✅ | ✅ | ✅ | ⚠️ (plugin arch) |
| Auto-help | ✅ | ✅ | ✅ | ✅ |
| Arg/flag types | ✅ (inferred) | ⚠️ (manual cast) | ⚠️ (manual cast) | ✅ |
| Exit code control | ✅ | ✅ | ✅ | ✅ |

**Winner:** `citty`. Minimal, ESM-first, TypeScript-first, no ceremony. Nested commands are declared as plain objects. Aligns with the monorepo's "keep deps light" ethos (same reason we use Hono, not Express).

Alternative considered: `commander@12` (ESM + TS). Rejected: heavier, more ceremony for defining sub-commands, manual type casting for args.

## Layout

```
apps/cli/
  package.json          # bin: { harpa: "./dist/index.js" }
  tsconfig.json
  vitest.config.ts
  src/
    index.ts            # citty root command, mounts subcommands
    lib/
      env.ts            # Zod schema for HARPA_*
      client.ts         # typed openapi-fetch factory
      render.ts         # human-readable formatters per resource
      error.ts          # exit-code mapping + stderr formatter
    commands/
      auth.ts           # auth otp start, auth otp verify, auth logout
      me.ts             # me get, me update, me usage
      projects.ts       # projects list, projects create, projects get, projects update, projects delete, projects members list, projects members add, projects members remove
      reports.ts        # reports list, reports create, reports get, reports update, reports delete, reports generate, reports finalize, reports regenerate, reports pdf
      notes.ts          # notes list, notes create, notes update, notes delete
      files.ts          # files presign, files register, files url, files upload (helper)
      voice.ts          # voice transcribe, voice summarize
      settings.ts       # settings ai get, settings ai update
    __tests__/
      env.test.ts
      render.test.ts
      error.test.ts
      auth.integration.test.ts
      projects.integration.test.ts
      reports.integration.test.ts
      notes.integration.test.ts
      files.integration.test.ts
      voice.integration.test.ts
      settings.integration.test.ts
  dist/                 # tsc output (ESM, Node ≥20)
```

## Env contract (`lib/env.ts`)

```ts
import { z } from 'zod';

const CliEnv = z.object({
  HARPA_API_URL: z.string().url(),
  HARPA_TOKEN: z.string().optional(), // required for authed routes
  HARPA_DEBUG: z.enum(['0', '1']).default('0'),
  HARPA_IDEMPOTENCY_KEY: z.string().uuid().optional(), // optional; when provided, sent on generate/transcribe
});

export const env = CliEnv.parse(process.env);
export type CliEnv = z.infer<typeof CliEnv>;
```

**Parse timing:** at top of `src/index.ts` (before citty runs), so missing / invalid env fails fast with a user-friendly Zod error before any command logic executes.

**Per-command requirements:**

| Command group | Requires `HARPA_TOKEN`? | Notes |
|---|---|---|
| `auth otp start` | ❌ | Public route |
| `auth otp verify` | ❌ | Public route (returns token) |
| `auth logout` | ✅ | |
| `me *` | ✅ | |
| `projects *` | ✅ | |
| `reports *` | ✅ | |
| `notes *` | ✅ | |
| `files *` | ✅ | |
| `voice *` | ✅ | |
| `settings *` | ✅ | |

Commands that need `HARPA_TOKEN` check `env.HARPA_TOKEN` and exit with code 3 + clear message if missing:

```ts
if (!env.HARPA_TOKEN) {
  console.error('Error: HARPA_TOKEN not set. Run `harpa auth otp verify ...` first.');
  process.exit(3);
}
```

## Typed HTTP client (`lib/client.ts`)

```ts
import createClient from 'openapi-fetch';
import type { paths } from '@harpa/api-contract';
import { env } from './env.js';

export function createApiClient(token?: string) {
  const client = createClient<paths>({
    baseUrl: env.HARPA_API_URL,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  return client;
}
```

Every command imports `createApiClient`, passes `env.HARPA_TOKEN`, and uses the typed methods (`client.GET('/me', {})`, `client.POST('/projects', { body: { ... } })`). Types are compile-time enforced via `openapi-fetch` + `@harpa/api-contract`'s exported `paths` — drift is impossible without a type error.

If `HARPA_IDEMPOTENCY_KEY` is set, the client factory includes it:

```ts
headers: {
  ...(token ? { authorization: `Bearer ${token}` } : {}),
  ...(env.HARPA_IDEMPOTENCY_KEY ? { 'idempotency-key': env.HARPA_IDEMPOTENCY_KEY } : {}),
}
```

## Output contract

### Human-readable (default)

Each resource group has a renderer in `lib/render.ts`:

```ts
export function renderProject(p: Project): string {
  return `${chalk.bold(p.name)} (${p.id})
  Client: ${p.clientName}
  Address: ${p.address}
  Owner: ${p.ownerId}
  My role: ${chalk.cyan(p.myRole)}
  Created: ${formatDate(p.createdAt)}`;
}

export function renderProjectList(items: Project[]): string {
  if (items.length === 0) return chalk.dim('No projects.');
  return items.map((p) => `  ${chalk.bold(p.name)} ${chalk.dim(p.id)}`).join('\n');
}

// ... renderReport, renderNote, renderUser, etc.
```

Commands call the appropriate renderer and `console.log(rendered)`.

### `--json` flag (global)

Every command accepts `--json` (boolean flag). When present:
- Output is raw API JSON printed to stdout (no formatting, no colors)
- No other text to stdout (no "Creating project..." progress)
- Errors still go to stderr (see below)

Implementation:

```ts
// in each command
const raw = options.json as boolean | undefined;
const res = await client.POST('/projects', { body: { name, clientName, address } });
if (!res.data) {
  printError(res.error, res.response);
  process.exit(mapStatusToExitCode(res.response.status));
}
if (raw) {
  console.log(JSON.stringify(res.data, null, 2));
} else {
  console.log(renderProject(res.data));
}
```

### Error output (`lib/error.ts`)

Errors always print to stderr in this format:

```
Error: <http-code> <error.code>
<error.message>

Request ID: <requestId>
```

If `HARPA_DEBUG=1`, also print:

```
Response headers:
  X-RateLimit-Remaining: 58
  Idempotent-Replay: false

Response body:
<raw JSON>
```

Exit codes:

| HTTP status | Exit code | Meaning |
|---|---|---|
| 2xx | 0 | Success |
| 400, 422 | 2 | Validation error |
| 401, 403 | 3 | Auth error |
| 404 | 4 | Not found |
| 429 | 5 | Rate limited |
| 5xx | 6 | Server error |
| Network / parse error | 7 | Transport error |

Mapping lives in `lib/error.ts`:

```ts
export function mapStatusToExitCode(status: number): number {
  if (status >= 200 && status < 300) return 0;
  if (status === 400 || status === 422) return 2;
  if (status === 401 || status === 403) return 3;
  if (status === 404) return 4;
  if (status === 429) return 5;
  if (status >= 500) return 6;
  return 1; // generic
}

export function printError(error: unknown, response: Response) {
  const requestId = response.headers.get('x-request-id') ?? 'unknown';
  const body = error as { error?: { code?: string; message?: string } };
  console.error(chalk.red(`Error: ${response.status} ${body.error?.code ?? 'UNKNOWN'}`));
  console.error(body.error?.message ?? 'An error occurred.');
  console.error(chalk.dim(`\nRequest ID: ${requestId}`));

  if (env.HARPA_DEBUG === '1') {
    console.error(chalk.dim('\nResponse headers:'));
    response.headers.forEach((v, k) => console.error(chalk.dim(`  ${k}: ${v}`)));
    console.error(chalk.dim('\nResponse body:'));
    console.error(JSON.stringify(error, null, 2));
  }
}
```

### `--verbose` flag (global)

When present, log request metadata after the response:

```
✓ Created project <id>

Request ID: <x-request-id>
Idempotent replay: false
Rate limit remaining: 58/60
Duration: 123ms
```

Implementation: read response headers (`x-request-id`, `idempotent-replay`, `x-ratelimit-remaining`, `x-ratelimit-limit`) and print conditionally.

## Command surface (all 37 routes)

Complete mapping of the frozen OpenAPI spec (37 routes) to CLI commands. Flags use kebab-case, positional args where sensible.

### Auth (`commands/auth.ts`)

| API route | CLI command | Flags / Args | Stdin | Stdout |
|---|---|---|---|---|
| `POST /auth/otp/start` | `harpa auth otp start <phone>` | | | `{ verificationId }` |
| `POST /auth/otp/verify` | `harpa auth otp verify <phone> <code>` | `--raw` | | `{ token, user }` (or just token if `--raw`) |
| `POST /auth/logout` | `harpa auth logout` | | | `{ ok: true }` |

**Auth flow example:**

```bash
# Start OTP
harpa auth otp start +15551234567
# prints: OTP sent. Verification ID: abc123

# Verify and capture token
export HARPA_TOKEN=$(harpa auth otp verify +15551234567 000000 --raw | jq -r .token)

# Now all other commands work
harpa me get
```

### Me (`commands/me.ts`)

| API route | CLI command | Flags / Args | Stdin | Stdout |
|---|---|---|---|---|
| `GET /me` | `harpa me get` | | | User object |
| `PATCH /me` | `harpa me update` | `--display-name <name>` `--company-name <name>` | | Updated user |
| `GET /me/usage` | `harpa me usage` | | | Usage stats |

### Projects (`commands/projects.ts`)

| API route | CLI command | Flags / Args | Stdin | Stdout |
|---|---|---|---|---|
| `GET /projects` | `harpa projects list` | `--cursor <c>` `--limit <n>` | | `{ items, nextCursor }` |
| `POST /projects` | `harpa projects create` | `--name <n>` `--client-name <cn>` `--address <a>` | | Project object |
| `GET /projects/:id` | `harpa projects get <id>` | | | Project + stats |
| `PATCH /projects/:id` | `harpa projects update <id>` | `--name <n>` `--client-name <cn>` `--address <a>` | | Updated project |
| `DELETE /projects/:id` | `harpa projects delete <id>` | | | `{ ok: true }` |
| `GET /projects/:id/members` | `harpa projects members list <projectId>` | | | `{ items }` |
| `POST /projects/:id/members` | `harpa projects members add <projectId>` | `--phone <p>` | | Member object |
| `DELETE /projects/:id/members/:userId` | `harpa projects members remove <projectId> <userId>` | | | `{ ok: true }` |

### Reports (`commands/reports.ts`)

| API route | CLI command | Flags / Args | Stdin | Stdout |
|---|---|---|---|---|
| `GET /projects/:id/reports` | `harpa reports list <projectId>` | `--cursor <c>` `--limit <n>` | | `{ items, nextCursor }` |
| `POST /projects/:id/reports` | `harpa reports create <projectId>` | `--title <t>` | | Report object |
| `GET /reports/:reportId` | `harpa reports get <reportId>` | | | Report + notes |
| `PATCH /reports/:reportId` | `harpa reports update <reportId>` | `--title <t>` `--weather <w>` | | Updated report |
| `DELETE /reports/:reportId` | `harpa reports delete <reportId>` | | | `{ ok: true }` |
| `POST /reports/:reportId/generate` | `harpa reports generate <reportId>` | `--idempotency-key <uuid>` | | Generated report |
| `POST /reports/:reportId/finalize` | `harpa reports finalize <reportId>` | | | Finalized report |
| `POST /reports/:reportId/regenerate` | `harpa reports regenerate <reportId>` | `--idempotency-key <uuid>` | | Regenerated report |
| `POST /reports/:reportId/pdf` | `harpa reports pdf <reportId>` | | | `{ url, expiresAt }` |

**Note:** `--idempotency-key` on `generate` / `regenerate` overrides `HARPA_IDEMPOTENCY_KEY` if both are present. If neither, the command does NOT auto-generate one — the user is responsible for idempotency.

### Notes (`commands/notes.ts`)

| API route | CLI command | Flags / Args | Stdin | Stdout |
|---|---|---|---|---|
| `GET /reports/:reportId/notes` | `harpa notes list <reportId>` | | | `{ items }` |
| `POST /reports/:reportId/notes` | `harpa notes create <reportId>` | `--kind <text\|voice\|image>` `--body <text>` `--file-id <id>` | | Note object |
| `PATCH /notes/:noteId` | `harpa notes update <noteId>` | `--body <text>` | | Updated note |
| `DELETE /notes/:noteId` | `harpa notes delete <noteId>` | | | `{ ok: true }` |

### Files (`commands/files.ts`)

| API route | CLI command | Flags / Args | Stdin | Stdout |
|---|---|---|---|---|
| `POST /files/presign` | `harpa files presign` | `--kind <voice\|image\|document>` `--content-type <ct>` `--size <bytes>` | | `{ uploadUrl, fileKey, expiresAt }` |
| `POST /files` | `harpa files register` | `--kind <k>` `--file-key <fk>` `--size <bytes>` | | `{ fileId }` |
| `GET /files/:id/url` | `harpa files url <fileId>` | | | `{ url, expiresAt }` |

**Helper:** `harpa files upload --file <path> --kind <k>`

Chains presign → PUT → register in one command. Reads the file from disk, infers `--content-type` from extension (or takes `--content-type` explicitly), calls presign, PUTs the bytes, calls register, prints `{ fileId }`.

```bash
harpa files upload --file recording.m4a --kind voice
# prints: { fileId: "..." }
```

Implementation uses `node:fs` + `node:fetch` for the PUT.

### Voice (`commands/voice.ts`)

| API route | CLI command | Flags / Args | Stdin | Stdout |
|---|---|---|---|---|
| `POST /voice/transcribe` | `harpa voice transcribe` | `--file-id <id>` OR `--file <path>` | | `{ transcript }` |
| `POST /voice/summarize` | `harpa voice summarize` | `--transcript <text>` | | `{ summary }` |

**Helper:** `harpa voice transcribe --file <path>` chains upload → transcribe.

```bash
harpa voice transcribe --file recording.m4a
# uploads file, calls /voice/transcribe, prints { transcript }
```

### Settings (`commands/settings.ts`)

| API route | CLI command | Flags / Args | Stdin | Stdout |
|---|---|---|---|---|
| `GET /settings/ai` | `harpa settings ai get` | | | `{ provider }` |
| `PATCH /settings/ai` | `harpa settings ai update` | `--provider <openai\|anthropic\|...>` | | Updated settings |

## Idempotency + rate-limit handling

### Idempotency

Routes that accept `Idempotency-Key` (`/reports/:id/generate`, `/reports/:id/regenerate`, `/voice/transcribe`):

- If `HARPA_IDEMPOTENCY_KEY` is set in env, it's sent on every request to those routes.
- Commands that map to those routes also accept `--idempotency-key <uuid>` flag, which overrides the env var.
- Default behavior (no env var, no flag): no idempotency key sent — the API treats it as a new request every time.
- When a response has `Idempotent-Replay: true`, `--verbose` mode prints it; human-readable mode prints `(replayed from cache)` next to the result.

### Rate limiting

When the API returns 429 + `Retry-After`:

- Human-readable: `Error: 429 RATE_LIMITED\nRetry after <n> seconds.\nRequest ID: ...`
- `--json`: raw error envelope to stdout, exit 5
- `--verbose`: also print `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` if present

No automatic retry in the CLI — the user re-runs the command after the backoff.

## Testing strategy

### Unit tests

- `env.test.ts`: Zod parse success / missing required / invalid URL
- `render.test.ts`: snapshot tests for each renderer (project, report, note, user, usage)
- `error.test.ts`: exit-code mapping for all status ranges; stderr format (with/without debug)

### Integration tests

Reuse the Testcontainers pattern from `packages/api/__tests__/setup-pg.ts`. Each command group gets one integration test file that:

1. Spins up Postgres via Testcontainers (same `startPg()` helper)
2. Boots the API via `createApp()` (in-process, no separate server)
3. Mints a test token via `signTestToken(userId, sessionId)`
4. Calls the CLI command's underlying function (not via `spawn` — direct import of the command handler) with mocked `console.log` / `console.error` to capture output
5. Asserts:
   - Exit code (via thrown error or success return)
   - Stdout matches expected format (human or JSON)
   - DB side-effect (e.g. `projects create` → row in `app.projects`)

**Example:** `auth.integration.test.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, type PgFixture } from '../../../packages/api/src/__tests__/setup-pg.js';
import { createApp } from '../../../packages/api/src/app.js';
import { otpStartCommand, otpVerifyCommand } from '../commands/auth.js';

let fx: PgFixture;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  process.env.HARPA_API_URL = 'http://localhost:8787'; // fake; we call app.fetch directly
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('harpa auth otp start', () => {
  it('sends OTP and prints verificationId', async () => {
    const logs: string[] = [];
    const mockLog = (msg: string) => logs.push(msg);
    const app = createApp();

    await otpStartCommand({ phone: '+15550400001' }, { log: mockLog, app });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/Verification ID:/);
  });
});

// ... more tests
```

**Key insight (Pitfall 13 + arch-testing.md §"Test the default wiring"):** At least one test per route group calls the real HTTP path (via `app.request(...)` or `createApiClient()`) without stubbing the client — proving the default factory + openapi-fetch + @harpa/api-contract types all hang together. Negative-path tests (404, 401, validation errors) can stub, but the happy path must run through the real HTTP client.

### Default-wiring test example

`projects.integration.test.ts`:

```ts
it('projects list (default HTTP client)', async () => {
  // This test does NOT stub createApiClient — it uses the real openapi-fetch.
  const client = createApiClient(testToken);
  const res = await client.GET('/projects', {});
  expect(res.response.status).toBe(200);
  expect(res.data?.items).toBeInstanceOf(Array);
});
```

### Golden file tests

Snapshot `harpa --help` and `harpa <group> --help` output:

```ts
// help.test.ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('CLI help text', () => {
  it('harpa --help matches snapshot', () => {
    const output = execSync('node dist/index.js --help', { encoding: 'utf-8' });
    expect(output).toMatchSnapshot();
  });

  it('harpa projects --help matches snapshot', () => {
    const output = execSync('node dist/index.js projects --help', { encoding: 'utf-8' });
    expect(output).toMatchSnapshot();
  });

  // ... one per group
});
```

CI fails if help text drifts without updating snapshots.

### Fixture mode

All integration tests run with `AI_FIXTURE_MODE=replay` and `R2_FIXTURE_MODE=replay` (inherited from the existing `packages/api` test setup). No real LLM, no real R2, no real Twilio in CI.

## Build & dev ergonomics

### package.json

```json
{
  "name": "@harpa/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "harpa": "./dist/index.js"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --project tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@harpa/api-contract": "workspace:*",
    "@unjs/citty": "^0.1.6",
    "chalk": "^5.3.0",
    "openapi-fetch": "^0.12.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.7.5",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2",
    "vitest": "^2.1.3"
  }
}
```

### tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"]
  },
  "include": ["src/**/*"]
}
```

### Dev workflow

```bash
# Terminal 1: API
pnpm --filter @harpa/api dev

# Terminal 2: CLI in watch mode
pnpm --filter @harpa/cli dev projects list

# Or via root alias (add to root package.json):
pnpm harpa projects list
```

Root `package.json` addition:

```json
{
  "scripts": {
    "harpa": "pnpm --filter @harpa/cli dev"
  }
}
```

So `pnpm harpa <args>` works from repo root during dev.

### Production bin

After `pnpm build`, `dist/index.js` is the entry. First line:

```js
#!/usr/bin/env node
```

`pnpm --filter @harpa/cli build` compiles TS → ESM in `dist/`. Local install:

```bash
pnpm --filter @harpa/cli build
pnpm link --global @harpa/cli
harpa --version
```

Or via `tsx` for dev (no build step):

```bash
tsx apps/cli/src/index.ts projects list
```

## CI

### New scripts in `apps/cli/package.json`

```json
{
  "scripts": {
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Root CI additions

1. **`test:cli` in root `package.json`:**

```json
{
  "scripts": {
    "test:cli": "pnpm --filter @harpa/cli test",
    "test:cli:integration": "pnpm --filter @harpa/cli test:integration"
  }
}
```

2. **New workflow `.github/workflows/cli.yml` (or add to existing `unit.yml`):**

```yaml
- name: Test CLI
  run: pnpm test:cli && pnpm test:cli:integration

- name: CLI coverage gate
  run: pnpm --filter @harpa/cli test:coverage --reporter=text --reporter=json-summary
  # Enforce ≥ 80% line coverage on apps/cli/src/
```

3. **Help-text drift gate:**

Add `scripts/check-cli-help-drift.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
pnpm --filter @harpa/cli build
node apps/cli/dist/index.js --help > /tmp/harpa-help.txt
git diff --exit-code apps/cli/src/__tests__/__snapshots__/help.test.ts.snap || {
  echo "CLI help text drift detected. Run 'pnpm --filter @harpa/cli test -u' to update snapshots."
  exit 1
}
```

Wire into root `pnpm lint`:

```json
{
  "scripts": {
    "lint": "turbo run lint && bash scripts/check-no-supabase.sh && ... && bash scripts/check-cli-help-drift.sh"
  }
}
```

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| OTP requires real Twilio in dev | High (breaks local dev) | Test mode (`TWILIO_LIVE=0`) uses fake code `000000` (already implemented in API). CLI integration tests inherit this. |
| Large file uploads (voice/document) | Medium (timeouts) | `files upload` helper uses streaming PUT via `node:fetch` + `fs.createReadStream()`. No in-memory buffer for files > 10 MB. |
| `openapi-fetch` types drift from runtime API | High (silent bugs) | Existing `scripts/check-spec-drift.sh` catches this for the API; CLI depends on `@harpa/api-contract`, so drift is compile-time error. |
| Exit codes inconsistent across commands | Medium (automation breaks) | `lib/error.ts` centralises mapping; property tests ensure every status range maps consistently. |
| JSON mode prints progress to stdout | High (breaks parsers) | All progress (`console.log`) is gated on `!options.json`; only the final result prints when `--json` is set. |
| Integration tests spawn real `harpa` process → slow | Medium (CI time) | Tests import command handlers directly (no `spawn`), call them as functions with mocked console. Faster, same coverage. |
| Missing token error not user-friendly | Low (UX) | Check `env.HARPA_TOKEN` at command entry, print clear message + example auth flow. Exit 3. |

## Phased implementation plan

12 commits, each ≈ one PR-sized unit with route group + tests + docs together. Dependencies between tasks noted.

### CLI.1 — Scaffold + env + client

**Scope:**
- Workspace setup (`apps/cli/package.json`, `tsconfig.json`)
- `lib/env.ts` (Zod schema for `HARPA_API_URL`, `HARPA_TOKEN`, `HARPA_DEBUG`, `HARPA_IDEMPOTENCY_KEY`)
- `lib/client.ts` (typed `openapi-fetch` factory)
- `src/index.ts` (citty root command, no subcommands yet)
- `lib/error.ts` (exit-code mapping, `printError`)
- Unit tests: `env.test.ts`, `error.test.ts`

**Commit:** `feat(cli): scaffold CLI workspace with env + typed client + error handling`

**Dependencies:** None. Can start immediately after reading this doc.

---

### CLI.2 — Auth commands

**Scope:**
- `commands/auth.ts`: `otp start`, `otp verify`, `logout`
- Human-readable output (no renderers needed — these are simple)
- `--raw` flag on `otp verify` (prints just the token)
- Integration test: `auth.integration.test.ts` (Testcontainers, reuse `setup-pg.ts`)

**Commit:** `feat(cli): auth commands (otp start, verify, logout) with integration tests`

**Dependencies:** CLI.1.

---

### CLI.3 — Me commands + renderers

**Scope:**
- `commands/me.ts`: `get`, `update`, `usage`
- `lib/render.ts`: `renderUser`, `renderUsage`
- `--json` flag support (global)
- Unit test: `render.test.ts` (snapshots for user/usage)
- Integration test: `me.integration.test.ts`

**Commit:** `feat(cli): me commands (get, update, usage) with renderers + tests`

**Dependencies:** CLI.2.

---

### CLI.4 — Projects commands

**Scope:**
- `commands/projects.ts`: `list`, `create`, `get`, `update`, `delete`
- `lib/render.ts`: `renderProject`, `renderProjectList`
- Pagination flags (`--cursor`, `--limit`)
- Integration test: `projects.integration.test.ts` (includes default-wiring test per Pitfall 13)

**Commit:** `feat(cli): projects commands (CRUD) with pagination + tests`

**Dependencies:** CLI.3.

---

### CLI.5 — Project members commands

**Scope:**
- `commands/projects.ts`: `members list`, `members add`, `members remove`
- `lib/render.ts`: `renderMember`, `renderMemberList`
- Integration test: extend `projects.integration.test.ts`

**Commit:** `feat(cli): project members commands (list, add, remove) with tests`

**Dependencies:** CLI.4.

---

### CLI.6 — Reports commands

**Scope:**
- `commands/reports.ts`: `list`, `create`, `get`, `update`, `delete`
- `lib/render.ts`: `renderReport`, `renderReportList`
- Pagination
- Integration test: `reports.integration.test.ts`

**Commit:** `feat(cli): reports CRUD commands with pagination + tests`

**Dependencies:** CLI.5.

---

### CLI.7 — Report AI commands (generate, finalize, regenerate, pdf)

**Scope:**
- `commands/reports.ts`: `generate`, `finalize`, `regenerate`, `pdf`
- `--idempotency-key` flag on `generate` / `regenerate`
- `lib/render.ts`: handle `Idempotent-Replay: true` in verbose mode
- Integration test: extend `reports.integration.test.ts` (uses fixture-mode AI)

**Commit:** `feat(cli): report AI commands (generate, finalize, regenerate, pdf) with idempotency + tests`

**Dependencies:** CLI.6.

---

### CLI.8 — Notes commands

**Scope:**
- `commands/notes.ts`: `list`, `create`, `update`, `delete`
- `lib/render.ts`: `renderNote`, `renderNoteList`
- Integration test: `notes.integration.test.ts`

**Commit:** `feat(cli): notes commands (list, create, update, delete) with tests`

**Dependencies:** CLI.7.

---

### CLI.9 — Files commands + upload helper

**Scope:**
- `commands/files.ts`: `presign`, `register`, `url`, `upload`
- `upload` helper: chains presign → streaming PUT (via `node:fetch` + `fs.createReadStream`) → register
- `--file <path>` flag
- Integration test: `files.integration.test.ts` (uses `FixtureStorage` from API tests)

**Commit:** `feat(cli): files commands (presign, register, url, upload helper) with tests`

**Dependencies:** CLI.8.

---

### CLI.10 — Voice commands

**Scope:**
- `commands/voice.ts`: `transcribe`, `summarize`
- `transcribe --file <path>` helper (chains upload → transcribe)
- Integration test: `voice.integration.test.ts` (fixture-mode AI)

**Commit:** `feat(cli): voice commands (transcribe, summarize) with upload helper + tests`

**Dependencies:** CLI.9.

---

### CLI.11 — Settings commands

**Scope:**
- `commands/settings.ts`: `ai get`, `ai update`
- `lib/render.ts`: `renderAiSettings`
- Integration test: `settings.integration.test.ts`

**Commit:** `feat(cli): settings commands (ai get, update) with tests`

**Dependencies:** CLI.10.

---

### CLI.12 — CI + docs + help snapshots

**Scope:**
- `.github/workflows/cli.yml` (or extend `unit.yml`)
- Root `package.json`: `pnpm harpa` alias
- `scripts/check-cli-help-drift.sh`
- `help.test.ts` (snapshot all `--help` outputs)
- Update `docs/v4/architecture.md` index with link to this doc
- Update root `README.md` with CLI usage example

**Commit:** `chore(cli): wire CI, root alias, help-drift gate, update docs`

**Dependencies:** CLI.11 (all commands must exist for help snapshots).

---

## Open questions

1. **Should `--idempotency-key` be auto-generated (UUID) if not provided?**
   - **Recommendation:** No. Leave it to the user. If they want idempotency, they provide the key. Auto-generating hides the semantics (the user might not realise retries are safe). Document the usage in help text.

2. **Should `files upload` / `voice transcribe --file` use a progress bar for large files?**
   - **Recommendation:** Not in v1. Keep stdout clean. Progress bars break `--json` mode and add complexity. Carve out to post-v1 if demand surfaces.

3. **Should the CLI support stdin for JSON input (e.g. `echo '{"name":"x"}' | harpa projects create --stdin`)?**
   - **Recommendation:** Not in v1. Flags are sufficient for all 37 routes. Stdin mode adds parsing complexity and help-text confusion. Carve out to post-v1.

4. **Should integration tests use `spawn` or direct function imports?**
   - **Recommendation:** Direct imports (faster, simpler mocking). One E2E smoke test (`help.test.ts`) uses `execSync` to prove the bin wiring works, but all other tests call command handlers as functions.

5. **Should `HARPA_API_URL` default to `http://localhost:8787` for dev convenience?**
   - **Recommendation:** No. Fail-fast if missing. Env is explicit per AGENTS.md rule #1. Users can set it in their shell profile or `.envrc` (direnv).

6. **Should the CLI vendor `packages/api/__tests__/setup-pg.ts` or import it directly?**
   - **Recommendation:** Import directly. Add `@harpa/api` as a devDependency of `@harpa/cli` so `setup-pg.ts` is available. No duplication. If `setup-pg.ts` later moves to a shared test package (e.g. `@harpa/test-utils`), update both imports at once.

---

## Summary

- **Package:** `apps/cli` (`@harpa/cli`), ESM-only, Node ≥20
- **Framework:** citty (minimal, TypeScript-first, nested commands)
- **Client:** `openapi-fetch` with types from `@harpa/api-contract` (drift-gated at compile time)
- **Env:** Zod-parsed `HARPA_API_URL`, `HARPA_TOKEN`, `HARPA_DEBUG`, `HARPA_IDEMPOTENCY_KEY`
- **Output:** Human-readable (via `lib/render.ts` + chalk) or `--json` (raw API JSON)
- **Errors:** Stderr, exit codes 0–7, `--verbose` shows headers + request ID
- **Commands:** All 37 OpenAPI routes covered (see table above)
- **Helpers:** `files upload --file`, `voice transcribe --file` (chain presign → PUT → transcribe)
- **Testing:** Unit (env, render, error) + integration (Testcontainers, reuse `setup-pg.ts`, fixture-mode AI/R2/Twilio)
- **CI:** `pnpm test:cli`, coverage gate (≥ 80%), help-drift gate, wired into root `pnpm lint`
- **Phased:** 12 commits (CLI.1–CLI.12), each = one route group + tests + docs

All 37 routes will be covered by implementation end. Ordered core-first (auth → me → projects → reports → notes → files → voice → settings) so AI + reports flow works early.

---

**Next step:** Worker subagent (or top-level coordinator) executes CLI.1–CLI.12 in order, one commit per task, tests + command together per Pitfall 1.
