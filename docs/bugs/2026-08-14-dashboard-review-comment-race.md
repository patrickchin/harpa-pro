# 2026-08-14 — Dashboard review journey raced its comment mutation

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** PR #336's deployed dashboard journey reported that a review
comment disappeared after reopening and finalizing a report. The failure
artifact showed the comment still in the viewer's composer alongside `Report
must be finalized before review.`

**Root cause.** The journey used `getByText(reviewComment)` immediately after
submitting. That locator also matched the draft text in the composer, so the
test could continue before the comment POST completed. It then reopened the
report as a draft; if that request won the race, the comment POST correctly
returned 409 and no comment was persisted.

**Fix.** PR #336 waits for the composer to clear and for a rendered comment
article containing the submitted text before it reopens the report.

**Test.** `dashboard-live-e2e-policy.test.sh` requires both synchronization
assertions, and the deployed dashboard live journey exercises the real
comment, reopen, and refinalize sequence.

**Pattern.** No existing recurring pattern. Semantic E2E locators must target
the post-mutation result, not text that is also present in the input surface.
