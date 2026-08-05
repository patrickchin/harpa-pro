# 2026-08-05 — Cloudflare Pages queue exceeded verifier timeout

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Exact-SHA `dev` and pull-request Pages checks failed after about
15 minutes even though local builds, tests, and browser journeys were green.
The expected public, admin, and dashboard aliases appeared later with the
correct commit and branch markers.

**Root cause.** Cloudflare accepted the GitHub events immediately, but native
builds waited in provider queues for 18 to 47 minutes during the first
incident. A follow-up queue serialized four earlier site/admin/dashboard waves
ahead of exact `dev` commit `2b6f6718`. At 14:55:29Z—more than 4,500 seconds
after its deployments were created at 13:40:12Z—the site was still building,
dashboard and admin were still queued, and every stable alias served the prior
commit. Site completed in about 78 minutes 16 seconds, dashboard in 87 minutes
40 seconds, and admin in 92 minutes 31 seconds. All three stable aliases served
the exact commit after about 92 minutes 54 seconds. Provider logs contained no
build errors. The initial 900-second limit, a proposed 4,500-second replacement,
and a proposed 90-minute outer job limit all expired during valid work.

**Fix.** Raise the shared marker wait to 7,200 seconds and set the public site,
admin site, and dashboard `dev` verification and pull-request deployment jobs
to 150 minutes. Against the observed 92-minute-54-second settlement, the shared
wait keeps about 27 minutes of measured margin. The 30-minute difference
between the shared wait and outer job limit leaves room for route, redirect,
SPA, and live-browser checks after the exact marker arrives. Keep the exact
expected commit and branch as the success boundary. Do not change provider
branch filters, production activation, or any production workflow. Production
callers inherit the shared inner default, but their unchanged 20-minute job
limits remain the effective maximum.

**Test.** The Cloudflare Pages Git policy test requires the 7,200-second shared
default and the 150-minute limit inside each of the six affected jobs. Existing
script tests still cover exact marker matching, mismatch timeout, route checks,
and redirect boundaries. Shellcheck, actionlint, and the documentation link
check cover the edited shell, workflows, and references.

**Pattern.** A deployment poll must cover the stacked queue across every
project and branch sharing provider capacity, not only its own build duration.
Its success condition must remain exact even when its wait budget grows.
