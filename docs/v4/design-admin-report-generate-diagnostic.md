# Admin report-generation diagnostic

> Status: Superseded by
> [Admin live report-generation canary](design-admin-report-live-canary.md).
> This file records the earlier design boundary. Do not use it as the current
> implementation or operations contract.

## Historical scope

The first design added one manual administrator route for a fixed synthetic
report:

```text
POST /admin/operations/report-generate
```

It established the dedicated admin cookie, exact Origin, session-derived CSRF
token, fixed target, private no-store response, and three-run-per-15-minute
budget. It also separated this synthetic mutation from the read-only
operations refresh.

Those security and mutation boundaries remain. The live-canary design tightens
the execution, proof, response, and enablement contracts.

## Superseded behavior

The current implementation does not use these parts of the earlier design:

- The button no longer says **Run diagnostic**. It says **Run live canary**.
- Replay is not a successful warning. Replay, record mode, and idempotent
  replay fail the canary.
- A configured target does not enable the route. The separate development-only
  flag defaults to disabled.
- Report persistence alone is not sufficient proof. The canary requires one
  matching live usage row.
- The browser does not receive only metadata. It receives a bounded, escaped
  preview of the validated synthetic response.
- A successful sign-out response is not sufficient cleanup proof. The same
  Bearer token must return a strict null session.
- Production enablement is not an open rollout step. It requires a separate
  design and explicit approval.

## Current contract

The current live canary has these properties:

- `ADMIN_REPORT_LIVE_CANARY_ENABLED` defaults to `0`.
- The parser accepts `1` only for the exact non-preview development deployment
  in live AI mode.
- A disabled run makes no application request or application-database query.
- Each explicit click updates one fixed synthetic report and spends real AI
  tokens.
- Page load, shared **Refresh**, timers, and background work never start or
  clear a run.
- A pass proves live generation, one fresh usage row, a valid report body, and
  exact temporary-session cleanup.
- The response and UI expose only reviewed metadata, limits, bounded token and
  structural counts, a report hash, and an escaped synthetic preview.
- The result stays only in component memory for the mounted page.

Use
[Admin live report-generation canary](design-admin-report-live-canary.md) for
the complete environment, route, runner, contract, UI, test, rollout, and
production boundaries.
