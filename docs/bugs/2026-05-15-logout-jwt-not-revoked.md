# 2026-05-15 — `/auth/logout` deletes the session row but the JWT keeps working (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Status.** **Resolved by the better-auth migration.** Sessions now
live in `public.session` and better-auth's middleware validates the
bearer against that row on every request, so calling
`POST /api/auth/sign-out` revokes the token immediately. The remaining
historical narrative is preserved below for the recurring-pattern
cross-reference.

**Symptom.** After `POST /api/auth/sign-out` (200 OK), the bearer token
that was just "revoked" continues to authenticate every protected
route — `GET /me`, `POST /projects`, etc — until its JWT `exp`
naturally lapses (~7 days). Surfaced by the first journey
integration test
(`packages/api/src/__tests__/journeys/auth-crud.journey.integration.test.ts`),
which logged in via the real OTP verify path and then expected `GET
/me` to 401 post-logout.

**Root cause.** The legacy `middleware/auth.ts → withAuth()` validated
only the JWT signature + expiry. The per-request scope wrapper
(`db/scope.ts → withScopedConnection`) did `SET LOCAL app.session_id`
from the JWT's `sid` claim but never checked `auth.sessions` for an
existing row — so revoked sessions remained authenticated as long as
the JWT was signature-valid. The header comment in `middleware/auth.ts`
("Session-row validation … is enforced by route handlers — see e.g.
`routes/me.ts`") was stale; no route actually validated the session.

The existing `auth.integration.test.ts > logout deletes the session
row` test confirmed the DB row was gone but never made a
post-logout authenticated request, so the gap was invisible.
Classic R5 — the test asserted a side-effect, not the contract.

**Fix (now landed).** The auth stack was replaced with better-auth
(see `docs/v4/arch-auth-and-rls.md`). Better-auth issues opaque
session tokens, persists them in `public.session`, and the request
middleware short-circuits on a missing/expired row, so the
revocation contract is enforced without any custom session-row
lookup in route handlers.

**Test.** Post-migration the journey suite
(`packages/api/src/__tests__/journeys/*.journey.integration.test.ts`)
asserts `expect(/me-post-logout).toBe(401)` against the new
`POST /api/auth/sign-out` endpoint.

**Pattern.** R5 — DI stubs / test helpers (`signTestToken`) became
the de-facto spec. Every CRUD integration test minted tokens via
`signTestToken(userId, sessionId)`, so the full OTP-verify → CRUD →
sign-out chain was never exercised end-to-end and the revocation gap
stayed invisible.
