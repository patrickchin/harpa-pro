# 2026-11-11 — report save acknowledgements outlive their edits

> See [README.md](README.md) for the recurring-bug index.

**Symptom.** A mobile save of edit A could mark newer edit B clean. A late
save on the office dashboard could also mark a different report dirty after
navigation and trigger an unintended write to that report.

**Root cause.** Mobile saves acknowledged one Boolean dirty flag rather than
the captured revision. The hook allowed another request before the first
settled. The dashboard reused its local body, save promise and callbacks
across report identities.

**Fix.** Mobile autosave owns one active write and acknowledges the captured
edit revision. Newer edits stay dirty and use the acknowledged server version
for the next request. A report-scoped owner rejects callbacks after identity
change or unmount. The dashboard keys its inner editor by report identity and
preserves a departing unsaved draft.

**Test.** Autosave tests hold A pending, edit B, then acknowledge A; B must
remain dirty and be saved with the returned version. Additional tests cover
report change and unmount. The dashboard ownership regression changes report
parameters during a delayed save and checks that no write targets the new
report.

**Pattern.** Async completion must belong to both the entity and revision it
started with. A current component mount alone is not sufficient ownership.
