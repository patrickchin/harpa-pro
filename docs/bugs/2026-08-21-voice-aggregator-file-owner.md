# 2026-08-21 — Voice transcription confused visibility with ownership (Pattern R12)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** An owner or editor could submit another member's project-scoped
voice file to either standalone transcription or the report voice-note
aggregator. The routes could send that recording to the provider, charge the
caller's usage allowance, and, through the aggregator, create a note under the
caller's identity.

**Root cause.** Both routes assumed that `app.files` row visibility proved
file ownership. File RLS intentionally grants every current project member
read access so attachments work across a team; it therefore returned a
teammate's project-scoped file to both handlers.

**Fix.** Require `file.ownerId === userId` before usage checks, signed-URL
minting, or provider calls in both transcription paths. Return the same
`404 File not found` envelope for missing and visible-but-non-owner files.

**Test.** The Testcontainers aggregator suite makes Alice an editor in Bob's
project, seeds a Bob-owned voice file on Bob's report, proves the request is
rejected uniformly, and asserts that no note or usage event was created. The
cross-member attachment journey separately keeps the real fixture defaults,
proves that a member may fetch a shared attachment URL, then observes that the
rejected `/voice/transcribe` request mints no second signed URL, reads no AI
fixture, and creates no usage event.

**Pattern.** R12 — project membership and row visibility are not mutation or
ownership authorization.
