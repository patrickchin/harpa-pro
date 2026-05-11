# P2 — Mobile Shell

> Goal: auth flow, navigation, NativeWind tokens locked, every shared
> primitive built and snapshot-tested, **and the visual-parity gate
> live**.
>
> See [Pitfall 3](pitfalls.md#pitfall-3--mobile-shell-drifted-from-the-visual-design)
> — P2 is the phase where v3 went off the rails.

## Exit gate (`p2-exit-gate.yml`)

- [ ] Auth flow (login → verify → onboarding) ships and matches `01-login.png`, `02b-verify.md`, `02-onboarding.png` at ≤ 2% diff.
- [ ] Projects list ships and matches `03-projects-list.png`.
- [ ] All primitives built with snapshot tests at ≥ 100% coverage:
      `Card`, `Input`, `Button`, `IconButton`, `ScreenHeader`,
      `EmptyState`, `Skeleton`, `AppDialogSheet`, `StatTile`.
- [ ] `tailwind.config.js` tokens locked, derived from per-page docs;
      no hex literals in `apps/mobile/components/**`.
- [ ] `lib/env.ts` Zod-parsed at boot; ESLint rule live.
- [ ] Generated React Query hooks for every endpoint
      (`pnpm gen:api && git diff --exit-code` clean).
- [ ] Maestro flow `auth-and-onboarding` green on iOS + Android with
      `:mock` fixtures.

## Tasks

### P2.1 Tailwind tokens + NativeWind setup
- [ ] Token table compiled from "Visual tokens" sections of all `docs/legacy-v3/realignment/pages/*.md`.
- [ ] `tailwind.config.js` ships every token; `global.css` imports.
- [ ] Lint guard `check-no-hex-colors.sh` passes.
- [ ] Commit: `feat(mobile): tailwind tokens locked from per-page specs`.

### P2.2 Primitives
- [ ] One commit per primitive: file + snapshot test + Storybook-style example test.
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
- [ ] `app/(auth)/login.tsx` matching `01-login.png`.
- [ ] `app/(auth)/verify.tsx` matching `02b-verify.md`. Single async flow, no `setTimeout` (Pitfall 5).
- [ ] `app/(auth)/onboarding.tsx` matching `02-onboarding.png`.
- [ ] Behaviour tests for each interaction listed in the page docs.
- [ ] Commits: `feat(mobile): <screen> matching design`.

### P2.6 App shell (`(app)/_layout.tsx`)
- [ ] Tab + stack navigation.
- [ ] Auth gate redirect.
- [ ] Providers wired: env, query, queue, dialogs, audio, sentry-stub.
- [ ] Commit: `feat(mobile): app shell with provider tree and auth gate`.

### P2.7 Projects list
- [ ] `app/(app)/projects/index.tsx` matching `03-projects-list.png`.
- [ ] Commit: `feat(mobile): projects list matching design`.

### P2.8 Visual gate live
- [ ] Maestro `take-screenshots` flow per current screen.
- [ ] `pnpm visual:diff` script + `visual-gate.yml` workflow.
- [ ] First baseline committed.
- [ ] Commit: `chore(ci): wire visual screenshot gate at 2% threshold`.

### P2.9 P2 exit gate
- [ ] All boxes ticked. Tag `v0.2.0-shell`.
