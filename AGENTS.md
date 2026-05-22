# Project: harpa-pro (v4)

v4 rewrite of the harpa-pro mobile app and API. The previous attempt
(`../haru3-reports`, branch `mobile-v3`) is preserved under
[`docs/legacy-v3/`](docs/legacy-v3/) for historical context only.

**Read [`docs/v4/pitfalls.md`](docs/v4/pitfalls.md) before writing
code.** It captures what went wrong in v3 and the rules we adopt to
avoid repeating it. Also check [`docs/bugs/README.md`](docs/bugs/README.md)
before debugging anything that smells familiar — and add an entry
when you fix a recurring bug.

## Stack

- **Monorepo:** pnpm + Turbo. Workspaces under `apps/*` and `packages/*`.
- **Mobile:** React Native (Expo, dev-client + EAS) with Expo Router.
  Styling: **NativeWind v4** (Tailwind for RN).
- **API:** Hono REST API at `packages/api`, deployed to Fly.io.
  Drizzle ORM, Zod validation, OpenAPI-typed contract at
  `packages/api-contract`.
- **Database:** **Neon Postgres** (serverless, branched per PR).
  RLS-equivalent enforced in the API via per-request scoped Postgres
  roles (`SET LOCAL` from JWT claims) — see
  [`docs/v4/arch-auth-and-rls.md`](docs/v4/arch-auth-and-rls.md).
- **Auth:** **better-auth** (self-hosted in the Hono API). Phone OTP
  via Twilio Verify.
- **File storage:** Cloudflare R2 (S3-compatible). API mints signed
  URLs; mobile uploads direct to R2.
- **AI providers:** Kimi, OpenAI, Anthropic, Google, Z.AI, DeepSeek.
  All calls routed through `packages/ai-fixtures` for record/replay.
- **Tests:** Vitest (unit + integration), Testcontainers for the API,
  Maestro for mobile E2E, Playwright for the docs site.

## Hard rules (enforced by review + CI)

1. **Env vars asserted at boot.** Read env via `lib/env.ts`
   (Zod-parsed at app boot, fails fast on missing vars). Never use
   `process.env.EXPO_PUBLIC_*!` — enforced by lint.
2. **Conventional Commits, kept concise.**
   `feat|fix|chore|test|docs|refactor(scope): subject`. Default branch
   is `main`; pushes to `main` deploy production. Pushes to `dev`
   deploy to the dev environment (`harpa-pro-api-dev` on Fly + the
   `dev` Cloudflare Pages branch) — see
   [`docs/v4/arch-ops.md`](docs/v4/arch-ops.md).
3. **Docs in the same PR.** Behaviour, schema, deployment, or
   workflow change → matching doc update in the same commit.
4. **No `Alert.alert` for in-app dialogs.** Use `AppDialogSheet` or
   another themed primitive.
5. **Test the default wiring.** Every collaborator factory
   (`createTurnstileClient`, `createR2Client`, `createTwilioClient`,
   …) needs at least one integration test that exercises the route
   without stubbing it, asserting the real side-effect. DI stubs are
   for negative-path branches only. See
   [Pitfall 13](docs/v4/pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken).

## Mobile dev / fixture mode

- `pnpm ios` / `pnpm ios:mock` (run from repo root). `:mock` inlines
  `EXPO_PUBLIC_USE_FIXTURES=true`, returning canned API responses and
  replacing the iOS-simulator audio recorder with a "Save fixture
  voice note" stub that emits a canned `voice-sample.m4a` through
  the real upload pipeline + aggregator. See
  [`docs/v4/arch-voice-pipeline.md` §D6](docs/v4/arch-voice-pipeline.md#d6-fixture-mode-contract).
- `EXPO_PUBLIC_*` vars are inlined by Metro at bundle time — changing
  them requires a rebuild, not a JS reload.

## Long-running command output

Don't tail long-running or noisy commands (dev servers, builds, tests).
Redirect to a tmp file, grep what you need, then kill the process and
remove the file.

## Workspace dependencies

Add packages with `pnpm --filter <workspace> add <pkg>`, not from the
repo root. Hoisting is configured (`node-linker=hoisted`) for Expo
compatibility — verify before changing.

## Large features

Use the `architect` subagent to design anything that touches more
than one screen or route, and write the design as a doc under
`docs/v4/` before coding.

## Subagent prompts

Keep subagent prompts concise — aim for under ~200 words. Include
only the essential task, scope, and pointers to the files or docs
the agent needs (paths, not pasted contents). Do not restate the
contents of `AGENTS.md` or `docs/v4/*` — subagents read those
themselves. This overrides the default "provide comprehensive
context" guidance.
