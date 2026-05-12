# Project: harpa-pro (v4 — full rewrite)

> This is a **fresh rewrite** of the harpa-pro mobile app and API, starting
> from an empty repo. The previous attempt lives at
> `../haru3-reports` on the `mobile-v3` branch and is preserved as
> reference under [`docs/legacy-v3/`](docs/legacy-v3/) (architecture
> docs, plans, realignment investigation, mobile-old source dump,
> screenshots).
>
> **Read [`docs/v4/pitfalls.md`](docs/v4/pitfalls.md) before writing
> any code.** It documents what went wrong in the v3 attempt and the
> rules we adopt this time around to avoid repeating them.

## Stack (v4)

- **Monorepo:** pnpm + Turbo. Workspaces under `apps/*` and `packages/*`.
- **Mobile:** React Native (Expo, dev-client + EAS). Expo Router.
  **Styling: NativeWind v4** (Tailwind for RN). _Not Unistyles._
- **API:** Hono REST API at `packages/api`, deployed to Fly.io.
  Drizzle ORM, Zod validation, OpenAPI-typed contract at
  `packages/api-contract`.
- **Database:** **Neon Postgres** (serverless Postgres with branching).
  Each PR gets its own DB branch via Neon's branching API.
  RLS-equivalent enforced **in the API layer** via per-request scoped
  connections (a Postgres role is `SET LOCAL` per request from the
  user's JWT claims) — see [`docs/v4/arch-auth-and-rls.md`](docs/v4/arch-auth-and-rls.md).
- **Auth:** **better-auth** (self-hosted in the Hono API). Phone OTP
  (Twilio Verify) is the primary flow, matching the v3 UX.
- **File storage:** Cloudflare R2 (S3-compatible). Signed URLs minted
  by the API; mobile uploads direct to R2.
- **AI providers:** Kimi, OpenAI, Anthropic, Google, Z.AI, DeepSeek.
  Routed through the API. **All calls go through a fixture layer** that
  records/replays canned responses for tests and `:mock` builds.
- **Tests:** Vitest (unit + integration), Testcontainers for the API
  against a real Postgres, Maestro for mobile E2E, Playwright for the
  docs site.
- **Docs site:** `apps/docs` (in-app guides + visual reference).

## What we do NOT use (deliberate)

- ❌ **Supabase** (auth, db, storage, edge functions, RLS) — fully
  removed. Auth + storage + db are now better-auth + R2 + Neon.
- ❌ **Unistyles** — we are staying on NativeWind. Do not add Unistyles.
- ❌ **Supabase RLS** — RLS is enforced in the API via per-request
  scoped Postgres roles + integration tests, not at the DB ACL layer.

## Subagents

Use specialized subagents proactively rather than doing everything inline:

- `Explore` — fast read-only codebase Q&A (auto-available).
- `architect` — design large features and refactors before coding.
- `database-reviewer` — Postgres / Drizzle / per-request-scope work.
- `tdd-guide` — write tests first; enforce 80%+ line coverage.
- `code-reviewer` — review immediately after writing/modifying code.
- `security-reviewer` — anything touching auth, scoped roles, user
  input, signed URLs, or sensitive data.
- `e2e-runner` — Maestro / Playwright work.
- `build-error-resolver` — TypeScript / turbo build failures.
- `doc-updater` — keep docs in sync with code (in the same commit).

## Skills

Project-specific skills live in `./skills/` and auto-load: `api-design`,
`backend-patterns`, `database-migrations`, `e2e-testing`,
`frontend-patterns`, `postgres-patterns`, `coding-standards`,
`tdd-workflow`, `verification-loop`, `strategic-compact`,
`security-review`, `eval-harness`, `frontend-slides`. The model
auto-invokes them based on context — no need to specify.

## Hard rules (enforced by review + CI)

These rules exist because they were violated in the v3 attempt and
caused weeks of rework. See [`docs/v4/pitfalls.md`](docs/v4/pitfalls.md)
for the why.

1. **Canonical port source (P2 onwards).** Every screen we ship is a
   direct port of the matching screen in `../haru3-reports/apps/mobile`
   on branch `dev` (Expo + NativeWind v4 — no Unistyles to translate).
   JSX structure and Tailwind classes copy across; only the data layer
   changes (legacy Supabase → v4 API contract). Visual review is manual
   against that source — there is no automated screenshot-diff gate.
   Cosmetic drift is a P0 bug, not "polish for later".
2. **API tests-first (P1 onwards).** No API route lands without:
   (a) Zod request + response schemas in `api-contract`,
   (b) a Testcontainers integration test against real Postgres,
   (c) a contract test verifying the OpenAPI spec.
   Coverage gate for `packages/api`: **≥ 90% lines** at the end of P1.
3. **LLM fixtures from day 1.** Every AI provider call MUST go
   through `packages/ai-fixtures`. Tests use replay mode; `:mock`
   builds use a fixed fixture set. Hitting a real provider in tests
   is a CI failure. New endpoints record fixtures via
   `pnpm fixtures:record <name>` once, then commit them.
4. **No Supabase imports.** A grep gate (`scripts/check-no-supabase.sh`)
   fails CI if anything under `apps/`, `packages/`, or `infra/`
   imports `@supabase/*` or references `supabase.*` URLs.
5. **NativeWind only.** A grep gate fails CI if `react-native-unistyles`
   appears anywhere outside `docs/legacy-v3/`.
6. **No EXPO_PUBLIC_ non-null assertions.** Use the centralised
   `lib/env.ts` validator (Zod-parsed at app boot). Enforced by lint
   rule `no-restricted-syntax` for `process.env.EXPO_PUBLIC_*!`.
7. **Conventional Commits.** `feat(scope): …`, `fix(scope): …`,
   `chore(scope): …`, `test(scope): …`, `docs(scope): …`,
   `refactor(scope): …`. Default branch is `dev`. Never push to `main`.
8. **Docs in the same PR.** Behaviour, schema, deployment, or workflow
   change → corresponding doc update in the same commit. The
   `doc-updater` agent handles this.
9. **No `Alert.alert` for in-app dialogs.** Use `AppDialogSheet` or
   another themed primitive so styling matches the app.

## Recurring bugs log

Before debugging a flaky test, "intermittent" UI regression, or
anything that smells familiar, read [`docs/bugs/README.md`](docs/bugs/README.md).
When you ship a fix for a bug that recurred, that almost-recurred,
or that only got caught by manual QA / E2E despite green tests, add
an entry to the same file in the same PR.

## Commands (target — wire up during P0)

- All tests:        `pnpm test`
- Mobile (Vitest):  `pnpm test:mobile`
- API (Vitest):     `pnpm test:api`
- API integration:  `pnpm test:api:integration` (Testcontainers)
- Docs site E2E:    `pnpm test:docs:e2e` (Playwright)
- LLM fixtures:     `pnpm fixtures:record <name>` /
                    `pnpm fixtures:replay`
- Neon branch:      `pnpm db:branch:create <pr-number>` /
                    `pnpm db:branch:delete <pr-number>`
- Type-check all:   `pnpm typecheck`
- Lint all:         `pnpm lint`

## Mobile dev / fixture mode

- `pnpm ios` / `pnpm ios:mock` (run from repo root). `:mock` builds
  inline `EXPO_PUBLIC_USE_FIXTURES=true`, which makes the API return
  canned responses (transcription, summary, generate) and stubs the
  iOS-simulator audio recorder.
- `EXPO_PUBLIC_*` vars are inlined by Metro at bundle time — changing
  them requires a rebuild, not a JS reload.
- Read the env via `lib/env.ts` only. Never `process.env.EXPO_PUBLIC_*!`.

## Database / migrations

Migrations are Drizzle-generated SQL in `packages/api/migrations/`.
Filenames use the timestamp pattern `YYYYMMDDHHmm_description.sql`.
PR previews run migrations on a fresh Neon branch; integration tests
run them against a Testcontainers Postgres. **Schema change MUST
ship with:**

- a Drizzle schema update,
- a generated SQL migration,
- a per-request-scope test in `packages/api/src/__tests__/scope/*.test.ts`
  proving the new table/column is only readable/writable by the
  intended actor.

## Workspace dependencies

Add packages with `pnpm --filter <workspace> add <pkg>`, not from the
repo root. Hoisting is configured (`node-linker=hoisted`) for Expo
compatibility — verify before changing.

## Large features

Before implementing a large feature, use the `architect` subagent to
design it first. Write the design as a doc under `docs/v4/` if it
will affect more than one screen or one route.

## Reference: porting from the v3 attempt

**Canonical port source (use this for P2/P3 screen work):**

- `../haru3-reports/apps/mobile` on branch `dev` — Expo SDK 55,
  expo-router, NativeWind v4. Read JSX + Tailwind classes directly
  out of `app/` and `components/` and port them in. No Unistyles to
  translate.

**Historical only — DO NOT use as a port source:**

- [`docs/legacy-v3/`](docs/legacy-v3/) — kept for historical context.
- [`docs/legacy-v3/realignment/pages/`](docs/legacy-v3/realignment/pages/)
  — superseded by the canonical port source above.
- [`docs/legacy-v3/_work/mobile-old-source-dump.md`](docs/legacy-v3/_work/mobile-old-source-dump.md)
  — superseded; read live source out of `../haru3-reports/apps/mobile`
  instead of the dump.
- [`docs/legacy-v3/screenshots/`](docs/legacy-v3/screenshots/) —
  not used. Visual review is manual against the running canonical
  port source.
- `../haru3-reports/apps/mobile-v3` (and `mobile-v3-2`) — used
  Unistyles, banned by hard rule #5. Ignore.
