# 2026-10-16 — Dependency smoke-test version drift

> See [`README.md`](README.md) for the index of all bug entries.

**Symptom.** The Astro/Vite Dependabot update failed site/admin smoke tests
and the unit workflow before browser verification could run.

**Root cause.** The manifests moved to Astro 7.3.6 and Vite 8.3.3 while the
reviewed-version assertions still required Astro 7.3.3 and Vite 8.3.0.

**Fix.** Align the assertions with the reviewed patches in the consolidated
update, and document updating assertions alongside manifests and the lockfile.

**Test.** Existing site/admin smoke tests now pass with the updated graph;
full workspace lint, typechecking, and tests also pass. Keep the exact version
assertions as the reviewed baseline for future dependency changes.
