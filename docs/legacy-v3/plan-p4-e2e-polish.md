# P4: E2E & Polish (Week 8)

> Part of [Implementation Plan](./implementation-plan.md)

### Goal
Port Maestro flows, achieve visual parity with mobile-old, fix bugs, performance optimization.

### P4.1 — Maestro Flow Migration

**Deliverables:**
- All 49 flows ported to mobile-v3

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P4.1.1 | Port subflows (7 flows) | 2h | P3 |
| P4.1.2 | Port auth flows (11 flows) | 3h | P4.1.1 |
| P4.1.3 | Port project flows (10 flows) | 3h | P4.1.2 |
| P4.1.4 | Port member flows (6 flows) | 2h | P4.1.3 |
| P4.1.5 | Port report flows (13 flows) | 4h | P4.1.4 |
| P4.1.6 | Port voice-note flows (6 flows) | 2h | P4.1.5 |
| P4.1.7 | Port file flows (5 flows) | 2h | P4.1.6 |
| P4.1.8 | Port profile flows (8 flows) | 2h | P4.1.7 |
| P4.1.9 | Verify all flows pass | 4h | P4.1.8 |

**Acceptance Criteria:**
- [ ] All 49 flows ported
- [ ] smoke tag flows pass
- [ ] fixture-mode tag on AI flows (R7)

---

### P4.2 — UI & Styling Parity

**Goal:** Match mobile-v3 visuals to mobile-old so the upgrade feels like the same app.

**Gap analysis source:** Side-by-side comparison of `apps/mobile/` (NativeWind) vs `apps/mobile-v3/` (Unistyles).

#### P4.2.1 — Token & Theme Alignment

| Task | Description | Est. |
|------|-------------|------|
| P4.2.1.1 | Add missing color sub-tokens (`primary.alpha30`, `muted.disabled`, `*.text`, `*.border` for success/warning/danger/info) to `tokens.ts` | 1h |
| P4.2.1.2 | Fix typography: label → 13px/700/letterSpacing 0.08em; title → 26px/700; title-sm → 20px/700; add `display` (34px/700) and `body-lg` (18px) tokens | 1h |
| P4.2.1.3 | Fix border radii: cards → 8px (`radii.md`), align naming so `lg`=8, `xl`=12 to match old Tailwind config | 1h |
| P4.2.1.4 | Fix horizontal screen padding: 20px everywhere (add `spacing.screen: 20` token) | 30m |
| P4.2.1.5 | Port `getSurfaceDepthStyle()` (flat/raised/floating tiers) to a Unistyles helper or shared shadow tokens | 1h |

#### P4.2.2 — Component Visual Fixes

| Task | Description | Est. |
|------|-------------|------|
| P4.2.2.1 | **Button**: add border on default/secondary/outline; add shadow (raised depth); add `hero`, `quiet`, `icon`, `xl` variants; destructive → soft bg + colored text; loading → spinner beside label | 2h |
| P4.2.2.2 | **Card**: radius → 8px; add border on muted variant; add `danger` variant; deepen shadow to match raised depth (opacity 0.08, radius 8) | 1h |
| P4.2.2.3 | **Input**: add raised shadow; add read-only state (muted bg + flat shadow); label color → mutedForeground; container gap → 8px | 1h |
| P4.2.2.4 | **ScreenHeader**: title → left-aligned; back button → outlined Button with ArrowLeft (16px); support `eyebrow`, `titleAccessory` props; add `AppHeaderActions` trailing component | 2h |
| P4.2.2.5 | **AppDialogSheet**: change from centered modal to bottom sheet (`animationType="slide"`); wrap message in `InlineNotice`; use full `Button` components for actions; add `canDismiss`, `noticeTone`, `children` support | 2h |
| P4.2.2.6 | **EmptyState**: wrap in `Card variant="muted"`; icon in bordered 64×64 box; title → 20px/700 | 1h |
| P4.2.2.7 | **Skeleton**: shimmer timing → 1200ms, opacity range 0.35–0.7; add `SkeletonRow` helper | 30m |

#### P4.2.3 — Missing Components

| Task | Description | Est. |
|------|-------------|------|
| P4.2.3.1 | Port `InlineNotice` (toned info/warning/danger/success banners) | 1h |
| P4.2.3.2 | Port `StatTile` (metric display with tone) | 1h |
| P4.2.3.3 | Port `SectionHeader` (label + icon section divider) | 30m |
| P4.2.3.4 | Port custom `SafeAreaView` (JS-context-aware insets) | 30m |

#### P4.2.4 — Screen-Level Polish

| Task | Description | Est. |
|------|-------------|------|
| P4.2.4.1 | **Projects list**: project card → emphasis variant; role → muted uppercase text (not colored pill); add-new card layout match; item gap → 12px | 1h |
| P4.2.4.2 | **Profile**: avatar → icon in bordered box (not initials circle); usage → 3× `StatTile` row; menu items → card-wrapped rows with icon boxes | 1h |
| P4.2.4.3 | **VoiceNoteCard**: add seekable progress bar; play button → primary bg; add 3-dot options menu (share/download/delete/transcript); add summary display; show author + formatted timestamp | 3h |
| P4.2.4.4 | **Report detail & NoteTimeline**: verify spacing, card styles, action row styling match old app | 1h |
| P4.2.4.5 | Screen transitions: `animation: "simple_push"`, `animationDuration: 80` | 30m |

#### P4.2.5 — Visual Verification

| Task | Description | Est. |
|------|-------------|------|
| P4.2.5.1 | Side-by-side screenshot comparison of all main screens (projects list, project detail, report detail, voice recording, profile) | 2h |
| P4.2.5.2 | Fix remaining visual deltas found in comparison | 2h |

**Acceptance Criteria:**
- [ ] Card radius, shadows, borders match old app
- [ ] Header layout (left-aligned title, outlined back button) matches old app
- [ ] Button variants and styling match old app
- [ ] Label typography (13px/700/letter-spaced) matches old app
- [ ] All missing components ported (InlineNotice, StatTile, SectionHeader)
- [ ] VoiceNoteCard has progress bar, options menu, summary display
- [ ] AppDialogSheet uses bottom-sheet layout
- [ ] Side-by-side screenshots show no major visual differences

**Estimated total: ~27h**

---

### P4.3 — Bug Fixing

**Deliverables:**
- All P0-P3 bugs fixed

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P4.3.1 | Triage E2E failures | 4h | P4.1 |
| P4.3.2 | Fix identified bugs | 8h | P4.3.1 |
| P4.3.3 | Regression tests for fixes | 4h | P4.3.2 |

**Acceptance Criteria:**
- [ ] All Maestro flows green
- [ ] 80% unit test coverage
- [ ] No critical bugs

---

### P4.4 — Performance Optimization

**Deliverables:**
- Optimized renders, bundle size

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P4.4.1 | Profile render performance | 2h | P4.3 |
| P4.4.2 | Add memoization where needed | 2h | P4.4.1 |
| P4.4.3 | Analyze bundle size | 1h | P4.4.2 |
| P4.4.4 | Remove unused dependencies | 1h | P4.4.3 |

**Acceptance Criteria:**
- [ ] No unnecessary re-renders
- [ ] Bundle size < v1 bundle

---

### P4.5 — P4 Exit Gate (must pass before starting P5)

All of the following must be green before any P5 work begins. This is a
hard gate — no exceptions.

**Maestro E2E:**
- [ ] All 49 Maestro flows ported and passing (`maestro test apps/mobile-v3/.maestro/`)
- [ ] Smoke-tagged flows pass in CI (`--tags smoke`)
- [ ] Fixture-mode AI flows pass (`--tags fixture`)
- [ ] No flows use `optional: true` on assertions that were mandatory in mobile-old (R2)

**Unit & Integration Tests:**
- [ ] `pnpm test` passes across all workspaces (zero failures)
- [ ] Unit test coverage ≥ 80% for `apps/mobile-v3` and `packages/api`

**Build & Types:**
- [ ] `pnpm build` succeeds (all packages)
- [ ] `pnpm -r typecheck` passes (zero type errors)

**Visual Parity:**
- [ ] Side-by-side screenshot comparison approved (P4.2.5)

**How to verify:**

```bash
# Run everything in sequence — all must exit 0
pnpm build
pnpm -r typecheck
pnpm test
cd apps/mobile-v3 && maestro test .maestro/
```

If any gate fails, fix the issue in P4.3 (bug fixing) before proceeding.
Do not start P5 with known failures.
