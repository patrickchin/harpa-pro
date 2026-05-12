# Overnight continuation prompt — P2.5 → end of P3

Drop into a fresh agent session. Designed to run unattended; the
top-level agent is a coordinator that delegates every concrete task to
a subagent so its own context stays small.

---

````
You are the coordinator for an unattended overnight run of the
harpa-pro-opus v4 plan, currently on branch `dev` at commit bcee6a8
(P2.4 just shipped). Drive P2.5 → end of P3, tagging `v0.2.0-shell`
and then `v0.3.0-features`.

READ FIRST (in order, no skipping):
  1. AGENTS.md
  2. docs/v4/overnight-protocol.md   ← subagents, pause policy,
                                       carve-outs, verification loop,
                                       end-of-run report
  3. docs/v4/pitfalls.md
  4. docs/v4/plan-p2-mobile-shell.md (P2.5–P2.8)
  5. docs/v4/plan-p3-feature-build.md
  6. docs/v4/prompts/page-template.md (per-screen porting recipe)
  7. docs/bugs/README.md

EXECUTION RULES (full detail in overnight-protocol.md):
  - Every concrete task runs in a subagent. You coordinate; they do.
  - One commit per task, Conventional Commits on `dev`.
  - After every commit: run the §5 verification loop and invoke
    `code-reviewer`. Fix any P0/P1 in a follow-up commit before
    moving on.
  - Carve-outs documented in the commit body; checkbox stays
    unticked with annotation. Never silently skip work.

ORDER OF EXECUTION (do not reorder):

  P2.5 — Auth screens, split per route. Per the updated plan there
         are FIVE screens (sign-in-phone, sign-in-verify,
         sign-up-phone, sign-up-verify, onboarding), one commit
         each. For each: dispatch `Explore` to map the canonical
         source, then a worker subagent to port body + real route +
         dev mirror + behaviour tests using
         `docs/v4/prompts/page-template.md`. Verify screens use a
         single async flow (Pitfall 5); phone number arrives via
         nav param.
  P2.6 — App shell + provider tree + auth gate. `architect` first;
         `security-reviewer` before AND after. Resolve the three
         P2.4 post-impl review follow-ups (§A multi-mount race,
         §C deleted-account fallback, §H provider prop-stability)
         or punt to P4 with a carve-out.
  P2.7 — Projects list. Page-template flow.
  P2.8 — Tick boxes, run guard scripts, tag `v0.2.0-shell`.

  P3.0 — IDs/slugs migration. BLOCKS every other P3 task.
         `architect` + `database-reviewer` mandatory. UUIDv7
         availability on Neon must be checked before writing the
         migration; fall back to `gen_random_uuid()` with a
         carve-out if the extension isn’t there.
  P3.1 → P3.13 — One commit per screen via the page-template flow.
         Specific subagent triggers:
           - P3.6/7/8 (Generate – Notes/Report/Edit): `architect`
             first, all three tabs fully wired (Pitfall 4).
           - P3.10 (Files) + P3.11 (Camera): `security-reviewer`
             on the upload pipeline.
           - P3.13 (Maestro core-end-to-end): `e2e-runner`, iOS
             sim AND Android emulator.
  P3 exit — coverage ≥ 80%, guard scripts clean, tag
         `v0.3.0-features`.

END OF RUN:
  Append `docs/v4/prompts/overnight-run-report.md` per
  `overnight-protocol.md` §6, commit it
  (`docs(plan): overnight run report (<date>)`), then stop. Do not
  push. Do not start P4.
````
