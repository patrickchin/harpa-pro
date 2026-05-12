# Continue P2 — Phase B (P2.3 → P2.8)

## Where we are

Phase A of P2 is complete on `dev`:

- P2.0a, P2.0b, P2.1, P2.2 all shipped (see [`plan-p2-mobile-shell.md`](../plan-p2-mobile-shell.md)).
- All nine primitives live with snapshot tests + dev-gallery rows.
- iOS bundling works end-to-end; gallery reachable at `/(dev)` in
  the simulator.
- Mobile test suite: 12 files / 50 tests green. typecheck + lint
  + check-no-hex-colors + check-no-alert-alert all clean.

Read [`AGENTS.md`](../../../AGENTS.md), [`docs/v4/pitfalls.md`](../pitfalls.md),
and [`docs/v4/plan-p2-mobile-shell.md`](../plan-p2-mobile-shell.md) before
writing any code. **Hard rule #1 (canonical port source)** governs every
remaining task: JSX + Tailwind classes copy directly from
`../haru3-reports/apps/mobile` on branch `dev`. Only the data layer
changes (legacy Supabase → v4 API contract).

## Tasks (in order, one commit per task minimum)

### P2.3 — API client + generated React Query hooks
- Build `apps/mobile/lib/api/client.ts`: typed fetch wrapper that
  reads `EXPO_PUBLIC_API_URL` via `lib/env.ts`, attaches the bearer
  token from the auth session (stub the getter for now — real wiring
  in P2.4), and maps the API error envelope (`{ error: { code, message,
  requestId } }` from `packages/api`) to a typed `ApiError`.
- Generate `lib/api/hooks.ts` from the OpenAPI spec at
  `packages/api-contract/openapi.json`. Pick a generator
  (`openapi-react-query-codegen`, `orval`, or `swagger-typescript-api`)
  and wire `pnpm gen:api` so it runs the generator and writes the file.
  Add `gen:api` to the root `package.json` scripts. Acceptance: every
  endpoint in the OpenAPI spec has a typed query/mutation hook.
- `lib/api/invalidation.ts`: central rules mapping mutation → query
  keys to invalidate (e.g. `createReport` → `['reports']`). Cover
  with a unit test that walks every generated mutation and asserts
  it has at least one invalidation rule (or an explicit "no
  invalidation needed" allow-list entry).
- Commit: `feat(mobile): typed API client + generated React Query hooks`.

### P2.4 — Auth session + secure store
- `apps/mobile/lib/auth/session.ts` + `useAuthSession` hook.
- Persist `{ accessToken, refreshToken, expiresAt }` via `expo-secure-store`.
- Auto-refresh on activity (debounced); on 401 from the API client,
  call `signOut()` and redirect to `(auth)/login`.
- Tests: secure-store mock; 401 → signOut path; refresh debounce.
- Commit: `feat(mobile): auth session with secure-store + auto sign-out on 401`.

### P2.5 — Auth screens (login / verify / onboarding)
For each of the three screens, follow [`page-template.md`](page-template.md):

1. Open the canonical source under `../haru3-reports/apps/mobile/app/`
   for that screen. Read it end-to-end before porting.
2. Create `apps/mobile/screens/<name>.tsx` — pure body component,
   props-driven, no API or auth deps inside.
3. Real route at `app/(auth)/<name>.tsx` (thin wrapper that pulls
   data + passes props).
4. Dev mirror at `app/(dev)/<name>.tsx` with mock props + a registry
   entry in `app/(dev)/registry.ts`.
5. Behaviour tests for each interaction the canonical source exercises.
6. **`verify` MUST use a single async flow — no `setTimeout`** (Pitfall 5).
7. Visual review: run `pnpm --filter @harpa/mobile ios`, navigate to
   `/(dev)/<name>`, side-by-side with the canonical screen running
   from haru3-reports. Cosmetic drift = P0 bug.
8. Commit per screen: `feat(mobile): <screen> ported from canonical source`.

### P2.6 — App shell `(app)/_layout.tsx`
- Tab + stack navigation matching the canonical source's
  `app/(tabs)/_layout.tsx` and root layout.
- Auth gate: redirect to `(auth)/login` if no session; otherwise render.
- Provider tree (in this order, top to bottom): env, QueryClientProvider,
  queue provider stub, AppDialogSheet host, audio provider stub,
  sentry-stub. Each provider that doesn't have a real implementation
  yet is a typed no-op stub — record the stubs in
  [`docs/v4/arch-mobile.md`](../arch-mobile.md).
- Commit: `feat(mobile): app shell with provider tree and auth gate`.

### P2.7 — Projects list
- Port `../haru3-reports/apps/mobile/app/(tabs)/projects.tsx`.
- `screens/projects-list.tsx` body, `app/(app)/projects/index.tsx`
  real route, `app/(dev)/projects.tsx` dev mirror with mock data.
- Wire the real route to the generated `useListProjectsQuery` hook
  from P2.3.
- Commit: `feat(mobile): projects list ported from canonical source`.

### P2.8 — P2 exit gate
- Tick every box in [`plan-p2-mobile-shell.md`](../plan-p2-mobile-shell.md)
  §"Exit gate".
- Tag `v0.2.0-shell`.
- Commit: `docs(plan): close P2 — exit gate verified, tag v0.2.0-shell`.

## Hard constraints (re-read before each task)

1. **Canonical port source only.** No realignment docs, screenshots,
   or source dump. JSX + Tailwind classes copy across; only the data
   layer changes.
2. **No Supabase imports** — `check-no-supabase.sh` must stay green.
3. **NativeWind only** — no Unistyles, ever.
4. **No `Alert.alert`** — use `AppDialogSheet`.
5. **Env via `lib/env.ts`** — never `process.env.EXPO_PUBLIC_*!`.
6. **Conventional Commits**, default branch `dev`, never push `main`.
7. **No real LLM calls in tests** — fixtures only (P2.3 hooks are
   thin client wrappers; the API itself enforces this).
8. **Docs in the same PR** — any architectural change updates the
   matching `docs/v4/arch-*.md` in the same commit.

## Pause points

After P2.3, P2.4, and P2.6, **STOP** and report back with:
- list of files added/changed,
- test count,
- a screenshot from the simulator if a screen is now viewable.

Do not chain through to the next task without explicit "continue".
