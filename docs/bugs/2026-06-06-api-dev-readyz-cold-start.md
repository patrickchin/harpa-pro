# 2026-06-06 — api-dev /readyz verify times out on Fly cold-start

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** `api-dev` workflow on `dev` went red on three consecutive
pushes (run IDs 27042388754, 27042818518, 27044373908) at the
"Verify /readyz (dev)" step. Curl returned exit 28 ("Operation timed
out after 5002 ms") on all 5 retries, even though `flyctl deploy`
succeeded and the machines reported a "good state". The dev API was
fine when probed manually a minute later — the verify step was racing
the machine's cold-boot.

**Root cause.** `infra/fly/fly.dev.toml` runs the dev app with
`auto_stop_machines = "suspend"` and `min_machines_running = 0` (so
dev costs near-zero overnight). After every deploy the rolling
update lands the new image and the machines settle into `stopped` —
the deploy log even prints `Machine X reached stopped state` for
each of the 2 dev machines. The "Verify /readyz" step then ran:

```bash
curl --fail --silent --show-error --max-time 5 "$URL"   # 5×5s retries
```

A stopped Fly machine wakes on the first request, but Linux boot +
Node startup + the DB pool init + `/readyz`'s schema-head check
routinely takes longer than 5 seconds. Every curl attempt timed out
before the wakeup completed, so all 5 attempts failed even though the
machine was actively booting.

Prod (`api-prod.yml`) had the same brittle 5s curl loop but was
masked by `min_machines_running = 2` keeping machines warm. PR-preview
apps (`pr-preview.yml`) ran `--max-time 8` × 6, which was less brittle
but still occasionally flaky and used the same hand-rolled loop.

**Why it leaked into `dev`.** `api-dev.yml` only triggers on push to
`dev` (post-merge), so PR CI never exercises the deploy/verify path.
The verify step was hand-rolled inline in each workflow, with no
unit or integration test covering the cold-start scenario, so the
brittle timeout could only be discovered by hitting it in production.

**Fix.** Extracted the verify loop into `scripts/ci/verify-readyz.sh`
with `--max-time 30` × 6 attempts × 10s sleep (≈4 min total budget)
and wired all three workflows (`api-dev.yml`, `api-prod.yml`,
`pr-preview.yml`) to call the shared script. Added
`scripts/ci/__tests__/verify-readyz.test.sh` which fakes a
6-second-cold-start HTTP server and asserts the loop succeeds; the
test runs in `lint-typecheck` so a future regression to a 5-second
timeout fails PR CI before it can land. Added a `Diagnose readyz
failure` step that prints `flyctl status` + recent logs on failure
so the next investigation doesn't start from zero.

**Test.** `scripts/ci/__tests__/verify-readyz.test.sh` — boots a
python HTTP server with configurable startup delay, then asserts
`verify-readyz.sh` succeeds against a 6-second cold-start (>5s curl
budget) and fails when the endpoint never responds.

**Pattern.** Process/CI gap. The recurring lesson here is the same
as Pitfall 13 (test the default wiring) but applied to CI shell
glue: when only post-merge workflows touch a piece of infra, that
infra needs its own pre-merge test so regressions can't sneak in
through the gap.
