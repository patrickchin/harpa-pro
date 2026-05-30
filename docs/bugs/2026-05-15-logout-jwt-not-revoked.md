# 2026-05-15 — `/auth/logout` deletes the session row but the JWT keeps working (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** After `POST /auth/logout` (200 OK), the bearer token
that was just "revoked" continues to authenticate every protected
route — `GET /me`, `POST /projects`, etc — until its JWT `exp`
naturally lapses (~7 days). Surfaced by the first journey
integration test
(`packages/api/src/__tests__/journeys/auth-crud.journey.integration.test.ts`),
which logs in via the real `/auth/otp/verify` path and then
expected `GET /me` to 401 post-logout.

**Root cause.** `middleware/auth.ts → withAuth()` validates only the
JWT signature + expiry. The per-request scope wrapper
(`db/scope.ts → withScopedConnection`) does `SET LOCAL app.session_id`
from the JWT's `sid` claim but never checks `auth.sessions` for an
existing row — so revoked sessions remain authenticated as long as
the JWT is signature-valid. The header comment in `middleware/auth.ts`
("Session-row validation … is enforced by route handlers — see e.g.
`routes/me.ts`") is stale; no route actually validates the session.

The existing `auth.integration.test.ts > logout deletes the session
row` test confirmed the DB row was gone but never made a
post-logout authenticated request, so the gap was invisible.
Classic R5 — the test asserted a side-effect, not the contract.

**Fix.** Pending. Either:
1. Have `withAuth()` look up `auth.sessions` by `sid` and 401 when
   the row is missing/expired (one DB roundtrip per authed
   request). Cache via short-lived in-memory revocation set if
   needed.
2. Use opaque session tokens (DB-backed) instead of stateless JWTs
   for the bearer envelope, keeping the JWT only as an internal
   signed claim payload.

Pending the fix, `auth-crud.journey.integration.test.ts` asserts
the DB-row deletion (current behaviour) and links to this entry.

**Test.** The journey suite
(`packages/api/src/__tests__/journeys/*.journey.integration.test.ts`)
should add — once the fix lands — `expect(/me-post-logout).toBe(401)`.

**Pattern.** R5 — DI stubs / test helpers (`signTestToken`) became
the de-facto spec. Every CRUD integration test mints tokens via
`signTestToken(userId, sessionId)`, so the full
`/auth/otp/verify` → CRUD → `/auth/logout` chain was never
exercised end-to-end and the revocation gap stayed invisible.
