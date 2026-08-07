# 2026-08-06 — Native-input cleanup landed on the projects index

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The non-fixture Android smoke successfully started and cancelled
the real recorder, captured and discarded a real camera photo, and deleted its
draft. Cleanup then timed out waiting for `btn-project-edit`; the screenshot
showed the Projects index and the still-present test project.

**Root cause.** Deleting the draft uses `dismissOrReplaceTo` to return to the
reports list. Depending on the existing Expo Router stack, the following Back
can return to project home or collapse to the Projects index. Photo modules
already handled both valid outcomes, but the native-input flow assumed only
project home before invoking `delete-current-project.yaml`.

**Fix.** After leaving the reports list, the native-input flow waits for either
valid destination and conditionally delegates to `helpers/open-project.yaml`
before deleting the project.

**Test.** Release-confidence policy requires the union wait and requires the
project-open recovery to precede project deletion. The non-fixture Android
smoke remains the behavioral proof for recorder, camera, and cleanup.

**Pattern.** A navigation action can have more than one valid parent
destination after a destructive replace; E2E cleanup must synchronize on the
destination before assuming its controls exist.
