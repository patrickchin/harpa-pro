# 2026-11-11 — report commands bypass input synchronization

> See [README.md](README.md) for the recurring-bug index.

**Symptom.** A report marked as still synchronizing photos could be finalized
or regenerated through its action handlers. Automatic generation could also
replace unsaved edits. A quota rejection opened a dialog but allowed the
automatic-generation effect to submit again after the mutation settled.

**Root cause.** Readiness was exposed in an E2E marker, while controls,
handlers, and automatic generation each used different guards. Quota errors
returned before setting the generation failure that stops the effect.

**Fix.** One pure admission policy gates rendered controls, confirmation,
direct handlers, and automatic generation. Pending input or edits block body
writes. Finalization requires the owner role and a current saved body.
Generation/finalization acquire a synchronous command guard. Generation
failure remains latched when the quota dialog closes; manual retry is an
explicit action. A generation response cannot replace newer local edits.

**Test.** Route tests exercise pending photo uploads, unsaved edits, edits
during generation, editor permissions, and quota settlement/dialog close.
Policy tests cover every input/write blocker, empty input, and manual bodies
without AI timestamps.

**Pattern.** A readiness indicator needs the same authoritative guard at the
command boundary. An informational dialog is not ownership of retry state.
