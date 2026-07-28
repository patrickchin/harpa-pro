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
| `extended.sh`  | **Secondary features + light negatives** — 5 note kinds (text/image/PDF/WAV/M4A), pagination, members invite/role/remove, edit-finalized → 409, 404s on missing resources, project/report slug resolvers, plus a longer live aggregator run on a richer ~4:34 sample. | yes      | yes (EMAIL2) |
| `stress.sh`    | **Abuse & failure modes** — 58 assertions: bad credentials, rate-limit on `/api/auth/sign-in/email`, malformed JSON, oversized/zero-byte uploads, cross-user 404s, viewer permission boundaries, double-finalize idempotency, wrong-method 404s, invalid IDs, etc. No live AI. | no       | yes (EMAIL2) |
| `all.sh`       | Runner. Targets `local` / `dev` / `prod` / arbitrary URL. Supports `ONLY=core\|extended\|stress` and `SKIP_STRESS=1`. | — | — |
| `journey.sh`   | Legacy/reference journey kept for diffing against the newer scripts. Not part of `all.sh`. | yes | no |

## Running

```bash
# Required: PASSWORD = test-account password (from Doppler for dev)
export PASSWORD="$(doppler secrets get TEST_ACCOUNT_PASSWORD --plain \
  --project harpa-pro --config dev)"

# Whole suite against dev (default) — runs stress → core → extended
bash scripts/journeys/all.sh

# Single journey against local API
bash scripts/journeys/all.sh local
bash scripts/journeys/all.sh local core

# Against production — uses real AI tokens, gated by a 3s pause
bash scripts/journeys/all.sh prod
```

## Env vars

| Var                     | Default                              | Notes                                                              |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `PASSWORD`              | —                                    | **Required.** Test-account password.                               |
| `EMAIL`                 | `test@harpapro.com`               | Primary test account (in dev's `TEST_ACCOUNT_EMAILS`).             |
| `EMAIL2`                | `test2@harpapro.com`                 | Secondary test account for cross-user / member tests.              |
| `VOICE_M4A`             | `samples/real/rain.m4a`     | Voice sample for `core.sh` / `journey.sh`.                         |
| `VOICE_DURATION_SEC`    | `10`                                 | Reported duration for the voice aggregator call.                   |
| `VOICE_LONG`            | `samples/real/framing.m4a` | Longer aggregator sample used by `extended.sh`.                |
| `VOICE_LONG_DURATION_SEC` | `274`                              | Reported duration for the long sample.                             |

## Test accounts

Configured via Doppler in the API project's `dev` config under
`TEST_ACCOUNT_EMAILS` (CSV) + `TEST_ACCOUNT_PASSWORD`. Currently:

- `test@harpapro.com`
- `test2@harpapro.com`
- `test3@harpapro.com`

Production may also configure the same stable emails for post-deploy
smoke tests. The password stays in secrets; the email addresses are not
secret.

## Caveats discovered while writing these

A few API quirks the scripts intentionally assert as-is (rather than
"the obvious" status code) — see comments in each script:

- `PATCH /me` with `{}` returns 200 (no-op).
- `POST /projects` silently strips unknown fields (Zod default).
- Wrong HTTP method on an existing route returns 404, not 405.
- Double finalize is idempotent (200); double unfinalize → 409.
- Cross-user access returns 404, not 403 (RLS-style resource hiding).
- Viewer project-content mutations return 404. Published-report review
  comments are the deliberate any-member write exception.

When fixing any of these, update the corresponding assertion.
