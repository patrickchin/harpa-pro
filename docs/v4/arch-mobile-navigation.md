# Mobile navigation policy (Expo Router)

> Status: design (P3 hardening). Companion to
> [`arch-mobile.md`](arch-mobile.md) and [`pitfalls.md`](pitfalls.md).
> Source-of-truth for `router.push` / `replace` / `back` / `dismiss*`
> choices in `apps/mobile/app/`.

## 1. Routing graph

Layout tree:

- `app/_layout.tsx` — root providers, `<Slot />`. Three groups below.
- `app/(auth)/_layout.tsx` — `Stack`, auth gate (redirect if signed in).
- `app/(app)/_layout.tsx` — `Tabs` (single tab `projects`, tabBar
  hidden), auth gate + Android double-back-to-exit.
- `app/(app)/projects/_layout.tsx` — `Stack`. **This is the user-visible
  back stack** for everything project-scoped. Declares: `index`, `new`,
  `[project]/index`, `[project]/edit`, `[project]/members`,
  `[project]/reports/index`, `[project]/reports/[number]/generate`.
  ⚠ `[project]/reports/[number]/index` is **not** listed (auto-discovered) —
  add it for explicitness (§3 NIT-L1).
- `app/(camera)/_layout.tsx` — `Stack` with `presentation: 'fullScreenModal'`.
  Visually independent of the caller; sits above the project Stack.

Routes & edges (→ = link out, ← = enter via):

| Route | Enters from | Exits to |
|---|---|---|
| `(auth)/sign-in/phone` | `(app)` auth-gate redirect; `sign-up/phone` (replace) | push `sign-in/verify` |
| `(auth)/sign-in/verify` | `sign-in/phone` (push) | replace `/` on success; replace `sign-in/phone` on "change number" |
| `(auth)/sign-up/phone` | `sign-in/phone` (manual `Don't have account?`) | push `sign-up/verify`; replace `sign-in/phone` for "Have account" + back |
| `(auth)/sign-up/verify` | `sign-up/phone` (push) | replace `/` on success; replace `sign-up/phone` on "change number" |
| `(auth)/onboarding` | `(app)` auth-gate redirect when status = `needs-onboarding` | replace `/` |
| `(app)/projects` (list — only Tab screen) | root `/` redirect; sign-in/onboarding success | push `[project]`; push `projects/new`; `AppHeaderActions` → push `/profile` |
| `projects/new` | list push | replace `projects/[id]` on create; safeBack on cancel |
| `projects/[project]` (home) | list push; `/p/[slug]` deep-link replace | push edit/members/reports; safeBack to list |
| `projects/[project]/edit` | home push | safeBack on save; replace `projects` on delete |
| `projects/[project]/members` | home push | safeBack |
| `projects/[project]/reports` (list) | home push | push `[number]/generate` (draft); push `[number]` (finalized); safeBack |
| `projects/[project]/reports/[number]/generate` | reports-list push (new draft or open-draft) | replace `[number]` on finalize; replace `reports` on delete-draft; push `(camera)/capture` |
| `projects/[project]/reports/[number]` (saved) | generate-finalize replace; reports-list push for finalized; `/r/[slug]` deep-link replace | replace `reports` on delete; safeBack; replace `projects` on "back to projects" CTA (error state) |
| `(app)/profile` | `AppHeaderActions` (root-Stack push) | push account; push usage; signOut → `dismissAll` + replace `/` |
| `(app)/account` | profile push | safeBack |
| `(app)/usage` | profile push | safeBack |
| `(app)/p/[project]` (slug resolver) | deep link | replace canonical `/projects/[id]` |
| `(app)/r/[report]` (slug resolver) | deep link | replace canonical `/projects/[id]/reports/[n]` |
| `(camera)/capture` | report generate-screen push | safeBack on commit/cancel (commits URIs via session registry, **not** params) |

Modals/sheets distinct from routes (rendered in-screen, do not push):
`AppDialogSheet`, `ReportActionsMenu`, `SavedReportSheet`,
`PdfPreviewModal`, `ImagePreviewModal`. None call `router.*`.

## 2. Push vs Replace policy

Rules of thumb, in priority order:

1. **Forward navigation the user expects to back out of → `push`.**
   Drill-down (list → detail → sub-detail), modal-like flows the user
   wants to dismiss (sign-up → verify, generate → camera).
2. **Post-mutation redirect that should drop the originating screen
   from history → `replace`.** Examples: create flow lands on the
   created entity; finalize draft lands on saved-report; auth-success
   lands on `/`. The originator (form / draft) must not be reachable
   via back.
3. **Replace to a route that may already be the previous frame in the
   stack → `router.dismissTo(href)`, not `router.replace(href)`.**
   `replace` swaps only the top frame; if the target already sits
   below, the user gets **two adjacent copies of the same route**
   (§4 reproducer). `dismissTo` walks back to the existing frame
   instead. If `dismissTo` isn't available for the target (no matching
   frame in stack — deep-link entry), fall back to `replace`.
4. **Resource deletion / finalization → never leave the deleted/stale
   resource in history.** After deleting report N or finalizing it,
   the `/generate/N` and `/reports/N` (when stale) URLs must not be
   reachable via back — they 404 / show stale content. Use rule 3 to
   redirect to the parent list.
5. **Deep-link landing → replace to canonical URL, never push.** The
   short-link resolvers `/p/[slug]` and `/r/[slug]` already follow
   this. A cold-launch deep link arrives with an empty stack; we do
   **not** synthesize parent screens (no "fake breadcrumb push").
   `safeBack` from the landing page falls back to the parent.
6. **Header back / system back → `safeBack(router, parentHref)`.**
   `router.back()` if `canGoBack()`, otherwise `replace(parent)`.
   The fallback exists precisely because of rule 5.
7. **Auth flow change-number / cross-link → `replace`, not `push`.**
   Phone → verify is `push` (user wants to back-edit). But verify's
   "Change number" button must `replace` back to phone, otherwise the
   verify screen accumulates on every retry.
8. **`router.dismissAll()` is only for sign-out.** It tears down the
   full stack so the next render starts in `(auth)`. Don't use it
   for normal post-mutation navigation.

### Tab-bar (rule 8)
Default Expo Router tab behaviour: tapping the active tab does **not**
pop to root. v4 ships a single tab with `tabBarStyle: display: 'none'`
(`app/(app)/_layout.tsx:68`), so this is moot today. **If we add a
second tab** (e.g. Inbox in P5), opt in to pop-to-root via
`Tabs.Screen listeners: { tabPress: (e) => navigation.popToTop() }`
or use `unstable_settings.initialRouteName`. Document the choice
inline.

## 3. Per-call audit

Legend: **BUG** = behaves wrong today; **NIT** = correct but
inconsistent / future-proof; **OK** = matches policy.

### `(app)` group

| File:line | Current | Recommended | Reason |
|---|---|---|---|
| `app/(app)/projects/index.tsx:36` | `push /projects/[slug]` | `push` | Forward drill-down. **OK** |
| `app/(app)/projects/index.tsx:39` | `push /projects/new` | `push` | Forward modal-like form. **OK** |
| `app/(app)/projects/new.tsx:16` | `safeBack(/(app)/projects)` | same | **OK** |
| `app/(app)/projects/new.tsx:30` | `replace /(app)/projects/[id]` | `replace` | Drop `/new` from history. **OK** (rule 2) |
| `app/(app)/projects/[project]/index.tsx:44` | `safeBack(/(app)/projects)` | same | **OK** |
| `app/(app)/projects/[project]/index.tsx:45-47` | `push edit/reports/members` | `push` | **OK** |
| `app/(app)/projects/[project]/edit.tsx:45` | `safeBack` | same | **OK** |
| `app/(app)/projects/[project]/edit.tsx:59` | `safeBack` on update success | same | **OK** — edit-form was pushed onto home; pop back. |
| `app/(app)/projects/[project]/edit.tsx:68` | `replace /(app)/projects` after delete | `dismissTo('/(app)/projects')` | **BUG-L2.** When delete fires the stack is `[…, projects, [project], edit]`. `replace` swaps `edit` → `projects`, producing `[…, projects, [project], projects]`. Back lands on `[project]` for a project that **no longer exists** (load error). Use `dismissTo` to pop to the existing list frame. |
| `app/(app)/projects/[project]/members.tsx:53` | `safeBack` | same | **OK** |
| `app/(app)/projects/[project]/reports/index.tsx:44` | `safeBack(/(app)/projects/[slug])` | same | **OK** |
| `app/(app)/projects/[project]/reports/index.tsx:53` | `push …/generate` (after create) | `push` | Forward into the new draft; back returns to list which now shows it. **OK** |
| `app/(app)/projects/[project]/reports/index.tsx:61` | `push …/generate` (draft row) | `push` | **OK** |
| `app/(app)/projects/[project]/reports/index.tsx:63` | `push …/[number]` (finalized row) | `push` | **OK** |
| `app/(app)/projects/[project]/reports/[number]/generate.tsx:306` | `replace …/[number]` after finalize | `replace` | Saved-report is a different route from anything below. **OK** (rule 2) |
| `app/(app)/projects/[project]/reports/[number]/generate.tsx:328` | `replace …/reports` after delete-draft | `dismissTo('…/reports')` | **BUG-L1 (root cause of the reported bug, §4).** The reports-list frame is almost always immediately below `generate` on the stack (`reports-list → push generate`). `replace` produces two adjacent `reports` frames. Use `dismissTo`. |
| `app/(app)/projects/[project]/reports/[number]/generate.tsx:346` | `push (camera)/capture` | `push` | Camera is a fullScreenModal group. **OK** |
| `app/(app)/projects/[project]/reports/[number]/generate.tsx:401` | `safeBack(…/reports)` | same | **OK** |
| `app/(app)/projects/[project]/reports/[number]/index.tsx:165` | `replace …/reports` after delete saved-report | `dismissTo('…/reports')` | **BUG-L1 (same shape).** Saved-report typically reached via `reports-list → push generate → replace saved-report`, so the list frame is two below the saved-report's predecessor. `dismissTo` pops cleanly to it. Falls back to `replace` if no list frame exists (deep-link entry). |
| `app/(app)/projects/[project]/reports/[number]/index.tsx:194` | `safeBack(…/reports)` | same | **OK** |
| `app/(app)/projects/[project]/reports/[number]/index.tsx:198` | `replace('/(app)/projects')` ("Back to projects" CTA in load-error state) | `dismissTo('/(app)/projects')` | **BUG-L3.** Same family. On normal entry, `projects` index is several frames down; `replace` collapses only the top. Visible symptom: user lands on projects list but back returns to the (broken) saved-report. |
| `app/(app)/profile.tsx:62` | `safeBack(/(app)/projects)` | same | **OK** |
| `app/(app)/profile.tsx:63-64` | `push /account`, `push /usage` | `push` | **OK** |
| `app/(app)/profile.tsx:69-71` | `signOut`, `dismissAll`, `replace('/')` | same | **OK** (rule 8 sole consumer). |
| `app/(app)/account.tsx:34` | `safeBack(/(app)/profile)` | same | **OK** |
| `app/(app)/usage.tsx:37` | `safeBack(/(app)/profile)` | same | **OK** |
| `app/(app)/p/[project].tsx:24` | `replace /projects/[id]` | `replace` | Deep-link landing, rule 5. **OK** |
| `app/(app)/p/[project].tsx:37` | `replace /(app)/projects` (error CTA) | `replace` | Stack typically empty here (cold deep-link). **OK**; use `safeBack` if cross-launched from inside the app to be safe. **NIT-L4.** |
| `app/(app)/r/[report].tsx:24,37` | same as `/p/` | same | **OK** / **NIT-L4** |
| `components/ui/AppHeaderActions.tsx:48` | `push('/profile')` | `push` | **OK** — pushes onto root Stack per canonical note in file header. |

### `(auth)` group

| File:line | Current | Recommended | Reason |
|---|---|---|---|
| `app/(auth)/onboarding.tsx:47` | `replace('/')` (auto-redirect when complete) | `replace` | **OK** |
| `app/(auth)/onboarding.tsx:75` | `replace('/')` on submit | `replace` | **OK** |
| `app/(auth)/sign-in/phone.tsx:87` | `push sign-in/verify` | `push` | **OK** (user wants back to edit phone) |
| `app/(auth)/sign-in/verify.tsx:83` | `replace('/')` on verified | `replace` | **OK** (rule 2) |
| `app/(auth)/sign-in/verify.tsx:108` | `replace sign-in/phone` ("change number") | `back()` if `canGoBack()` else `replace` (i.e. `safeBack`) | **NIT-L5.** Phone is the frame below verify; `back()` is semantically cleaner and avoids `[phone, phone-new]` shape. |
| `app/(auth)/sign-up/phone.tsx:45` | `push sign-up/verify` | `push` | **OK** |
| `app/(auth)/sign-up/phone.tsx:57,61` | `replace sign-in/phone` (back / "have account") | `replace` | **OK** — different stack (sign-up vs sign-in entry), rule 5/7. |
| `app/(auth)/sign-up/verify.tsx:88` | `replace('/')` on verified | `replace` | **OK** |
| `app/(auth)/sign-up/verify.tsx:113` | `replace sign-up/phone` ("change number") | `safeBack` | **NIT-L5** (same as sign-in/verify). |

### `(camera)` group

| File:line | Current | Recommended | Reason |
|---|---|---|---|
| `app/(camera)/capture.tsx:38` | `safeBack(router, '/')` on commit | `safeBack(router, returnTo)` from session metadata | **NIT-L6.** Camera was opened with `returnTo` recorded in `createCameraSession` (`generate.tsx:342`). The fallback should honour it — today `safeBack` falls back to `/`, which dumps the user at projects list when launched from a deep-linked report (rule 5 entry). Minor; revisit if camera grows additional entry points (P4 upload pipeline). |
| `app/(camera)/capture.tsx:44` | `safeBack(router, '/')` on cancel | same as above | **NIT-L6** |

### Auth-gate redirects (declarative)

Not router calls but worth noting: `app/(app)/_layout.tsx:49`,
`app/(auth)/_layout.tsx:21`, and `app/index.tsx:11` use `<Redirect>`
which behaves like `replace` — correct in all three.

## 4. The reported reproducer

> "Tapping back took me to the same Reports list multiple times in a
> row."

Root cause: **`router.replace` is used to redirect to a route that
already sits one frame below on the back stack**, producing two
adjacent copies of the same route. Two call sites currently exhibit
this shape:

**Primary culprit — `generate.tsx:328` (delete-draft):**

```
1. Reports list → push  /generate/N      stack: […, reports, generate]
2. user deletes draft  → replace /reports stack: […, reports, reports]
3. user taps back                          stack: […, reports]    ← same content
4. user taps back again                    stack: […]              ← finally pops
```

Steps 3 and 4 both show the reports list — the "multiple times in a
row" symptom.

**Secondary — `saved-report/index.tsx:165` (delete saved):**

Same shape, one frame deeper:

```
1. Reports list  → push     /generate/N
2. user finalizes → replace /reports/N    stack: […, reports, saved]
3. user deletes  → replace  /reports      stack: […, reports, reports]
4. back…back… same as above.
```

**Tertiary — `projects/[project]/edit.tsx:68` (delete project):**

```
stack: […, projects, [project], edit]
→ replace /projects    stack: […, projects, [project], projects]
back → [project] which now load-errors (project deleted)
back → projects.
```

All three are fixed by switching `router.replace(href)` →
`router.dismissTo(href)`. `dismissTo` walks the stack back to the
existing frame instead of swapping the top, so the duplicate never
forms. On a stack where the target frame doesn't exist (cold deep
link), Expo Router throws — wrap once in a helper:

```ts
// lib/nav/dismiss-or-replace.ts (proposed)
export function dismissOrReplaceTo(router: Router, href: Href) {
  try {
    router.dismissTo(href);
  } catch {
    router.replace(href);
  }
}
```

Use it for **every** post-mutation redirect whose target is a parent
already in the stack (the three call sites above, plus future ones).

The two existing `router.replace` calls that are **correct as-is**
(finalize → saved-report at `generate.tsx:306`; create → project at
`projects/new.tsx:30`) target a route that is NOT in the stack below,
so no duplicate forms.

## 5. Maestro coverage additions

Existing flows live in `apps/mobile/.maestro/` (port from canonical).
Augment with a "back-button after X" step on these:

- `report-finalize.yaml` (or equivalent): after finalize → assert
  saved-report → tap back → assert reports list → tap back → assert
  project home. (Catches duplicate-list bug regression.)
- `report-delete-draft.yaml` (new if missing): open draft → delete →
  assert reports list → tap back → assert project home (NOT reports
  list).
- `report-delete-saved.yaml`: same shape for the saved-report delete.
- `project-delete.yaml`: same shape for project delete.

In every flow, the post-back screen assertion is the regression
guard — without it the duplicate-list bug is silent.

## 6. Suggested code structure

1. **`apps/mobile/lib/nav/dismiss-or-replace.ts`** — the helper from
   §4. Single export. Unit test that asserts fallback to `replace`
   when `dismissTo` throws.
2. **`apps/mobile/lib/nav/safe-back.ts`** — already exists; extend
   the docblock to reference this doc and reiterate the policy.
3. **(optional) `apps/mobile/lib/nav/use-report-navigation.ts`** —
   bundles the three report-screen exit transitions
   (`goToSavedReport`, `popToReportsList`, `popToProjectsList`) so
   `generate.tsx` and `saved-report/index.tsx` share the same wiring.
   Worth it if a third caller emerges; skip otherwise to avoid the
   indirection. Lint rule `no-restricted-syntax` could later block
   `router.replace` inside `app/(app)/projects/[project]/reports/**`
   to force use of the helper.

## 7. Pitfall cross-reference

| Pitfall | Mitigation in this doc |
|---|---|
| **Pitfall 5** (no `setTimeout` in auth) | Policy rule 7 keeps auth nav synchronous; no recommendation introduces a timer. |
| **Pitfall 8** (silent feature gaps caught manually) | Tab-bar pop-to-root behaviour documented (§2 rule 8) rather than discovered when we add a second tab. |
| **Pitfall 10** (tests inline) | §5 makes the Maestro back-button assertions a same-PR deliverable, not a "P4 polish" punt. |
| **Pitfall 13** (default wiring silently broken) | Helper `dismissOrReplaceTo` has a single integration path (not DI-injected); test exercises the real fallback branch. |

## 8. Implementation checklist (worker subagent)

Each item ≈ one commit. Same-PR doc references this file.

1. `feat(mobile/nav): add dismissOrReplaceTo helper + unit test`
   — `apps/mobile/lib/nav/dismiss-or-replace.ts` + `.test.ts`.
2. `fix(mobile/reports): pop to list on delete-draft instead of replace`
   — `generate.tsx:328`. Vitest behaviour test asserting the helper
   is called with the right href.
3. `fix(mobile/reports): pop to list on delete saved report`
   — `saved-report/index.tsx:165`. Plus fix `:198` "back to projects"
   CTA the same way.
4. `fix(mobile/projects): pop to list on delete project`
   — `[project]/edit.tsx:68`.
5. `refactor(mobile/auth): use safeBack for change-number in verify`
   — `sign-in/verify.tsx:108`, `sign-up/verify.tsx:113` (NIT-L5).
6. `chore(mobile/nav): declare missing report-index Stack.Screen`
   — `(app)/projects/_layout.tsx` (NIT-L1).
7. `test(mobile-e2e): assert back-stack after finalize / delete in
   Maestro flows` — §5.
8. *(optional, defer to P4)* `feat(mobile/camera): honour
   session.returnTo on safeBack fallback` — NIT-L6.

## 9. Open questions / carve-outs

- **Pop-to-root on tab re-tap.** Deferred until a second tab is added
  (P5 Inbox or similar). Tracked in
  [`plan-p5-beta-ga.md`](plan-p5-beta-ga.md) — add a note there in
  the same PR that introduces the second tab.
- **`router.dismissTo` Expo Router version.** Confirmed available in
  the version pinned by `apps/mobile/package.json` (Expo SDK shipping
  Expo Router ≥ 3.5). Verify in step 1 of the checklist before relying
  on it; if missing, the helper degenerates to `replace` and the
  worker subagent should escalate.
- **Lint rule to forbid raw `router.replace` to a parent route in
  `app/(app)/projects/`.** Deferred — let's see if the helper sticks
  before paying the AST-matcher cost. Tracked in
  [`plan-p4-hardening.md`](plan-p4-hardening.md) under
  "Mobile lint hardening".
