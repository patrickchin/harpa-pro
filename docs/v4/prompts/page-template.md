# Per-page port prompt — template

> Reusable prompt for porting one screen from the canonical source
> into v4. Instantiate one file per screen at
> `docs/v4/prompts/p2-<name>.md` or `p3-<name>.md`, fill in the
> placeholders, hand it to a subagent (or run it inline).
>
> The acceptance contract is the matching screen in
> `../haru3-reports/apps/mobile` on branch `dev` (Expo SDK 55,
> expo-router, NativeWind v4). JSX + Tailwind classes copy across
> with no translation. Screenshots, `docs/legacy-v3/realignment/`,
> and `docs/legacy-v3/_work/mobile-old-source-dump.md` are **not**
> used as port sources (see [AGENTS.md](../../../AGENTS.md) hard
> rule #1).

---

## Header (fill in)

| Field | Value |
|---|---|
| Page name | `<name>` (e.g. `login`, `projects-list`) |
| Plan task | `P2.<n>` / `P3.<n>` |
| Canonical source — route | `../haru3-reports/apps/mobile/app/<route>.tsx` |
| Canonical source — components | `../haru3-reports/apps/mobile/components/<paths>` |
| v4 body component | `apps/mobile/screens/<name>.tsx` |
| v4 real route | `apps/mobile/app/(auth\|app)/<route>.tsx` |
| v4 dev mirror | `apps/mobile/app/(dev)/<name>.tsx` |
| Mock props for `(dev)` | inline literal in the dev mirror |
| Required primitives | `Card`, `Input`, `Button`, … (from `apps/mobile/components/primitives/`) |
| Required hooks (real route) | `useAuthSession`, generated React Query hooks, … |

## Read first

1. `../haru3-reports/apps/mobile/app/<route>.tsx` — the canonical JSX.
2. Any `components/**` it imports, recursively, until you reach
   primitives that already exist in `apps/mobile/components/primitives/`.
3. `../haru3-reports/apps/mobile/tailwind.config.js` — verify every
   class used resolves against tokens already present in
   `apps/mobile/tailwind.config.js`. Add any missing token to the
   v4 config in the same commit (no hex literals — `check-no-hex-colors.sh`).
4. The v4 [arch-mobile.md](../arch-mobile.md) §"Dev gallery" so the
   `screens/` + dual-route pattern is fresh.

## Build

1. **Body component** at `apps/mobile/screens/<name>.tsx`:
   - Port JSX + Tailwind classes verbatim from the canonical source.
   - All data, callbacks, and navigation params arrive as **typed
     props**. No API calls, no `useAuthSession`, no
     `expo-secure-store`, no `useRouter().push` for primary
     navigation (accept an `onNavigate` callback prop instead).
   - Modals, sheets, tabs, form-local state, and `goBack()` are
     allowed and expected to work — that is the point of the dev
     gallery.
   - No `Alert.alert` (rule #9). Use `AppDialogSheet`.
   - No `process.env.EXPO_PUBLIC_*!` (rule #6). Read via
     `lib/env.ts` if env is genuinely needed in the body (rare —
     usually env reads belong in the route).

2. **Real route** at `apps/mobile/app/(auth|app)/<route>.tsx`:
   - Imports the body component.
   - Wires real hooks (auth session, generated query hooks,
     navigation params) and passes them as props.
   - This is the only file that touches the network or secure store.

3. **Dev mirror** at `apps/mobile/app/(dev)/<name>.tsx`:
   - Imports the same body component.
   - Passes hand-crafted mock props inline (or imports a
     `<name>.mocks.ts` next to the body if the prop tree is large).
   - Adds a row to `app/(dev)/index.tsx` so the gallery lists it.

4. **Tailwind tokens.** If the canonical source uses any class that
   doesn't resolve in v4, extend `apps/mobile/tailwind.config.js` in
   this commit (token name copied from the canonical config).

## Tests required this commit

- Snapshot test for the body at default mock props
  (`<name>.test.tsx`).
- Behaviour test per interaction the canonical source exercises
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
- Open the v4 dev gallery → tap the `<name>` row.
- Side-by-side with the canonical source running from
  `../haru3-reports/apps/mobile` on the same simulator (or on a
  second simulator window).
- Eyeball: layout, spacing, typography, colors, hit targets,
  modal presentation. Cosmetic drift is a P0 bug (Pitfall 3).

## Commit

```
feat(mobile): <name> ported from canonical source (P<n>.<m>)
```

Body must include:
- Canonical source path that was ported.
- v4 body / real route / dev mirror paths created.
- Test counts.
- `pnpm typecheck` + `pnpm lint` results.
- Any tailwind tokens added (with their canonical-source line).
- "Deferred to P3:" line listing the unwired data-layer pieces.
