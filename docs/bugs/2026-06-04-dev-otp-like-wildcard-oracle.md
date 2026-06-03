# 2026-06-04 — `/api/dev/last-otp` LIKE-wildcard oracle (new pattern R8)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** `POST /api/dev/last-otp` (and the in-process CLI / journey
helpers that mirror it — `apps/cli/src/__tests__/_helpers.ts`,
`packages/api/src/__tests__/journeys/_login.ts`) looked up the latest
OTP with `WHERE identifier LIKE '%' || $1 || '%'`. On any deploy where
the route is mounted (dev, PR previews, and — if `HARPAPRO_PR_BUILD`
were ever set on prod by mistake — production), a single request with
`{"email":"%"}` returns the most recent OTP issued to **any** user, in
the right time window for that OTP to still be valid. A registered
user's session is fully takeoverable by anyone who can reach the
endpoint. The same flaw also produces a substring oracle:
`alice@e2e.harpapro.com` matches a verification row for
`bob+alice@e2e.harpapro.com.evil`, so a malicious sign-in attempt can
forge a row that an honest test query then surfaces.

**Root cause.** `LIKE` with a parameter that flows straight from a
JSON body is a SQL wildcard injection vector even though the SQL is
parameterised — parameterisation prevents *syntactic* injection, not
*semantic* injection through wildcard meta-characters in the value.
The handler also leaned on `NODE_ENV !== 'production'` as its only
gate, so a single mis-set env var would expose the wildcard query to
the public internet.

**Fix.** Three commits on PR #126:

- `feat(api): add DEV_OTP_TOKEN env + harden dev/last-otp` — rewrites
  `routes/dev.ts` to require `x-dev-otp-token` (constant-time compare)
  + `@e2e.harpapro.com` regex + exact identifier match
  (`identifier = 'sign-in-otp-' || $1`) + audit log; gates the mount on
  `env.DEV_OTP_TOKEN` being set; env-Zod refines reject the token on
  real prod.
- `fix(test): exact identifier match in CLI/journey OTP helpers` —
  `_helpers.ts` and `_login.ts` use exact match too.
- `chore(test): rename test emails to @e2e.harpapro.com` —
  belt-and-braces against the new domain regex.

**Test.** `packages/api/src/__tests__/dev.integration.test.ts` covers
all reject paths against a real Postgres: missing header, wrong token
(single-byte diff), `attacker@evil.com`, root-domain
`attacker@harpapro.com`, suffix `bad@e2e.harpapro.com.evil.com`,
wildcard `%@e2e.harpapro.com`, and route-absent when `DEV_OTP_TOKEN` is
unset (`vi.resetModules()` + dynamic import).
`apps/cli/src/__tests__/_helpers.integration.test.ts` proves alice's
helper lookup never returns bob's row even when both have outstanding
OTPs.

**Pattern.** New pattern **R8 — Wildcard injection through `LIKE` on
user-supplied input** (added to README). Applies anywhere a server
helper does `LIKE '%' || $1 || '%'` against attacker-controllable
input, including dev / test / introspection routes that feel "safe"
because they're behind a NODE_ENV gate. Mitigation: always exact-match
when you can construct the full key server-side; if you genuinely
need fuzzy match, escape `%` and `_` in the input before concatenation
and treat the route as if it were public.
