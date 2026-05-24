# 2026-05-15 — `auth.test.ts > rejects a tampered token` flakes ~6% (Pattern R6)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** PR #3 unit job failed with
`expected 200 to be 401` in
`packages/api/src/middleware/auth.test.ts:38` on commit `bbcbdfc`
(a CSS-only change to `apps/marketing`), while the immediately
preceding commit `b00ce5a` on the same branch was green. The "diff"
that triggered the failure had no causal relationship to the
failing test.

**Root cause.** The test "tampered" with the JWT by flipping its
last base64url character between `'A'` and `'B'`. HS256 signatures
are 32 bytes → 43 base64url chars; the last char encodes only 4
significant bits plus 2 padding bits that base64 decoders discard.
Chars `A`, `B`, `C`, `D` all share top-4 bits `0000`, so swapping
between them produces an **identical** decoded signature and the
token still verifies. Whether the flip actually mutates the
signature depends on the trailing char, which in turn depends on
the `iat` / `exp` timestamps embedded in the freshly-signed JWT —
roughly a 6% flake rate (4 of 64 base64url chars are equivalent
under the A↔B swap).

**Fix.** Tamper with the **payload** segment instead — flipping the
first payload char (always `e` in jose-issued tokens, since the
JSON starts with `{"`) to `a`. Any byte change in the
base64url-encoded payload invalidates the HMAC over
`header.payload`, so the verification deterministically fails.

**Test.** `packages/api/src/middleware/auth.test.ts > withAuth >
rejects a tampered token` — same test, deterministic tampering
strategy. Verified by running it 5× locally post-fix (5/5 green)
and by reasoning about the algebra of the swap.

**Pattern.** R6 — Probabilistic test inputs derived from
freshly-minted JWTs / random bytes / timestamps. The naive "flip a
char" trick is safe for character-aligned encodings (hex) but lossy
for base64/base64url when the encoding has padding bits. Mitigation:
when constructing "obviously invalid" variants of signed/encoded
blobs, mutate bytes in the **decoded** representation (or mutate a
segment whose every bit is significant — for JWTs, the header or
payload, not the tail of the signature).
