# Per-page implementation prompt — template

> Reusable prompt for implementing or changing one v4 screen.
> Instantiate one file per screen at
> `docs/v4/prompts/p2-<name>.md` or `p3-<name>.md`, fill in the
> placeholders, hand it to a subagent (or run it inline).
>
> Use the relevant `docs/v4/design-*.md` or `docs/v4/plan-*.md`
> file as the specification source. If neither exists, use the
> current implementation and tests as the baseline. Add a
> task-specific design doc before making a design change.
> Historical screenshots and realignment notes are not acceptance
> sources (see [AGENTS.md](../../../AGENTS.md)).

---

## Header (fill in)

| Field | Value |
|---|---|
| Page name | `<name>` (e.g. `login`, `projects-list`) |
| Plan task | `P2.<n>` / `P3.<n>` |
| Specification | `docs/v4/design-<task>.md` or `docs/v4/plan-p<n>-<phase>.md` |
| Current route | `apps/mobile/app/<route>.tsx` |
| Current components | `apps/mobile/components/<paths>` |
| v4 body component | `apps/mobile/screens/<name>.tsx` |
| v4 real route | `apps/mobile/app/(auth\|app)/<route>.tsx` |
| Required primitives | `Card`, `Input`, `Button`, … (from `apps/mobile/components/primitives/`) |
| Required hooks (real route) | `useAuthSession`, generated React Query hooks, … |

## Read first

1. The relevant `design-*.md` or `plan-*.md` specification. If none
   exists, record that the current implementation and tests are the
   baseline.
2. `apps/mobile/app/<route>.tsx` — the current route and wiring, if
   the screen exists.
3. Any `components/**` it imports, recursively, until you reach
   primitives that already exist in `apps/mobile/components/primitives/`.
4. `apps/mobile/tailwind.config.js` — verify every class resolves.
   Add a token only when the specification requires it. Keep the
   current tokens when no task-specific spec exists. Do not add hex
   literals (`check-no-hex-colors.sh`).
5. The v4 [arch-mobile.md](../arch-mobile.md) §"Screens as
   props-driven bodies" so the `screens/` pattern is fresh.

## Build

1. **Body component** at `apps/mobile/screens/<name>.tsx`:
   - Implement the specification. If no task-specific spec exists,
     preserve the current JSX, NativeWind classes, and behaviour
     tests.
   - Add a task-specific design doc before making a design change.
   - All data, callbacks, and navigation params arrive as **typed
     props**. No API calls, no `useAuthSession`, no
     `expo-secure-store`, no `useRouter().push` for primary
     navigation (accept an `onNavigate` callback prop instead).
   - Modals, sheets, tabs, form-local state, and `goBack()` are
     allowed and expected to work in isolation — that is the point
     of the props-driven body.
   - No `Alert.alert` (rule #9). Use `AppDialogSheet`.
   - No `process.env.EXPO_PUBLIC_*!` (rule #6). Read via
     `lib/env.ts` if env is genuinely needed in the body (rare —
     usually env reads belong in the route).

2. **Real route** at `apps/mobile/app/(auth|app)/<route>.tsx`:
   - Imports the body component.
   - Wires real hooks (auth session, generated query hooks,
     navigation params) and passes them as props.
   - This is the only file that touches the network or secure store.

3. **Tailwind tokens.** If the design requires a class that does not
   resolve, extend `apps/mobile/tailwind.config.js` in this commit.

## Tests required this commit

- Snapshot test for the body at default mock props
  (`<name>.test.tsx`).
- Behaviour test for every interaction required by the screen
  (each tab switch, modal open/close, form-local state change,
  back-nav).
- No test that requires the real API, real auth, or real fixtures.
  Wiring tests land in P3 with the real route's data layer.

## Explicitly DEFERRED (do NOT add this commit)

- API calls, mutations, optimistic updates.
- Auth session reads / writes.
- Persistence (legend-state, AsyncStorage, secure-store).
- Fixture wiring beyond what the body needs as inert mock props.
- Maestro flows (those land alongside the data wiring in P3).

## Visual review

- Run `pnpm ios:mock` on the iOS simulator.
- Navigate to the screen via the real route.
- Compare the screen with its specification. If no task-specific spec
  exists, compare the current implementation and tests.
- Eyeball: layout, spacing, typography, colors, hit targets,
  modal presentation. Cosmetic drift is a P0 bug (Pitfall 3).

## Commit

```
feat(mobile): implement <name> screen (P<n>.<m>)
```

Body must include:
- Specification source, or a note that current code and tests are the
  baseline.
- Current route and component paths reviewed.
- Body / real route / dev mirror paths created.
- Test counts.
- `pnpm typecheck` + `pnpm lint` results.
- Any Tailwind tokens added and why.
- "Deferred to P3:" line listing the unwired data-layer pieces.
