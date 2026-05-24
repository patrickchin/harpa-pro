# 2026-05-22 — Maestro flows hardcoded `appId: com.harpa.pro`; the dev variant ran the wrong app

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** A planned `com.harpa.pro.dev` bundle id for the dev
EAS profile would have shipped immediately — and every Maestro
flow under `.maestro/` declares `appId: com.harpa.pro`. Running
`maestro test` against the dev sim would have launched (and asserted
against) the prod bundle silently: either an unrelated install
shown to Maestro, or an outright `appId not installed` failure
that wastes a CI minute per flow. We're catching this proactively
before the dev variant lands.

**Root cause.** Maestro YAML has no concept of a default-per-env;
each flow declares the bundle id at the top. Copy-pasting flows
locked the literal in seven files. The shell snippets in
`.maestro/README.md` that grant simctl privileges (microphone /
camera) used the same literal, so even the human runbook embedded
the wrong assumption.

**Fix.** `feat(maestro): parameterise appId via MAESTRO_APP_ID` —
every `.maestro/**/*.yaml` flow now uses
`appId: ${MAESTRO_APP_ID}`. The README documents the export and the
simctl grants reference `"$MAESTRO_APP_ID"`. A new lint guard,
`scripts/check-maestro-appid.sh`, greps for any literal
`com.harpa.pro` in `.maestro/**/*.yaml` and fails the lint job if
found.

**Test.** `scripts/check-maestro-appid.sh` is wired into the root
`pnpm lint` script. Reverting any single YAML flow back to a
literal turns the lint red.

**Pattern.** R-Maestro1 — env-coupled config baked into test
fixtures. Same lineage as R5 (test-time defaults that mask a
production mismatch): the value the test runner used was
indistinguishable from the value prod used, until prod's value
changed.
