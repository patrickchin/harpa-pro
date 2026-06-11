# Maestro-on-Windows pitfalls

This document catalogs pitfalls hit while pushing E2E coverage with
Maestro 2.5.1 on Windows / PowerShell 7, driving a real Android
device (Samsung, serial `R3CT7092S2H`) against the local
docker-compose API stack in fixture-replay mode. The regression
journey under test is
[`.maestro/regression-journey.yaml`](../../.maestro/regression-journey.yaml)
— a ~20–25 min full-app sweep across auth, projects, reports, notes,
members, and settings.

For the macOS / iOS-Simulator counterpart see
[`pitfalls-maestro-mac.md`](./pitfalls-maestro-mac.md). When working
on either platform, read both — many "platform specific" issues turn
out to have a cross-platform analog.

Symptoms below are what the bash tool / Maestro CLI actually print on
this host; workarounds are what we ended up shipping in the journey
and its helpers.

---

## Pitfall 1 — `Start-Process` reports spurious `ChildProcess.kill` error

**Symptom.** The opencode bash tool prints `Unknown: ChildProcess.kill`
when invoking `Start-Process … -PassThru | Select-Object`. Looks like
a fatal launch failure.

**Cause.** Tool-side wrapper noise around piping `Start-Process`
output. The Maestro JVM actually starts fine; the error is emitted
after the child detaches.

**Workaround.**

- Ignore the `ChildProcess.kill` line.
- Verify the process is alive with `Get-Process java`.
- Tail the redirected log file, never stdout inline. Always redirect:
  `… > tmp/maestro-jX.log 2> tmp/maestro-jX.err.log`.

---

## Pitfall 2 — Maestro `evalScript` outputs must be referenced as `${output.X}`

**Symptom.** Writing `output.REPORT_NUMBER = '1'` and later asserting
`id: "report-view-${REPORT_NUMBER}"` silently expands to
`report-view-undefined`. No error, just a selector that never matches.

**Cause.** Maestro 2.5.1 binds `evalScript` results onto the `output`
namespace. Bare `${REPORT_NUMBER}` resolves against the empty
parameter scope.

**Workaround.** Always reference outputs through the `output.`
prefix: `id: "report-view-${output.REPORT_NUMBER}"`. The eval line
itself must also be wrapped (see Pitfall 5):
`- evalScript: ${output.REPORT_NUMBER = '1'}`.

---

## Pitfall 3 — Country picker requires search + `hideKeyboard` on small viewports

**Symptom.** Scrolling the unfiltered country FlatList to "United
States" is unreliable on the device. The soft keyboard pushes the US
row off-screen, and the search term `"United States"` doesn't always
hit due to the matcher implementation.

**Cause.** `CountryPickerModal.tsx#matches` does
`country.code.toLowerCase().includes(q)` — it matches against the
country *code*, not the display name. Combined with keyboard
occlusion, name-based searches are doubly unreliable.

**Workaround.** Use the
[`.maestro/helpers/pick-country-us.yaml`](../../.maestro/helpers/pick-country-us.yaml)
helper:

1. Open the picker.
2. Focus `country-picker-search`.
3. `inputText: "us"` (matches Australia / Austria / US — all fine).
4. `hideKeyboard`.
5. `tapOn id: country-option-US`.

After `hideKeyboard` the US row is reliably in the visible window.

---

## Pitfall 4 — `btn-new-report` create-vs-navigate race on real Android

**Symptom.** Tapping `btn-new-report` then expecting the generate
screen sometimes lands the user back on the report list with a fresh
`report-row-*` instead. Intermittent, device-only.

**Cause.** `create.mutate()` followed by `router.push('/.../generate')`
races the list refetch. On real Android the refetch occasionally wins
and re-mounts the list before navigation commits.

**Workaround.** After `tapOn id: btn-new-report`, always:

- `extendedWaitUntil visible: report-row-.*`
- `tapOn id: report-row-.*`

This lands on generate deterministically by going through the list
row instead of relying on the create-time push.

---

## Pitfall 5 — `evalScript` body must be wrapped in `${...}`

**Symptom.** `- evalScript: output.X = '1'` runs as a no-op. The
binding is never assigned; downstream `${output.X}` is `undefined`.

**Cause.** Maestro 2.5.1 only evaluates `evalScript` content when
wrapped in `${...}`. Bare expressions are treated as opaque strings.

**Workaround.** Always wrap: `- evalScript: ${output.X = '1'}`.

---

## Pitfall 6 — Note delete uses a two-stage sheet, not a separate confirm dialog

**Symptom.** A `dialog-action-confirm-delete-note` testID matcher
never resolves, even though the delete confirm visibly renders.

**Cause.** `NoteOptionsSheet.tsx` reuses one `AppDialogSheet` and
toggles `stage` from `menu` → `confirm-delete` in-place. The confirm
button testID is `btn-note-options-confirm-delete`. The other ID
(`dialog-action-confirm-delete-note`) exists in
`GenerateReportDialogs.tsx` for a different flow that is not actually
reachable from the note sheet.

**Workaround.** Use `btn-note-options-confirm-delete` for note delete
confirmation. Do not reuse the report-generate dialog IDs.

---

## Pitfall 7 — Draft delete is a direct dialog, not a menu

**Symptom.** Expecting an options sheet after tapping
`btn-draft-options` — Maestro times out waiting for menu items.

**Cause.** `btn-draft-options` is a Pressable that opens
`dialog-action-confirm-delete-draft` directly. There is no
intermediate sheet. Additionally, `onDeleteDraft` is only wired when
`status !== 'finalized'`, so the button vanishes after finalization.

**Workaround.**

- Tap `btn-draft-options` → expect `dialog-action-confirm-delete-draft`
  immediately.
- Only exercise the delete-draft flow before finalization.

---

## Pitfall 8 — Project members screen has no inline role-change UI

**Symptom.** Tapping `member-role-badge-<userId>` does nothing.
Looking for a role-change menu or picker yields nothing.

**Cause.** The badge is a non-interactive label. There is no inline
role-change UI on the members screen.

**Workaround.** To change a role:

1. `btn-remove-member-<userId>` (Trash button on non-owner rows).
2. `confirm-remove-member`.
3. Re-invite via the add-member form.

The add-member form is collapsed by default — expand it with
`btn-show-add-member` before `input-member-phone` is queryable.

---

## Pitfall 9 — Viewers don't see `btn-project-edit` or `btn-new-report`

**Symptom.** Maestro times out on `btn-project-edit` /
`btn-new-report` waits during viewer flows even though navigation to
project home succeeded.

**Cause.** Both controls are hidden for the `viewer` role.

**Workaround.** For viewer flows, use `link-project-members` as the
"I'm on project home" wait target instead.

---

## Pitfall 10 — Project home renders no role badge

**Symptom.** Asserting "Editor" / "Viewer" on project home fails.

**Cause.** Role badges only render on the members screen.

**Workaround.** Module 04 navigates via `link-project-members` and
asserts the badge text ("Editor" / "Viewer") there.

---

## Pitfall 11 — `EXPO_PUBLIC_*` env vars are bundled by Metro at build time

**Symptom.** Flipping `EXPO_PUBLIC_USE_FIXTURES` (or any flag gating
dev-only testIDs like `btn-open-report-debug` via
`showDeveloperSection`) and reloading JS has no effect — the old
value is still in the bundle.

**Cause.** Metro inlines `EXPO_PUBLIC_*` at bundle time. Neither a JS
reload nor a Metro restart re-evaluates them.

**Workaround.** Full rebuild (`pnpm ios` / `eas build`) when any
`EXPO_PUBLIC_*` toggle changes. Plan journeys around a single build
mode.

---

## Pitfall 12 — Don't tail long Maestro runs inline

**Symptom.** Inline `maestro test …` invocations get killed at ~2 min
with the opencode bash tool's default timeout. A full journey is
~20–25 min.

**Cause.** Bash tool default timeout is 120000 ms; Maestro stdout
streams continuously so the tool keeps the wait alive past the limit.

**Workaround.**

- Redirect stdout to `tmp/maestro-jX.log` (+ stderr to
  `tmp/maestro-jX.err.log`).
- Poll in short batches:
  `Start-Sleep <seconds>; Get-Process java; Get-Content tmp/maestro-jX.log -Tail 50`.
- Never `Get-Content -Wait` inline.

---

## Pitfall 13 — "Resume from mid-journey" doesn't work reliably

**Symptom.** Running only modules 09+ to skip already-passing steps
fails on the first selector — usually an auth or onboarding gate that
no longer matches.

**Cause.** App/device state drifts between runs: process is killed,
navigation stack resets, Metro reloads, and JWT/onboarding state on
device gets out of sync with the DB. Preconditions for module 09+
assume the side-effects of 01–08.

**Workaround.** Always run the full journey from module 01 after a
clean reset (see Pitfall 15). Don't ship a "partial harness" that
skips early modules.

---

## Pitfall 14 — `Select-String -Recurse` doesn't exist

**Symptom.** `Select-String -Recurse -Pattern '…' -Path .` errors:
parameter not recognised.

**Cause.** PowerShell's `Select-String` has no `-Recurse` flag. It
greps a stream / a flat path list.

**Workaround.** `Get-ChildItem -Recurse -Filter '*.yaml' | Select-String -Pattern '…'`
— or, preferably, use the opencode `grep` tool, which is faster and
respects `.gitignore`.

---

## Pitfall 15 — DB + device reset procedure between runs

**Symptom.** Reruns fail on auth (existing JWT on device, existing
user in DB) or onboarding (stale `user_settings`). One-sided resets
leave orphaned state.

**Cause.** Two stateful surfaces (Postgres + Android app data) must
both be cleared. DB-only leaves stale JWT/onboarding state on device;
app-clear-only leaves orphaned users in Postgres.

**Workaround.** Reset both, in this order, between every full run:

```powershell
docker exec -i harpa-pro-pg psql -U postgres -d harpa -c `
  "TRUNCATE app.notes, app.files, app.reports, app.project_members, `
   app.projects, app.user_settings, app.waitlist_signups, `
   public.\"session\", public.\"account\", public.\"verification\", public.\"user\" `
   RESTART IDENTITY CASCADE;"

adb -s R3CT7092S2H shell pm clear com.harpa.pro.dev
```

---

## Pitfall 16 — Module 11 fix verified by inspection but not by a passing run

**Symptom.** With the `${output.REPORT_NUMBER}` substitution corrected
(Pitfall 2), Maestro now queries `report-view-1` — but the assertion
still fails: `report-view-1` is not visible despite `report-tab-pane`
being visible.

**Cause.** Likely a render-timing race. The tab pager renders the
pane container, but the inner `ReportView` is conditional on
`report != null`, and the generate→view transition may not have
completed when the assertion fires. Unconfirmed.

**Workaround (pending).** Replace the bare `assertVisible` with
`extendedWaitUntil visible: report-view-${output.REPORT_NUMBER}` and
re-run a full journey. Until that's verified end-to-end, module 11
remains "verified by inspection" only.

---

## Pitfall 17 — `e2e-maestro-testid-gate` trips on template-resolved testIDs

**Symptom.** PR check `e2e-maestro-testid-gate` fails with
`MISSING: country-option-US` even though the helper passes at runtime
on device. The literal string `country-option-US` cannot be `grep`ed
out of `apps/mobile/`.

**Cause.** `scripts/check-maestro-testids.sh` greps mobile source for
the literal text of every `id:` in `.maestro/modules/`,
`.maestro/helpers/`, and `regression-journey.yaml`. When the source
renders the testID from a template literal —
``testID={`country-option-${item.code}`}`` in
`apps/mobile/components/CountryPickerModal.tsx` — the resolved string
`country-option-US` never appears verbatim. Two other template IDs
(`picker-member-role-editor`, `picker-member-role-viewer`) are
already in a `KNOWN_TEMPLATE_IDS` allowlist in the script for the
same reason.

**Workaround.** Add new template-resolved IDs to the allowlist:

```bash
# scripts/check-maestro-testids.sh
KNOWN_TEMPLATE_IDS="picker-member-role-editor picker-member-role-viewer country-option-US"
```

Also append a line to the script's header comment block documenting
the template source, so the allowlist stays self-explanatory:

```bash
#   country-option-US          →  testID={`country-option-${item.code}`}
```

Verify locally under WSL or Git Bash (not native pwsh — see
Pitfall 18): `bash scripts/check-maestro-testids.sh`.

---

## Pitfall 18 — CRLF on `*.sh` breaks pre-push hooks on Windows

**Symptom.** `git push` fails with `husky - pre-push script failed
(code 1)`. The failing helper crashes early:

```
scripts/check-secrets.sh: line 17: $'\r': command not found
scripts/check-secrets.sh: line 18: set: pipefail
: invalid option name
```

Bash never gets to the actual logic; the hook reports a failure that
looks like "secret detected" or "test failed" but is really a parser
crash.

**Cause.** Git is configured with `core.autocrlf=true` on this
checkout, and `.gitattributes` doesn't pin `*.sh` files to LF. The
on-disk copy of `scripts/check-secrets.sh` (and any other shell
helper) has `\r\n` line endings; bash parses
`set -euo pipefail\r` and fails on the invisible `\r` as part of the
`pipefail` option name. `git ls-files --eol scripts/check-secrets.sh`
confirms `i/lf  w/crlf` (LF in index, CRLF in working tree).

**Workaround (immediate, per push).** The secret-scan hook honours an
explicit bypass — set `SKIP_SECRET_CHECK=1` in the launching shell:

```powershell
$env:SKIP_SECRET_CHECK = "1"
git push --force-with-lease origin <branch>
```

The hook code:

```bash
[ "${SKIP_SECRET_CHECK:-}" = "1" ] || bash scripts/check-secrets.sh
```

**Workaround (proper, permanent fix).** Add to `.gitattributes`:

```
*.sh text=lf eol=lf
```

Then `git add --renormalize . && git commit` to rewrite the index
entries with LF. After the rebase/normalize, every Windows checkout
will materialize `*.sh` files with LF endings regardless of
`core.autocrlf`. Recommended as a standalone PR — don't mix it into
unrelated feature branches.

---

## Pitfall 19 — Phantom "modified" files on Windows after rebase or normalize

**Symptom.** `git status` shows a long list of modified tracked
files — `apps/mobile/screens/__snapshots__/*.snap`,
`apps/mobile/lib/api/hooks.ts`, `packages/api-contract/openapi.json`,
`packages/api-contract/src/generated/types.ts`, etc. — typically
right after a rebase, branch switch, or running a script that
touches them. The list overlaps suspiciously with files that
upstream `dev` changed, raising fears of imminent merge conflicts.

**Cause.** Same CRLF mechanism as Pitfall 18, applied to non-shell
files. `core.autocrlf=true` rewrites line endings on materialization,
but the working-tree hash differs from the index hash, so git marks
the files modified. `git diff <file>` returns **zero bytes** — there
is no content change, only line-ending drift.

**Workaround.**

1. Confirm it's CRLF noise, not real edits:

   ```powershell
   git diff --stat            # expect warnings about "LF will be replaced by CRLF"
   git diff <suspect-file>    # expect zero bytes of output, just warnings
   ```

2. Discard the phantom changes:

   ```powershell
   git checkout -- .          # safe: only touches tracked files with no real diff
   ```

3. If a rebase is pending and the list of phantom files overlaps
   with files modified on `origin/dev`, **don't panic** — git will
   fast-apply dev's diff once the phantom modifications are gone.
   No real conflict will materialize.

The same `.gitattributes` fix from Pitfall 18 prevents this for
specific filetypes; pinning `*.snap`, `*.json`, `*.ts` etc. to LF
would be invasive across the monorepo, so for now treat
`git checkout -- .` as the standard "clean up before rebase" step on
Windows.

---

## Pitfall 20 — `adb reverse` drops on device disconnect / reboot

**Symptom.** App boots but every network call fails — Metro bundle
404, API requests time out. `adb devices` still lists the device.
Often follows a USB-cable wobble, a device reboot, or a reinstall.

**Cause.** `adb reverse` mappings are per-adb-session and per-device
connection. They survive `pm clear` (which only wipes app sandbox
data) but not transport-level events: cable disconnect, device
reboot, `adb kill-server`, or losing USB power-saving on the host.
Once the reverse is gone, `localhost:8081` (Metro),
`localhost:8787` (API), and `localhost:9000` (MinIO / signed photo
URLs) on the device point at nothing.

**Workaround.** After any disconnect/reboot, re-establish both
reverses before launching the app:

```powershell
adb -s R3CT7092S2H reverse tcp:8081 tcp:8081   # Metro
adb -s R3CT7092S2H reverse tcp:8787 tcp:8787   # API (docker-compose)
adb -s R3CT7092S2H reverse tcp:9000 tcp:9000   # MinIO / local R2
```

Verify with `adb -s R3CT7092S2H reverse --list`. A reset checklist
between full journeys is: (1) `adb reverse` all three ports, (2) DB
truncate, (3) `pm clear` (see Pitfall 15), (4) relaunch app.

---

## Pitfall 21 — Android DreamActivity can hide the app before Maestro asserts

**Symptom.** A journey launches the app, then immediately fails on the
first selector, such as `input-email`, even though the APK is installed
and the flow was working in the prior run. Screenshots show only a
blank device gradient or the Android screensaver, and
`adb shell dumpsys activity` reports
`com.android.dreams.basic/android.service.dreams.DreamActivity` as the
current focus.

**Cause.** A physical Android device can enter dream/screensaver mode
while the long setup steps are running. Maestro's `launchApp` can
return before the target app is visibly foregrounded, so the first
assertion runs against DreamActivity instead of Harpa.

**Workaround.** Keep the selected device awake and disable dream mode
before launching Maestro:

```powershell
adb -s R3CT7092S2H shell svc power stayon true
adb -s R3CT7092S2H shell settings put secure screensaver_enabled 0
adb -s R3CT7092S2H shell settings put secure screensaver_activate_on_sleep 0
adb -s R3CT7092S2H shell settings put secure screensaver_activate_on_dock 0
adb -s R3CT7092S2H shell input keyevent KEYCODE_WAKEUP
adb -s R3CT7092S2H shell input keyevent KEYCODE_MENU
```

`mo run` now does this automatically for Android targets selected via
`--device`, `MAESTRO_DEVICE`, or `.mo.json`, then checks
`dumpsys window`. If `Bouncer`, `isKeyguardShowing=true`, or
DreamActivity is still present, the device has a secure lock that adb
cannot bypass; unlock it manually before running the journey.

---

## Pitfall 22 — Android resolver sheet intercepts dev-client deep links

**Symptom.** Module 01 launches the dev client and opens the Metro
URL, then fails on `input-email`. The screenshot shows the Expo dev
launcher dimmed behind Android's "Open with" sheet with both
`Harpa Pro` and `Harpa Pro Dev` choices, and `dumpsys window` reports
`android/com.android.internal.app.ResolverActivity` as the current
focus.

**Cause.** Both prod and dev app variants can be installed on the
same physical device. The `exp+harpa-pro-v4://...` dev-client URL is
therefore an implicit intent with more than one matching handler, so
Android asks the user which app should receive it. Maestro keeps
running and the auth assertion times out behind the resolver.

**Workaround.** The shared
[`dismiss-open-dialog.yaml`](../../.maestro/helpers/dismiss-open-dialog.yaml)
helper now handles both platforms after `openLink`: when Android shows
`Open with`, it selects `Harpa Pro Dev` and taps `Always`; when iOS
shows the custom-scheme confirm sheet, it taps `Open`. It also repeats
the Expo dev-menu `Continue` / `Close` dismissal after the system UI
branches, because that sheet can render late after the resolver closes.
