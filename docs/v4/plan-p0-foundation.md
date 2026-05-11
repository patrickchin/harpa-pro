# P0 — Foundation

> Goal: every package compiles, every CI workflow runs (even if
> mostly empty), the auth flow lands a JWT, fixtures replay, and
> Neon branching works in CI. **No business logic yet.**

## Exit gate

- [ ] `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` all green at the repo root.
- [ ] `packages/ai-fixtures` ships with at least one recorded fixture (`transcribe.basic`) and the replay test is green.
- [ ] `packages/api` exposes `POST /auth/otp/start` + `POST /auth/otp/verify` + `GET /me` against a Twilio sandbox; integration test green.
- [ ] `withScopedConnection` works against Testcontainers Postgres; one paired scope test green.
- [ ] CI workflow `pr-preview.yml` creates a Neon branch, runs migrations, and tears it down on close.
- [ ] All grep-gates from [arch-testing.md](arch-testing.md) §"Removal verification gates" exist and pass.
- [ ] `apps/mobile` boots (blank screen) on iOS sim with `pnpm ios`.
- [ ] `apps/docs` builds.

## Tasks

### P0.1 Monorepo scaffold
- [ ] `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`.
- [ ] `node-linker=hoisted` (Expo compatibility).
- [ ] Root scripts: `dev`, `build`, `test`, `test:unit`, `lint`, `typecheck`, `gen:api`, `fixtures:record`, `db:branch:create`, `db:branch:delete`.
- [ ] Conventional Commits `commitlint` + Husky.
- [ ] Commit: `chore(repo): pnpm + turbo monorepo scaffold`.

### P0.2 `packages/api-contract`
- [ ] Empty Zod schemas placeholder + `openapi.ts` skeleton.
- [ ] `pnpm gen:types` produces `src/generated/types.ts`.
- [ ] Commit: `chore(contract): scaffold api-contract package`.

### P0.3 `packages/api`
- [ ] Hono app skeleton, request id middleware, error mapper.
- [ ] Drizzle config, `db/client.ts` (raw — guarded), `db/scope.ts`.
- [ ] `db/schema/auth.ts` (better-auth tables) + `db/schema/app.ts` (empty).
- [ ] First migration: scoped role + grants.
- [ ] Vitest config + Testcontainers helper (`__tests__/factories/`).
- [ ] One smoke test: `GET /healthz`.
- [ ] Commit: `chore(api): scaffold Hono + Drizzle + Testcontainers`.

### P0.4 better-auth + Twilio Verify
- [ ] Mount better-auth at `/auth/*`.
- [ ] OTP service wrapping Twilio Verify; `TWILIO_VERIFY_FAKE_CODE` bypass for tests.
- [ ] `GET /me` route.
- [ ] Integration test: start → verify → /me round trip (using sandbox).
- [ ] Commit: `feat(api): better-auth OTP flow with Twilio Verify`.

### P0.5 `packages/ai-fixtures`
- [ ] `createProvider({ vendor, fixtureMode, fixtureName })` API.
- [ ] OpenAI adapter (transcription stub via Whisper).
- [ ] `record` mode (real call) + `replay` mode (fixture lookup).
- [ ] Redaction module (phone/email/uuid/keys).
- [ ] One recorded fixture committed: `transcribe.basic`.
- [ ] Vitest test for replay; CI asserts `AI_FIXTURE_MODE=replay`.
- [ ] Commit: `feat(ai-fixtures): record + replay layer with first fixture`.

### P0.6 `apps/mobile` scaffold
- [ ] Expo project with NativeWind v4 wired (Babel plugin, Metro config, global.css).
- [ ] `tailwind.config.js` with placeholder tokens (real values in P2).
- [ ] `lib/env.ts` Zod-validated.
- [ ] `lib/uuid.ts` using `expo-crypto`.
- [ ] `lib/dialogs/useAppDialogSheet.ts` stub.
- [ ] ESLint config with all the lint guards (no Alert outside dialogs, no `process.env.EXPO_PUBLIC_*!`, no hex colors in components, no raw db, no unistyles).
- [ ] Vitest config (jsdom + react-test-renderer).
- [ ] Commit: `chore(mobile): Expo + NativeWind scaffold with env + lint guards`.

### P0.7 `apps/docs` scaffold
- [ ] Next.js docs site placeholder (will host in-app guides).
- [ ] Commit: `chore(docs): scaffold Next.js docs site`.

### P0.8 Infra scripts
- [ ] `infra/neon/branch.ts` — create/delete branches via Neon API.
- [ ] `infra/fly/` — placeholder `fly.toml`, deploy script.
- [ ] `infra/r2/bootstrap.ts` — bucket + lifecycle rules (idempotent).
- [ ] Commit: `chore(infra): Neon + Fly + R2 bootstrap scripts`.

### P0.9 Removal verification gates
- [ ] All `scripts/check-*.sh` from [arch-testing.md](arch-testing.md) §"Removal verification gates".
- [ ] Wire into `lint-typecheck.yml`.
- [ ] Commit: `chore(ci): add removal verification gate scripts`.

### P0.10 CI workflows
- [ ] `lint-typecheck.yml`, `unit.yml`, `api-integration.yml`, `contract.yml`, `mobile-build.yml`, `pr-preview.yml`, `visual-gate.yml` (skeleton — wired in P2), `e2e-maestro.yml` (skeleton — wired in P3), `p0-exit-gate.yml`.
- [ ] Commit: `chore(ci): bootstrap workflows`.

### P0.11 Docs sync
- [ ] `docs/v4/` cross-referenced from `AGENTS.md` ✅ (already done).
- [ ] `docs/bugs/README.md` — empty template ready for entries.
- [ ] Commit: `docs: bugs log + cross-link v4 docs`.
