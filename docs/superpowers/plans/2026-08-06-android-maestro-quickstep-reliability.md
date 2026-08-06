# Android Maestro Quickstep Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent recurring Android Quickstep ANR dialogs from obscuring the PR-time Maestro launch smoke while retaining fail-closed Harpa readiness checks.

**Architecture:** Configure the disposable Android test device in the existing shell runner before app installation, then read the setting back and stop if it was not applied. Pin that contract with the existing static release-confidence test and document the emulator-only boundary and retained semantic assertions.

**Tech Stack:** Bash, Android Debug Bridge, Maestro, GitHub Actions policy tests, Markdown

---

### Task 1: Add the regression gate

**Files:**
- Modify: `scripts/ci/__tests__/release-confidence-gates.test.sh:423-451`
- Test: `scripts/ci/__tests__/release-confidence-gates.test.sh`

- [ ] **Step 1: Require suppression, verification, and ordering**

Insert these assertions after the strict-Bash assertion and before the Maestro
CLI assertion:

```bash
require_fixed "scripts/ci/run-maestro-launch-smoke.sh" \
  "adb shell settings put global hide_error_dialogs 1" \
  "Maestro smoke suppresses system crash and ANR dialogs on the test emulator"
# This is a literal runner-script string, not a policy-test expansion.
# shellcheck disable=SC2016
require_fixed "scripts/ci/run-maestro-launch-smoke.sh" \
  'hide_error_dialogs="$(adb shell settings get global hide_error_dialogs | tr -d '\''\r'\'')"' \
  "Maestro smoke reads back the Android error-dialog setting"
# shellcheck disable=SC2016
require_fixed "scripts/ci/run-maestro-launch-smoke.sh" \
  'if [[ "$hide_error_dialogs" != "1" ]]; then' \
  "Maestro smoke fails closed when Android rejects error-dialog suppression"
require_before "scripts/ci/run-maestro-launch-smoke.sh" \
  "adb shell settings put global hide_error_dialogs 1" \
  "adb shell settings get global hide_error_dialogs" \
  "Maestro smoke sets Android error-dialog suppression before verifying it"
require_before "scripts/ci/run-maestro-launch-smoke.sh" \
  "adb shell settings get global hide_error_dialogs" \
  'maestro" test' \
  "Maestro smoke verifies Android error-dialog suppression before the flow"
```

- [ ] **Step 2: Run the policy test and observe RED**

Run:

```bash
bash scripts/ci/__tests__/release-confidence-gates.test.sh
```

Expected: non-zero exit with failures for the missing `hide_error_dialogs`
configuration, read-back, fail-closed check, and ordering.

- [ ] **Step 3: Commit the failing regression gate**

```bash
git add scripts/ci/__tests__/release-confidence-gates.test.sh
git commit -m "test(ci): guard Android ANR suppression"
```

### Task 2: Configure the Android test device

**Files:**
- Modify: `scripts/ci/run-maestro-launch-smoke.sh:32`
- Test: `scripts/ci/__tests__/release-confidence-gates.test.sh`

- [ ] **Step 1: Add the minimal fail-closed runner setup**

Insert this block immediately before `adb install`:

```bash
adb shell settings put global hide_error_dialogs 1
hide_error_dialogs="$(adb shell settings get global hide_error_dialogs | tr -d '\r')"
if [[ "$hide_error_dialogs" != "1" ]]; then
  printf 'Expected Android hide_error_dialogs=1, got %s\n' \
    "$hide_error_dialogs" >&2
  exit 1
fi

```

- [ ] **Step 2: Run syntax and policy checks and observe GREEN**

Run:

```bash
bash -n scripts/ci/run-maestro-launch-smoke.sh
bash scripts/ci/__tests__/release-confidence-gates.test.sh
```

Expected: both commands exit zero and the policy output reports all
release-confidence gates as passing.

- [ ] **Step 3: Commit the runner fix**

```bash
git add scripts/ci/run-maestro-launch-smoke.sh
git commit -m "fix(ci): suppress Android system ANR dialogs"
```

### Task 3: Record the recurring failure and operating contract

**Files:**
- Create: `docs/bugs/2026-08-06-quickstep-anr-dialog-recurrence.md`
- Modify: `docs/bugs/README.md:349`
- Modify: `docs/bugs/2026-08-04-expo-dev-launcher-readiness-race.md:41-51`
- Modify: `.maestro/README.md:31-62`
- Modify: `docs/v4/arch-testing.md:113-142`

- [ ] **Step 1: Add the recurring-bug detail**

Create a bug note with five explicit sections:

```markdown
# 2026-08-06 — Recurring Quickstep ANR dialogs obscure Maestro

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Recent Android PR smoke artifacts repeatedly showed Harpa's email
form or Expo's ready Metro server row behind `Quickstep isn't responding`.
Fixed conditional dismissals passed on retries at the same SHA but failed when
the system dialog appeared again later in the flow.

**Root cause.** Quickstep is emulator system UI, outside the application under
test. Android can recreate its ANR dialog after Maestro dismisses an earlier
instance, so a flow with any fixed number of conditional taps still races the
system process. The final Harpa selector was healthy underneath the modal in
the inspected artifacts.

**Fix.** On the disposable test emulator, the launch-smoke runner writes
Android's global `hide_error_dialogs=1` setting and reads it back before
Maestro starts. The runner exits if the device does not return `1`. Existing
semantic Quickstep recovery stays as defense in depth, and the flow still
requires `input-email`, so product and Metro failures remain visible.

**Test.** The release-confidence policy requires the write, read-back,
fail-closed branch, and ordering before the Maestro command. Bash syntax,
policy checks, repeated local launch-smoke runs, and the PR-time Android job
exercise the change.

**Pattern.** Follow-up to the fixed-count recovery in
[`2026-08-04-expo-dev-launcher-readiness-race.md`](2026-08-04-expo-dev-launcher-readiness-race.md):
environmental system UI must be neutralized at the disposable-device boundary,
while product readiness remains a strict in-flow assertion.
```

- [ ] **Step 2: Add the bug index entry and link the earlier incident**

Add a most-recent-first August 6 entry to `docs/bugs/README.md` describing the
recurrence and emulator-setting fix. Add a short follow-up paragraph to the
August 4 detail pointing to the new bug note so the older exactly-two-handler
contract is not mistaken for the current complete mitigation.

- [ ] **Step 3: Update the Maestro and architecture runbooks**

In `.maestro/README.md`, change both stale 180-second Maestro limits to 420
seconds and document that the runner sets and verifies
`hide_error_dialogs=1` before app installation. In `docs/v4/arch-testing.md`,
add the same emulator-only setting and describe the two in-flow Quickstep
handlers as defense in depth rather than the primary deterministic boundary.

- [ ] **Step 4: Validate documentation and commit**

Run:

```bash
git diff --check
node scripts/check-doc-links.mjs
```

Expected: both commands exit zero.

```bash
git add .maestro/README.md docs/bugs/README.md \
  docs/bugs/2026-08-04-expo-dev-launcher-readiness-race.md \
  docs/bugs/2026-08-06-quickstep-anr-dialog-recurrence.md \
  docs/v4/arch-testing.md
git commit -m "docs(ci): record recurring Quickstep ANR mitigation"
```

### Task 4: Verify the fix locally and publish it

**Files:**
- Verify: `scripts/ci/run-maestro-launch-smoke.sh`
- Verify: `.maestro/ci-launch-smoke.yaml`

- [ ] **Step 1: Run the focused repository checks**

```bash
bash scripts/ci/__tests__/release-confidence-gates.test.sh
bash scripts/check-maestro-appid.sh
bash scripts/check-no-maestro-point-taps.sh
bash scripts/check-maestro-testids.sh
node scripts/check-doc-links.mjs
git diff --check origin/dev...HEAD
```

Expected: every command exits zero.

- [ ] **Step 2: Prepare the local Android emulator and fresh APK**

Run from PowerShell:

```powershell
$env:ANDROID_HOME = 'C:\Android\android-sdk'
$env:ANDROID_SDK_ROOT = 'C:\Android\android-sdk'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'
$env:APP_VARIANT = 'development'
$env:EXPO_PUBLIC_APP_VARIANT = 'development'
$env:EXPO_PUBLIC_API_URL = 'http://localhost:8787'
$env:EXPO_PUBLIC_USE_FIXTURES = 'true'
pnpm --filter @harpa/mobile exec expo prebuild --platform android --clean --no-install
Push-Location apps/mobile/android
.\gradlew.bat :app:assembleDebug --no-daemon -PreactNativeArchitectures=x86_64
Pop-Location
$emulatorLog = Join-Path $env:TEMP 'harpa-pro-emulator.log'
$emulatorErrorLog = Join-Path $env:TEMP 'harpa-pro-emulator-error.log'
Start-Process -FilePath 'C:\Android\android-sdk\emulator\emulator.exe' `
  -ArgumentList '-avd','test','-no-snapshot-load','-no-boot-anim' `
  -RedirectStandardOutput $emulatorLog -RedirectStandardError $emulatorErrorLog `
  -WindowStyle Hidden
& 'C:\Android\android-sdk\platform-tools\adb.exe' wait-for-device
for ($attempt = 1; $attempt -le 150; $attempt++) {
  Start-Sleep -Seconds 2
  $booted = (& 'C:\Android\android-sdk\platform-tools\adb.exe' shell `
    getprop sys.boot_completed).Trim()
  if ($booted -eq '1') { break }
}
if ($booted -ne '1') { throw 'Android emulator did not boot within 300 seconds' }
```

Expected: the x86_64 debug APK exists at
`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`, the emulator is
listed by `adb devices`, and `sys.boot_completed` is `1`.

- [ ] **Step 3: Run the launch smoke three times**

Run from PowerShell after Step 2:

```powershell
$gitBash = 'C:\Program Files\Git\bin\bash.exe'
1..3 | ForEach-Object {
  $attempt = $_
  $attemptDir = Join-Path $env:TEMP "harpa-maestro-launch-$attempt"
  New-Item -ItemType Directory -Force -Path $attemptDir | Out-Null
  $env:RUNNER_TEMP = $attemptDir.Replace('\', '/')
  $log = Join-Path $attemptDir 'runner.log'
  & $gitBash -lc `
    'cd /c/Users/pch/workspace/harpa-pro && bash scripts/ci/run-maestro-launch-smoke.sh' `
    *> $log
  if ($LASTEXITCODE -ne 0) {
    throw "Launch smoke attempt $attempt failed; see $log"
  }
}
```

Expected: all three commands exit zero and each log ends with the successful
`input-email` assertion. Preserve each attempt directory for review.

- [ ] **Step 4: Request independent review**

Ask a review subagent to compare `origin/dev...HEAD` against the design, test
contract, shell safety, and documentation. Resolve any actionable finding and
rerun the affected checks.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin codex/harden-android-maestro-smoke
gh pr create --base dev --head codex/harden-android-maestro-smoke --draft \
  --title "fix(ci): harden Android Maestro launch smoke" \
  --body "## Summary

- suppress recurring Quickstep ANR dialogs on the disposable Android test device
- verify the Android setting before Maestro and retain strict app readiness
- add regression policy coverage and update the testing/bug runbooks

## Test plan

- release-confidence policy test
- Maestro lint and testID checks
- three local Android launch-smoke runs"
```

Expected: a draft PR against `dev` containing the CI evidence, fix, local test
results, and documentation changes.

### Task 5: Merge safely and run the full local Maestro suite

**Files:**
- Verify: all current top-level `.maestro/*.yaml` and `.maestro/*.yml`
- Exclude: `.maestro/legacy/**`, `.maestro/pending/**`, and helper/module files
  that are already invoked by their parent journeys

- [ ] **Step 1: Wait for required PR checks**

Watch the PR until required checks are green. If the base becomes stale or a
required check fails, diagnose and fix normally; do not bypass protection.

- [ ] **Step 2: Mark ready and merge into `dev`**

Mark the PR ready, merge it with the repository's permitted method, switch this
checkout to `dev`, and run `git pull --ff-only origin dev`. Confirm the merged
commit is present before starting the long run.

- [ ] **Step 3: Inventory and schedule current entrypoints**

List top-level Maestro entrypoints, identify destructive/reset requirements,
and run them in an order that preserves isolation. The overnight coverage must
include the local `regression-journey.yaml`, focused native-input and report
review/placement flows, stress coverage, account deletion on a freshly reset
database, and any other current top-level test entrypoint. Do not execute
archived or explicitly pending flows.

- [ ] **Step 4: Run with durable logs and diagnostics**

Start the required Docker stack, auth broker, fixture or non-fixture Metro mode,
ADB reverse mappings, and device permissions per flow. Redirect each flow's
complete output to a timestamped file under `tmp/mo/runs`; capture screenshots,
UI hierarchy, logcat, service logs, and exit status for failures. Reset state
between incompatible/destructive flows.

- [ ] **Step 5: Report every result**

Provide a pass/fail table for each current entrypoint, distinguish product
failures from environment/harness failures, link local logs, and open a
follow-up fix only when the failure is within the authorized Maestro-reliability
scope.
