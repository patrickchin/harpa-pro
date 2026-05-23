# Curl journey tests

Black-box end-to-end tests written in plain bash + curl. They drive
the real REST API (local, dev, or production) the same way the mobile
app does, exercising auth → upload → AI → CRUD without any test
runner, mocks, or build step. Easy to read, easy to extend, easy to
run as a one-off when debugging.

Live AI calls (voice transcription, summarisation, title generation,
report generation) hit real providers on dev/prod and consume tokens.
Real binary samples for the voice steps live in
[`samples/real/`](../../samples/real/) (Git LFS).

## The journeys

| Script         | Purpose                                                                                | Live AI  | Cross-user |
| -------------- | -------------------------------------------------------------------------------------- | -------- | ---------- |
| `core.sh`      | **Golden happy path** — login → profile → project → report → text/image/voice notes → live transcription (short 10s clip) → generate → finalize → PDF. The one a real user takes on day one. | yes      | no         |
| `extended.sh`  | **Secondary features + light negatives** — 5 note kinds (text/image/PDF/WAV/M4A), pagination, members invite/role/remove, edit-finalized → 409, 404s on missing resources, project/report slug resolvers, plus a longer live aggregator run on a richer ~4:34 sample. | yes      | yes (PHONE2) |
| `stress.sh`    | **Abuse & failure modes** — 58 assertions: bad credentials, rate-limit on `/auth/password/verify`, malformed JSON, oversized/zero-byte uploads, cross-user 404s, viewer permission boundaries, double-finalize idempotency, wrong-method 404s, invalid IDs, etc. No live AI. | no       | yes (PHONE2) |
| `all.sh`       | Runner. Targets `local` / `dev` / `prod` / arbitrary URL. Supports `ONLY=core\|extended\|stress` and `SKIP_STRESS=1`. | — | — |
| `journey.sh`   | Legacy/reference journey kept for diffing against the newer scripts. Not part of `all.sh`. | yes | no |

## Running

```bash
# Required: PASSWORD = test-account password (from Doppler for dev)
export PASSWORD="$(doppler secrets get TEST_ACCOUNT_PASSWORD --plain \
  --project harpa-pro --config dev)"

# Whole suite against dev (default)
bash scripts/journeys/all.sh

# Single journey against local API
bash scripts/journeys/all.sh local
ONLY=core bash scripts/journeys/all.sh local

# Against production — uses real AI tokens, gated by a 3s pause
bash scripts/journeys/all.sh prod
```

## Env vars

| Var                     | Default                              | Notes                                                              |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `PASSWORD`              | —                                    | **Required.** Test-account password.                               |
| `PHONE`                 | `+15550199001`                       | Primary test account (in dev's `TEST_ACCOUNT_PHONES`).             |
| `PHONE2`                | `+15550199002`                       | Secondary test account for cross-user / member tests.              |
| `VOICE_M4A`             | `samples/real/site-rain-10s.m4a`     | Voice sample for `core.sh` / `journey.sh`.                         |
| `VOICE_DURATION_SEC`    | `10`                                 | Reported duration for the voice aggregator call.                   |
| `VOICE_LONG`            | `samples/real/framing-modular-house.m4a` | Longer aggregator sample used by `extended.sh`.                |
| `VOICE_LONG_DURATION_SEC` | `274`                              | Reported duration for the long sample.                             |
| `ONLY`                  | unset                                | `core` / `extended` / `stress` — runs only the named journey.      |
| `SKIP_STRESS`           | unset                                | Set `1` to skip the stress journey when running everything.        |

## Test accounts

Configured via Doppler in the API project's `dev` config under
`TEST_ACCOUNT_PHONES` (CSV) + `TEST_ACCOUNT_PASSWORD`. Currently:

- `+15550199001`
- `+15550199002`

Production deliberately has no test accounts (`TEST_ACCOUNT_PASSWORD`
unset), so cross-user steps in `extended.sh` / `stress.sh` skip
gracefully when only one phone resolves.

## Caveats discovered while writing these

A few API quirks the scripts intentionally assert as-is (rather than
"the obvious" status code) — see comments in each script:

- `PATCH /me` with `{}` returns 200 (no-op).
- `POST /projects` silently strips unknown fields (Zod default).
- Wrong HTTP method on an existing route returns 404, not 405.
- Double finalize is idempotent (200); double unfinalize → 409.
- Cross-user access returns 404, not 403 (RLS-style resource hiding).
- Viewers can `PATCH /projects/:id` (no role gate) — flagged as a
  likely bug in `stress.sh`.

When fixing any of these, update the corresponding assertion.
