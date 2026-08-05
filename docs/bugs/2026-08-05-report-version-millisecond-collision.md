# 2026-08-05 — Report versions did not advance at wire precision

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Attachment placement or PDF registration could leave a report's
serialized `updatedAt` unchanged. A later browser or mobile edit could then
reuse a stale version without detecting the intervening write. The release
review caught this before dev activation.

**Root cause.** Those two report writers assigned `updated_at = now()` while
the optimistic-concurrency contract exposed timestamps at millisecond
precision. Two writes in one millisecond could serialize to the same token.
A database clock behind a future-dated stored value could also move the token
backward. Other report mutations already used a monotonic SQL expression.

**Fix.** PR #211 makes attachment placement use the shared monotonic report
version expression. Forward-only migration
`0028_report_version_monotonic.sql` replaces `app.attach_report_pdf()` with
the same rule. Each write uses the later of the millisecond-truncated database
clock and the stored version plus one millisecond.

**Test.** The report integration suite sets `updated_at` to a future
millisecond before attachment placement and PDF registration. The resulting
report row must have a version later than the stored value.

**Pattern.** A serialized timestamp used as a concurrency token is a version
counter. Every writer must follow the same precision and monotonic-advance
rule, including secondary metadata writers.
