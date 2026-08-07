# Camera Native Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Android Maestro camera captures from racing Expo CameraX
picture-size rebinding.

**Architecture:** `CameraCapture` owns a fail-closed readiness bit and exposes
it through the existing shutter's disabled state. A shared Maestro helper waits
for that semantic state before all native capture taps.

**Tech Stack:** React Native, Expo Camera 55, Vitest, Maestro, Bash policy tests.

---

### Task 1: Prove the missing Android readiness contract

**Files:**

- Modify: `apps/mobile/screens/camera-capture.test.tsx`
- Test: `apps/mobile/screens/camera-capture.test.tsx`

- [ ] **Step 1: Make the CameraView mock expose size discovery**

Use `forwardRef` and `useImperativeHandle` so the mocked native ref exposes
`getAvailablePictureSizesAsync`.

- [ ] **Step 2: Add the failing behavioral test**

Render default wiring on Android and assert:

1. the shutter starts disabled;
2. the first ready callback selects `1856x1392` and remains disabled; and
3. the second ready callback enables the shutter.

- [ ] **Step 3: Verify red**

Run:

`pnpm --filter @harpa/mobile exec vitest run screens/camera-capture.test.tsx`

Expected: FAIL because the shutter is currently enabled before native
readiness.

### Task 2: Implement the minimal native gate

**Files:**

- Modify: `apps/mobile/screens/camera-capture.tsx`
- Test: `apps/mobile/screens/camera-capture.test.tsx`

- [ ] **Step 1: Track readiness**

Initialize readiness from `takePicture != null`. In `onCameraReady`, retain
false on Android when a new preferred picture size is applied; otherwise set it
true. Reset it before flipping the default camera.

- [ ] **Step 2: Gate the shutter**

Set `disabled` from:

`!isCameraReady || isCapturing || captures.length >= maxBurst`.

- [ ] **Step 3: Verify green**

Run:

`pnpm --filter @harpa/mobile exec vitest run screens/camera-capture.test.tsx`

Expected: PASS, including the new Android callback-order test.

### Task 3: Share the semantic Maestro wait

**Files:**

- Create: `.maestro/helpers/wait-for-camera-shutter-ready.yaml`
- Modify: `.maestro/modules/10a-photo-notes-draft.yaml`
- Modify: `.maestro/modules/10b-photo-notes-finalized.yaml`
- Modify: `.maestro/helpers/capture-one-photo-note.yaml`
- Modify: `.maestro/native-input-smoke.yaml`
- Modify: `scripts/ci/__tests__/release-confidence-gates.test.sh`

- [ ] **Step 1: Add failing policy assertions**

Require the helper to select `btn-camera-shutter` with `enabled: true`.
Require two helper calls in each burst module and one in each single-capture
flow.

- [ ] **Step 2: Verify red**

Run:

`bash scripts/ci/__tests__/release-confidence-gates.test.sh`

Expected: only the new camera-readiness assertions fail.

- [ ] **Step 3: Implement the helper and consumers**

The helper performs a bounded `extendedWaitUntil` for the visible, enabled
shutter. Burst modules invoke it before each tap; single-capture flows invoke it
before their one tap.

- [ ] **Step 4: Verify green**

Rerun the policy test and the focused mobile test. Expected: zero failures.

### Task 4: Close the second report-overlay race

**Files:**

- Modify: `.maestro/modules/08-text-notes.yaml`
- Modify: `scripts/ci/__tests__/release-confidence-gates.test.sh`

- [ ] **Step 1: Add a failing ordering assertion**

Require the second auto-regeneration helper call to occur after note
disappearance and before `btn-draft-options`.

- [ ] **Step 2: Verify red**

Run the release-confidence policy and expect only the new ordering assertion to
fail.

- [ ] **Step 3: Add the shared regeneration wait**

Invoke `../helpers/wait-for-auto-regeneration.yaml` after the deleted note is
absent and before opening draft actions.

- [ ] **Step 4: Verify green**

Rerun the release-confidence policy and expect zero failures.

### Task 5: Verify and publish

**Files:**

- Modify: `.maestro/README.md`
- Modify: `docs/v4/arch-testing.md`
- Modify: `docs/bugs/README.md`
- Create: `docs/bugs/2026-08-07-camera-shutter-native-readiness.md`

- [ ] **Step 1: Document the readiness contract and recurring bug**

Record the Android callback ordering, shared Maestro helper, and the rejection
of sleeps/retries.

- [ ] **Step 2: Run static verification**

Run mobile tests, release-confidence policy, lint, typecheck, root tests,
documentation links, formatting, and `git diff --check`.

- [ ] **Step 3: Run device verification**

Run regression twice on fresh emulators. Preserve artifacts and require both
passes.

- [ ] **Step 4: Publish atomically**

Commit with `fix(maestro): stabilize remaining Android flows`, push the
current `codex/` branch, open a ready PR against `dev`, wait for all required
checks, and merge without bypasses.

- [ ] **Step 5: Run the post-merge inventory**

Fast-forward local `dev` and run every current local Maestro entrypoint,
including CI launch and store screenshots, on the merged commit.
