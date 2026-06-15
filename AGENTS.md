# Project: harpa-pro (v4)

## Session startup

At the start of every session, call `memory:read_graph` to load any stored
project context. When the user shares preferences, decisions, or facts worth
retaining across sessions, call `memory:create_entities` / `memory:add_observations`
to persist them. Check memory before asking the user to re-explain something.

v4 rewrite of the harpa-pro mobile app and API. The previous attempt
lives at `../haru3-reports` (branch `mobile-v3`) and is the canonical
port source for screens — read JSX + Tailwind classes from there when
porting in P2/P3.

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
  roles (`SET LOCAL` from session claims) — see
  [`docs/v4/arch-auth-and-rls.md`](docs/v4/arch-auth-and-rls.md).
- **Auth:** [better-auth](https://www.better-auth.com) inside the
  Hono API — email-OTP via Resend, `@better-auth/expo` on mobile,
  `emailAndPassword` for a test-account smoke-test bypass.
  SIWA + Google Sign-In are next. See
  [`docs/v4/arch-auth-and-rls.md`](docs/v4/arch-auth-and-rls.md).
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
   **PR base defaults to `dev`.** Always open pull requests against
   `dev` unless the user explicitly asks for `main`. Never merge into
   `main` without a pull request and explicit instruction after required
   checks pass — `main` is production. A request such as "merge dev into
   main" means open a PR targeting `main`; it is not authorization to
   push directly, bypass required checks, or bypass branch protection.
   Never use bypass paths (including direct pushes to `main` or `dev`,
   `gh pr merge --admin`, `git push --force`, or `git push --no-verify`)
   unless the user explicitly authorizes a named emergency bypass. If
   GitHub reports a bypass, a PR has failing required checks, or the
   branch is stale, stop and ask — do not force the merge through.
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

## Scoped instructions

Area-specific rules live next to the code and load automatically:

- `.github/instructions/mobile.instructions.md` — Expo / NativeWind
  rules, fixture mode, EXPO_PUBLIC inlining.
- `.github/instructions/api.instructions.md` — Hono / Drizzle /
  per-request scope, default-wiring rule.
- `.github/instructions/docs.instructions.md` — doc style + the
  "docs in same PR" rule.

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
