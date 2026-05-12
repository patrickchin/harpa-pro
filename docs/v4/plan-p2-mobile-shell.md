# P2 — Mobile Shell

> Goal: auth flow, navigation, NativeWind tokens locked, every shared
> primitive built and snapshot-tested, **and the dev-gallery live so
> every shipped screen can be viewed instantly without auth/API**.
>
> See [Pitfall 3](pitfalls.md#pitfall-3--mobile-shell-drifted-from-the-visual-design)
> — P2 is the phase where v3 went off the rails. v4 avoids that by
> porting JSX directly from `../haru3-reports/apps/mobile@dev` (both
> sides are NativeWind v4) and reviewing visually by hand against
> the canonical source.

## Exit gate (`p2-exit-gate.yml`)

- [ ] Auth flow (login → verify → onboarding) ported from canonical
      source and reviewed manually.
- [ ] Projects list ported and reviewed manually.
- [ ] All primitives built with snapshot tests at ≥ 100% coverage:
      `Card`, `Input`, `Button`, `IconButton`, `ScreenHeader`,
      `EmptyState`, `Skeleton`, `AppDialogSheet`, `StatTile`.
- [ ] `tailwind.config.js` tokens locked, derived from the canonical
      source's `tailwind.config.js`; no hex literals in
      `apps/mobile/components/**`.
- [ ] `lib/env.ts` Zod-parsed at boot; ESLint rule live.
- [ ] Generated React Query hooks for every endpoint
      (`pnpm gen:api && git diff --exit-code` clean).
- [ ] Every shipped screen has a body component in
      `apps/mobile/screens/<name>.tsx` plus two routes wrapping it:
      the real route under `(auth)/` or `(app)/`, and a
      `(dev)/<name>.tsx` mirror with mock props.
- [ ] Dev-gallery index at `app/(dev)/index.tsx` lists every screen
      with tap-through navigation. Mounted only in dev / `:mock`
      builds (never in production).

## Tasks

### P2.0a Per-page prompt template + canonical source precedence
- [ ] `docs/v4/prompts/page-template.md` — reusable per-screen prompt
      (canonical source path, primitives to use, dual-route + body
      component pattern, behaviour-only scope, deferred wiring).
- [ ] One-paragraph note in this file's header: canonical port source
      is `../haru3-reports/apps/mobile@dev`. Screenshots, realignment
      docs, and the source dump are explicitly **not** used.
- [ ] Commit: `docs(plan): P2.0a per-page prompt template + canonical source precedence`.

### P2.0b Dev gallery + screens/ pattern
- [ ] `apps/mobile/screens/` directory established (one body component
      per screen; props-driven, no API/auth dependencies inside).
- [ ] `app/(dev)/_layout.tsx` + `app/(dev)/index.tsx` — gallery
      listing every body component the app ships, each with canned
      mock props. Tap-through pushes the real route in dev mode.
- [ ] Gallery + dev routes guarded by `__DEV__ || env.EXPO_PUBLIC_USE_FIXTURES`
      so they never reach a production bundle.
- [ ] Snapshot test for the empty gallery skeleton.
- [ ] Documented in [arch-mobile.md](arch-mobile.md) §"Dev gallery".
- [ ] Commit: `feat(mobile): P2.0b dev gallery scaffold + screens/ body-component pattern`.

### P2.1 Tailwind tokens + NativeWind setup
- [ ] Token table copied from `../haru3-reports/apps/mobile/tailwind.config.js`.
- [ ] `tailwind.config.js` ships every token; `global.css` imports.
- [ ] Lint guard `check-no-hex-colors.sh` passes.
- [ ] Commit: `feat(mobile): tailwind tokens locked from canonical port source`.

### P2.2 Primitives
- [ ] One commit per primitive: file + snapshot test + dev-gallery row.
- [ ] `IconButton` standardised early (Pitfall in v3: `48c5dee`).
- [ ] `Input` centred-text + caret behaviour verified (Pitfall: `1ec0fc8`).
- [ ] `ScreenHeader` top padding correct (Pitfall: `db0b97c`).
- [ ] `AppDialogSheet` is the only dialog primitive — Alert lint guard active.
- [ ] Commit per primitive: `feat(mobile): <Name> primitive with snapshot tests`.

### P2.3 API client + generated hooks
- [ ] `lib/api/client.ts` (auth header, error mapping, typed via api-contract).
- [ ] `lib/api/hooks.ts` generated (`pnpm gen:api`).
- [ ] `lib/api/invalidation.ts` central rules + coverage test.
- [ ] Commit: `feat(mobile): typed API client + generated React Query hooks`.

### P2.4 Auth session + secure store
- [ ] `useAuthSession` (mirrors `expo-secure-store`).
- [ ] Token refresh on activity.
- [ ] On 401, sign out + redirect.
- [ ] Commit: `feat(mobile): auth session with secure-store + auto sign-out on 401`.

### P2.5 Auth screens (login / verify / onboarding)
- [ ] `screens/login.tsx`, `screens/verify.tsx`, `screens/onboarding.tsx`
      bodies ported from `../haru3-reports/apps/mobile/app/`.
- [ ] Real routes: `app/(auth)/{login,verify,onboarding}.tsx`.
- [ ] Dev mirrors: `app/(dev)/{login,verify,onboarding}.tsx` with mock props.
- [ ] `verify` uses a single async flow, no `setTimeout` (Pitfall 5).
- [ ] Behaviour tests for each interaction the canonical source exercises.
- [ ] Commits: `feat(mobile): <screen> ported from canonical source`.

### P2.6 App shell (`(app)/_layout.tsx`)
- [ ] Tab + stack navigation.
- [ ] Auth gate redirect.
- [ ] Providers wired: env, query, queue, dialogs, audio, sentry-stub.
- [ ] Commit: `feat(mobile): app shell with provider tree and auth gate`.

### P2.7 Projects list
- [ ] `screens/projects-list.tsx` ported from
      `../haru3-reports/apps/mobile/app/(tabs)/projects.tsx`.
- [ ] Real route: `app/(app)/projects/index.tsx`.
- [ ] Dev mirror: `app/(dev)/projects.tsx` with mock data.
- [ ] Commit: `feat(mobile): projects list ported from canonical source`.

### P2.8 P2 exit gate
- [ ] All boxes ticked. Tag `v0.2.0-shell`.
