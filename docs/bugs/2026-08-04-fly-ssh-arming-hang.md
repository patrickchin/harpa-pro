# 2026-08-04 — Fly SSH lifecycle arming hung

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Production `api-prod` run `30744292936` completed Fly release 31,
topology repair, and started-worker verification. The deploy step then printed
only `Connecting to <worker-private-address>...` and made no further progress.
GitHub cancelled the job six hours later. Readiness checks, journeys, OTA, and
the storage-lifecycle arming update never completed, so authenticated account
deletion remained intentionally unavailable.

**Root cause.** The failure is localized to the `flyctl ssh console` transport:
the remote command produced no output, and its database confirmation marker was
never observed. Available logs do not distinguish a WireGuard connection hang,
an SSH handshake hang, or a remote-exec setup failure. The deployment script
had no command deadline, retry budget, exact Machine target, or success-marker
check, so that opaque provider wait could occupy the GitHub runner indefinitely.

**Fix.** Replace process-group SSH with `flyctl machine exec` against the exact
sole started worker returned by a fresh Machine inventory. Each attempt uses
Fly's 120-second timeout and the helper stops after three attempts. Before a
retry, the helper proves that the same Machine is still the sole started worker;
target drift fails closed. A zero exit code counts as success only when the
database arming script emits its confirmation marker. Retrying after an
ambiguous transport failure is safe because the update is monotonic. The
GitHub deployment step also has a 30-minute outer timeout.

**Test.** `storage-lifecycle-deploy-policy.test.sh` executes the production
deploy with fake Fly commands, asserts exact Machine selection and the
per-attempt timeout, proves one transient failure is retried only on the same
re-proved worker, and proves repeated failures stop at the configured budget.

**Pattern.** Provider CLIs are part of the deployment state machine. A remote
command needs a deadline, an exact target, bounded retry semantics, and an
application-owned success condition; connection-progress output is not proof
that the command started.
