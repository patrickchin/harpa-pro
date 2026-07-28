# 2026-07-28 — Preview email logs exposed bearer secrets (Pattern R11)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Preview and developer logs contained six-digit email
OTPs, waitlist confirmation URLs and tokens, rendered email bodies,
and full recipient addresses.

**Root cause.** The fake OTP callback and fake Resend transport treated
stdout as a manual-testing inbox. Fake mode disabled delivery but did
not apply the same secret-handling boundary expected of live transport
diagnostics.

**Fix.** This change routes both paths through metadata-only diagnostic
functions whose inputs exclude OTPs, tokens, URLs, bodies, subjects, and
whose recipient input is reduced to a validated domain before
serialization. The in-process fake Resend record remains available to
tests.

**Test.** `auth.preview-logging.test.ts` and `resend.test.ts` capture
console output with sentinel credentials and personal data, assert none
are present, and require useful event, recipient-domain, and delivery
metadata.

**Pattern.** New pattern R11 — added to `README.md`.
