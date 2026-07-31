# 2026-07-29 — reusable OTA dispatch inherited manual context

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Manually dispatched
[`api-dev` run 30418825510](https://github.com/patrickchin/harpa-pro/actions/runs/30418825510)
deployed and passed its API gates, then the reusable mobile OTA workflow tried
to register a native runtime with blank registration inputs. If a readiness
tag had already existed, the release-policy step would also have treated the
API call as a manual OTA request and could have published an unnecessary
update.

**Root cause.** A called reusable workflow retains the caller's
`github.event_name`. Because the API workflow itself was started with
`workflow_dispatch`, event-name checks inside `mobile-ota-dev.yml` also saw
`workflow_dispatch`; they could not distinguish the API workflow call from a
direct operator dispatch of the OTA workflow.

**Fix.** In both dev and production OTA workflows, use the required successful
API-deploy input as the call discriminator. Reusable API calls skip native
registration and pass effective `workflow_call` semantics to the release
policy. Direct OTA dispatches still run registration and retain manual release
semantics.

**Test.** `scripts/ci/__tests__/mobile-ota-release-policy.test.sh` loops over
both environments and pins the exact registration guard and effective event
expression, covering reusable API dispatch and direct OTA dispatch behavior.

**Pattern.** Reusable workflow event context describes the original trigger,
not the call edge. When behavior depends on which workflow was invoked
directly, use an explicit call-only input and test both trigger paths.
