# P0 — Foundation

> **P0 complete (audited 2026-05-19).** All scaffolding shipped:
> monorepo, fixtures, Neon branching, auth (OTP), CI workflows,
> removal-verification gates, lint guards. Verified by code audit.
>
> Goal: every package compiles, every CI workflow runs (even if
> mostly empty), the auth flow lands a JWT, fixtures replay, and
> Neon branching works in CI. **No business logic yet.**

## Exit gate

- [x] `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` all green at the repo root.
- [x] `packages/ai-fixtures` ships with at least one recorded fixture (`transcribe.voice-1`) and the replay test is green.
- [x] `packages/api` exposes `POST /api/auth/email-otp/send-verification-otp` + `POST /api/auth/sign-in/email-otp` + `GET /me` via better-auth; integration test green.
- [x] `withScopedConnection` works against Testcontainers Postgres; one paired scope test green.
- [x] CI workflow `pr-preview.yml` creates a Neon branch, runs migrations, and tears it down on close.
- [x] All grep-gates from [arch-testing.md](arch-testing.md) §"Removal verification gates" exist and pass.
- [x] `apps/mobile` boots (blank screen) on iOS sim with `pnpm ios`.
- [x] `apps/docs` builds.

## Tasks

### P0.1 Monorepo scaffold
- [x] `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`.
- [x] `node-linker=hoisted` (Expo compatibility).
- [x] Root scripts: `dev`, `build`, `test`, `test:unit`, `lint`, `typecheck`, `gen:api`, `fixtures:record`, `db:branch:create`, `db:branch:delete`.
- [x] Conventional Commits `commitlint` + Husky.
- [x] Commit: `chore(repo): pnpm + turbo monorepo scaffold`.

### P0.2 `packages/api-contract`
- [x] Empty Zod schemas placeholder + `openapi.ts` skeleton.
- [x] `pnpm gen:types` produces `src/generated/types.ts`.
- [x] Commit: `chore(contract): scaffold api-contract package`.

### P0.3 `packages/api`
- [x] Hono app skeleton, request id middleware, error mapper.
- [x] Drizzle config, `db/client.ts` (raw — guarded), `db/scope.ts`.
- [x] `db/schema/auth.ts` (better-auth tables) + `db/schema/app.ts` (empty).
- [x] First migration: scoped role + grants.
- [x] Vitest config + Testcontainers helper (`__tests__/factories/`).
- [x] One smoke test: `GET /healthz`.
- [x] Commit: `chore(api): scaffold Hono + Drizzle + Testcontainers`.

### P0.4 better-auth + Resend email-OTP
- [x] Mount better-auth at `/api/auth/*`.
- [x] `emailOTP` plugin with Resend transport; `EMAIL_OTP_LIVE=0` bypasses real Resend in tests.
- [x] `GET /me` route.
- [x] Integration test: send-otp → sign-in-otp → /me round trip (using `EMAIL_OTP_LIVE=0`).
- [x] Commit: `feat(api): better-auth email-OTP flow with Resend`.

### P0.5 `packages/ai-fixtures`
- [x] `createProvider({ vendor, fixtureMode, fixtureName })` API.
- [x] OpenAI adapter (transcription stub via Whisper).
- [x] `record` mode (real call) + `replay` mode (fixture lookup).
- [x] Redaction module (phone/email/uuid/keys).
- [x] One recorded fixture committed: `transcribe.voice-1`.
- [x] Vitest test for replay; CI asserts `AI_FIXTURE_MODE=replay`.
- [x] Commit: `feat(ai-fixtures): record + replay layer with first fixture`.

### P0.6 `apps/mobile` scaffold
- [x] Expo project with NativeWind v4 wired (Babel plugin, Metro config, global.css).
- [x] `tailwind.config.js` with placeholder tokens (real values in P2).
- [x] `lib/env.ts` Zod-validated.
- [x] `lib/uuid.ts` using `expo-crypto`.
- [x] `lib/dialogs/useAppDialogSheet.ts` stub.
- [x] ESLint config with all the lint guards (no Alert outside dialogs, no `process.env.EXPO_PUBLIC_*!`, no hex colors in components, no raw db, no unistyles).
- [x] Vitest config (jsdom + react-test-renderer).
- [x] Commit: `chore(mobile): Expo + NativeWind scaffold with env + lint guards`.

### P0.7 `apps/docs` scaffold
- [x] Next.js docs site placeholder (will host in-app guides).
- [x] Commit: `chore(docs): scaffold Next.js docs site`.

### P0.8 Infra scripts
- [x] `infra/neon/branch.ts` — create/delete branches via Neon API.
- [x] `infra/fly/` — placeholder `fly.toml`, deploy script.
- [x] `infra/r2/bootstrap.ts` — bucket + lifecycle rules (idempotent).
- [x] Commit: `chore(infra): Neon + Fly + R2 bootstrap scripts`.

### P0.9 Removal verification gates
- [x] All `scripts/check-*.sh` from [arch-testing.md](arch-testing.md) §"Removal verification gates".
- [x] Wire into `lint-typecheck.yml`.
- [x] Commit: `chore(ci): add removal verification gate scripts`.

### P0.10 CI workflows
- [x] `lint-typecheck.yml`, `unit.yml`, `api-integration.yml`, `pr-preview.yml`. (Mobile/E2E/contract/visual-gate workflows are added back when their phase actually starts — see arch-testing.md.)
- [x] Commit: `chore(ci): bootstrap workflows`.

### P0.11 Docs sync
- [x] `docs/v4/` cross-referenced from `AGENTS.md` ✅ (already done).
- [x] `docs/bugs/README.md` — empty template ready for entries.
- [x] Commit: `docs: bugs log + cross-link v4 docs`.
