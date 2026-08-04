# 2026-08-04 — API coverage hid failing tests behind blob-only output

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The API integration workflow failed twice in coverage shard 1,
but the Actions log showed only that the blob report had been written and that
Vitest exited with status 1. It did not identify the failing file, test, or
assertion, so an unchanged-head rerun produced no new diagnostic evidence.

**Root cause.** `packages/api/scripts/test-coverage.sh` selected only Vitest's
`blob` reporter for the unit and integration processes. Blob output is useful
for the final merged coverage report, but it intentionally stores test results
instead of rendering the normal failure report to the terminal.

**Fix.** Run the `default` and `blob` reporters together for every shard, and
route `--outputFile.blob` to the temporary merge directory. CI now keeps the
same bounded multi-process coverage merge while also printing any failed test
and assertion in the job log. Passing-test console output stays suppressed so
the diagnostic signal is not buried by expected error-path fixtures.

**Test.** The release-confidence policy requires both reporters and the
reporter-specific blob output for both coverage commands. A focused Vitest
smoke also verifies that the default summary is printed while a non-empty blob
report is created.

**Pattern.** Machine-readable CI artifacts must not be the only failure
channel. When a later merge step depends on an intermediate report, pair that
reporter with human-readable terminal output so the first failed attempt is
actionable.
