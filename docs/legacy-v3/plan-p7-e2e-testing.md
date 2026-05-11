# P7 — Comprehensive E2E Testing Plan

> Maestro-based end-to-end tests for `apps/mobile-v3`.
> Prerequisites: UI parity complete, simulator builds passing.

---

## Philosophy

Tests are organized into **one core journey** (the critical happy path a user
follows every day) and **feature journeys** (focused suites that exercise a
specific area in depth). Every test must run in fixture mode
(`EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true`, `USE_FIXTURES=true`).

---

## 1. Core Journey — Report Lifecycle (`journeys/report-lifecycle.yaml`)

This is the single most important flow. It exercises the entire product
end-to-end in the order a real user would:

| Step | Actions | Assertions |
|------|---------|------------|
| 1. Login | Enter phone, submit, enter OTP, verify | Lands on Projects screen |
| 2. Create project | Tap add-project, fill name + address, save | New project appears in list |
| 3. Navigate to reports | Tap project → Reports row | Report list screen |
| 4. Start new report | Tap "New Report" | Generate screen appears |
| 5. Add text note | Type a note, tap add | Note appears in timeline |
| 6. Add voice note | Tap record, wait, stop | Voice note card in timeline |
| 7. Play voice note | Tap play on voice card | Progress indicator moves |
| 8. Add photo | Tap camera, capture, confirm | Photo thumbnail in timeline |
| 9. View notes summary | Scroll timeline | All 3 items visible (text, voice, photo) |
| 10. Generate report | Tap Generate, wait for fixture response | Report renders in Report tab |
| 11. View report sections | Scroll Report tab | Heading + section content visible |
| 12. Add report note | Switch to Notes tab, type note, add | Note appears |
| 13. Edit report fields | Switch to Edit tab, edit title, save | Title updated |
| 14. Finalize report | Tap finalize in menu | Status changes to finalized |
| 15. Export PDF | Tap PDF/export action | PDF generated (or stub confirmed) |
| 16. Share/save | Tap share | Share sheet appears |
| 17. Return to list | Navigate back | Finalized report in list with badge |
| 18. Reopen report | Tap finalized report | Report tab shows content |
| 19. Logout | Profile → Sign Out → Confirm | Returns to login |

**Expected subflows used:** `login-mike-otp`, `create-project`, `assert-no-error`

---

## 2. Feature Journeys

### 2.1 Auth & Onboarding (7 flows)

| Flow | Description | Status |
|------|-------------|--------|
| `login-happy-path` | Phone → OTP → Projects | Exists |
| `login-wrong-otp` | Invalid OTP → error message | Exists |
| `login-invalid-phone` | Short phone → validation error | Exists |
| `login-change-number` | "Change number" on verify → back to phone input | Exists |
| `logout` | Sign out → confirm → login screen | Exists |
| `onboarding-happy-path` | New user → name + company → Projects | **NEW** |
| `onboarding-validation` | Empty fields → validation errors | Exists |
| `session-restore` | Kill app → relaunch → still authenticated | Exists |

### 2.2 Projects (7 flows)

| Flow | Description | Status |
|------|-------------|--------|
| `create-project` | Fill form, save, verify in list | Exists |
| `project-list-displays` | Verify list renders with items | Exists |
| `delete-project` | Delete via edit screen, verify removed | Exists |
| `edit-project` | Edit name, save, verify | Exists |
| `project-detail-tabs` | Reports/Members rows visible | Exists |
| `project-empty-state` | Zero projects → empty state with CTA | **NEW** |
| `project-copy-fields` | Copy client name / address to clipboard | **NEW** |

### 2.3 Members (4 flows)

| Flow | Description | Status |
|------|-------------|--------|
| `view-members-list` | Open members, verify owner listed | Exists |
| `invite-member` | Add member with phone + role | Exists |
| `remove-member` | Add then remove a member | Exists |
| `invite-invalid-phone` | Invalid phone → validation error | **NEW** |

### 2.4 Reports (14 flows)

| Flow | Description | Status |
|------|-------------|--------|
| `generate-report-fixture` | Full fixture-mode generation | Exists |
| `report-detail-tabs` | Verify Report/Edit/Notes tabs on finalized | Exists |
| `report-edit-tab-renders` | Edit tab sections render | Exists |
| `report-edit-save` | Edit title/meta fields and save | **NEW** |
| `report-list-displays` | Report list with items | Exists |
| `report-delete` | Delete report via menu | Exists |
| `new-report-empty-note` | Attempt report with empty note | Exists |
| `note-add-and-remove` | Add/remove notes from report | Exists |
| `note-timeline-order` | Notes in chronological order | Exists |
| `report-empty-state` | No reports → empty state | **NEW** |
| `report-finalize` | Draft → finalized status change | **NEW** |
| `report-pdf-save` | Save finalized report as PDF | **NEW** |
| `report-pdf-view` | View PDF in-app | **NEW** |
| `multiple-reports` | Create 2+ reports, verify list ordering | **NEW** |

### 2.5 Voice Notes (7 flows)

| Flow | Description | Status |
|------|-------------|--------|
| `record-replay-delete` | Record, replay, delete | Exists |
| `playback-coordination` | Only one plays at a time | Exists |
| `replay-after-finish` | Replay after completion | Exists |
| `persist-on-unmount` | Persist when leaving screen | Exists |
| `cached-playback` | Cached playback works | Exists |
| `id-badge` | ID badge shows in timeline | Exists |
| `voice-note-summary` | Transcript/summary text visible after processing | **NEW** |

### 2.6 Voice Note / Report Integration (2 flows)

| Flow | Description | Status |
|------|-------------|--------|
| `voice-note-dedup` | Voice notes deduplicated in timeline | Exists |
| `voice-note-soft-delete-cascade` | Soft-delete cascades in report | Exists |

### 2.7 Files & Camera (7 flows)

| Flow | Description | Status |
|------|-------------|--------|
| `photo-upload-completes` | Camera photo uploads | Exists |
| `photo-upload-burst-completes` | Burst upload | Exists |
| `photo-upload-discard-pending` | Discard pending upload | Exists |
| `queue-persists-after-relaunch` | Queue survives relaunch | Exists |
| `image-preview-lightbox` | Tap image → lightbox | Exists |
| `camera-happy-path` | Open camera, take photo, confirm | Exists |
| `camera-permission-denied` | Permission denied flow | Exists |
| `file-delete` | Delete an uploaded file | **NEW** |
| `upload-tray-retry` | Open upload tray, retry failed upload | **NEW** |

### 2.8 Profile & Settings (8 flows)

| Flow | Description | Status |
|------|-------------|--------|
| `navigate-to-profile` | Open profile, verify elements | Exists |
| `account-screen-renders` | Account details fields | Exists |
| `edit-account-name` | Edit name, save, verify | Exists |
| `ai-provider-picker` | Open AI provider modal | Exists |
| `sign-out-confirmation` | Sign out confirmation dialog | Exists |
| `avatar-upload-cancel` | Avatar upload cancel | Exists |
| `usage-populated` | Usage screen data | Exists |
| `clear-cache` | Clear cache action | **NEW** |

### 2.9 Cross-Cutting (3 flows)

| Flow | Description | Status |
|------|-------------|--------|
| `core-end-to-end` | Full end-to-end journey | Exists (→ REPLACED by report-lifecycle above) |
| `cross-user-rls` | Multi-user RLS verification | Exists (needs Sarah/Charlie subflows) |
| `report-soft-delete-hides-notes` | Soft-delete hides notes | Exists |

---

## 3. Subflows Required

| Subflow | Status |
|---------|--------|
| `login-mike-otp` | Exists |
| `login-sarah-otp` | **NEW** — needed for cross-user-rls |
| `login-charlie-otp` | **NEW** — needed for cross-user-rls |
| `ensure-logged-out` | Exists |
| `create-project` | Exists |
| `create-draft-report` | Exists |
| `edit-current-project` | Exists |
| `edit-current-project-save` | Exists |
| `delete-current-project` | Exists |
| `finalize-report` | Exists |
| `assert-no-error` | Exists |
| `create-second-user` | **NEW** — needed for cross-user-rls |

---

## 4. V2 Flows Dropped (features removed or not applicable)

| V2 Flow | Reason |
|---------|--------|
| `files/photo-library-pick-completes` | Photo library picker not ported to v3 |
| `files/ios-background-upload-completes` | Was WIP in v2, not implemented |
| `files/android-upload-foreground-notification` | Android-only, not ported |

---

## 5. Total Count

| Category | Existing | New | Total |
|----------|----------|-----|-------|
| Core Journey | 1 (replaced) | 1 | 1 |
| Auth & Onboarding | 7 | 1 | 8 |
| Projects | 5 | 2 | 7 |
| Members | 3 | 1 | 4 |
| Reports | 8 | 6 | 14 |
| Voice Notes | 6 | 1 | 7 |
| Voice/Report Integration | 2 | 0 | 2 |
| Files & Camera | 7 | 2 | 9 |
| Profile & Settings | 7 | 1 | 8 |
| Cross-Cutting | 3 | 0 | 3 |
| Subflows | 9 | 3 | 12 |
| **Total** | **58** | **18** | **75** |

---

## 6. Execution Order

1. **Verify existing 51 flows pass on simulator** (gate)
2. Write core journey (`report-lifecycle.yaml`)
3. Write new subflows (Sarah/Charlie login, create-second-user)
4. Write new feature flows in priority order:
   - Reports (6 new) — highest value
   - Projects (2 new)
   - Auth (1 new)
   - Members (1 new)
   - Voice Notes (1 new)
   - Files (2 new)
   - Profile (1 new)
5. Run full suite, fix flaky tests
6. Add to CI config

---

## 7. Fixture Requirements

- `USE_FIXTURES=true` on edge functions (5s delay via `FIXTURES_DELAY_MS`)
- `EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true` for simulator audio
- PDF export stub required for `report-pdf-save` and `report-pdf-view` flows
- Demo/seed accounts for multi-user RLS tests
