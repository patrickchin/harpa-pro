# 2026-06-11 — Maestro DEV_OTP_TOKEN was not forwarded as a global

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The local Android regression reached the email OTP screen,
but `.maestro/helpers/last-otp.js` failed with HTTP 404 for
`alice@e2e.harpapro.com`. A direct host request to
`POST /api/dev/last-otp` with the expected token returned the OTP, so
the API had issued and stored the code.

**Root cause.** Maestro does not substitute arbitrary child process
environment variables into YAML/script globals. `mo run` already knew
this for `MAESTRO_APP_ID` and passed it via `--env`, but it did not do
the same for `DEV_OTP_TOKEN`. As a result, `sign-in.yaml` forwarded an
incorrect token value to `last-otp.js`, and the dev endpoint correctly
returned its uniform 404.

**Fix.** `mo run` now forwards `DEV_OTP_TOKEN` and optional
`API_BASE_URL` via Maestro `--env` whenever they are present in the
orchestrator environment.

**Test.** `tools/maestro-orchestrator/tests/test_run.py` captures the
spawned Maestro argv and asserts the `DEV_OTP_TOKEN=...` `--env` pair is
present before the flow path.

**Pattern.** E2E harness contract drift — for Maestro, process env and
YAML globals are separate channels. Any helper that reads `${VAR}` must
have an orchestrator test proving `--env VAR=...` is forwarded.
