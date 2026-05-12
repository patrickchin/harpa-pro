# Overnight / unattended-run protocol

How an agent runs the v4 plan without a human in the loop. This doc is
referenced from `docs/v4/prompts/continue-*.md` so those prompts can stay
short. Read this once at the start of a run, then refer back as needed.

## 1. Subagent-first execution (mandatory)

Every concrete task in an unattended run is delegated to a subagent. The
top-level agent is a coordinator: it reads the next plan checkbox, picks
the right subagent, and posts the subagent verdict into the commit body.
The top-level agent **does not** read full source files, write code, or
run test suites itself outside of the per-commit verification loop in §5.

Mapping (use proactively, not as a last resort):

| Trigger | Subagent | Notes |
|---|---|---|
| Map canonical source for a screen | `Explore` (medium) | One per screen port. |
| Multi-screen feature (Generate, Camera, slug migration) | `architect` | Land design as a doc under `docs/v4/` in the same commit. |
| New non-trivial code path | `tdd-guide` | Failing tests first. |
| **After every commit** | `code-reviewer` | Non-negotiable. P0/P1 → fix in `fix(scope): address code-review §X` follow-up commit before moving on. |
| Drizzle / migrations / scope work | `database-reviewer` | Mandatory for P3.0. |
| Auth surfaces, slug resolvers, signed URLs, file uploads | `security-reviewer` | Before AND after the commit. |
| Maestro / Playwright | `e2e-runner` | Per ported flow. |
| TS/turbo error stuck > 10 min | `build-error-resolver` | Not for trivia. |
| Doc sync | `doc-updater` | Same commit as the code change. |

## 2. Pause-point policy

Mandatory pause points (the per-task “REPORT THEN STOP” gates from P2
Phase B) are **lifted** for unattended runs. Replace each pause with a
`chore(plan): checkpoint <task>` commit summarising:

- Files added / modified
- Test count delta
- Subagents invoked + their verdict (one line each)
- Any carve-out taken, with the docs link to where it’s recorded

The morning reviewer audits via `git log`. Keep commits small (one task
per commit) so revert is cheap.

## 3. Carve-out policy

You will hit decisions that would normally warrant a check-in. Take the
most defensible call AND record it as a carve-out:

1. In the commit body under a `Carve-out:` section, explain the
   decision, the rejected alternatives, and where to revisit (link to
   the specific `plan-p*.md` or `arch-*.md` section you updated).
2. If the carve-out narrows scope, leave the corresponding plan
   checkbox **unticked** with a `*Carve-out — see commit <sha>*`
   annotation. The phase exit-gate task reads those annotations and
   either resolves them or punts them to the next phase explicitly.

Never silently skip work. Never tick a checkbox you didn’t complete.

## 4. Hard rules (re-read every time)

The full list lives in `AGENTS.md` and is enforced by `scripts/check-*.sh`.
The five most-violated in v3 attempts:

1. Canonical port source = `../haru3-reports/apps/mobile@dev`. JSX +
   Tailwind copy verbatim. Cosmetic drift = P0.
2. NativeWind only — no Unistyles, no raw hex in `components/**`.
3. No `Alert.alert` — `AppDialogSheet` only.
4. No `process.env.EXPO_PUBLIC_*!` — `lib/env.ts` only.
5. No `setTimeout` chains in auth or generation flows (Pitfall 5).

## 5. Per-commit verification loop

After EVERY task commit (including carve-out commits):

```bash
pnpm --filter @harpa/mobile vitest run --reporter=dot \
  && pnpm --filter @harpa/mobile typecheck \
  && pnpm --filter @harpa/mobile lint \
  && for s in scripts/check-no-*.sh \
              scripts/check-scope-tests.sh \
              scripts/check-spec-drift.sh; do bash "$s" || break; done
```

For commits that touch the API: also `pnpm --filter @harpa/api test` and
`pnpm --filter @harpa/api test:integration`. Never let a red bar persist
across two commits.

## 6. End-of-run report (last action)

Append `docs/v4/prompts/overnight-run-report.md` with:

- Commits between the start SHA and HEAD (`git log --oneline`).
- Tags applied this run.
- Test count delta.
- Coverage figures for `packages/api` and `apps/mobile`.
- Every carve-out (commit sha + plan doc link).
- P0/P1 review findings addressed mid-run.
- Failures hit but worked around — first-look items for review.

Commit as `docs(plan): overnight run report (<date>)`. Then stop. Do not
push. Do not start the next phase.
