# 2026-05-13 — AppLayout hook-order crash on auth-gate flip (Pattern R3)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Cold-launching the app on the iOS simulator produced
`Rendered fewer hooks than expected. This may be caused by an
accidental early return statement.` in `AppLayout`, immediately
unmounted to the dev error overlay. Vitest stayed green —
no test re-rendered the layout across an auth-state transition.

**Root cause.** `apps/mobile/app/(app)/_layout.tsx` called
`useAuthSession()`, then on `loading` / `unauthenticated` returned
`<Redirect href={…} />` **before** `useCallback(handleBackPress)`
and `useEffect(BackHandler)` ran. The hook count therefore changed
when the gate flipped from `loading` (early return, 3 hooks) to
`authenticated` (no early return, 5 hooks) on the next render.

**Fix.** Moved every hook above the conditional return.
Added a regression test
`apps/mobile/__tests__/layouts/app-layout.test.tsx` that mounts
the layout with status `loading`, then re-renders with
`unauthenticated`, then `authenticated`, asserting the layout
never throws. Verified by `git stash`-ing the production fix and
re-running the test — it captures the exact
"Rendered fewer hooks" error message.

**Test.** `apps/mobile/__tests__/layouts/app-layout.test.tsx` —
specifically the "does not throw … when status flips" case. Three
companion cases assert the rendered output for each terminal
status.

**Pattern.** R3 (new — added to README).
