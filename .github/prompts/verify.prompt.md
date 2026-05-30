---
description: "Run the full verification loop on a workspace (vitest + typecheck + lint + guard scripts). Use after any meaningful diff before claiming done."
mode: ask
---

Run the verification loop for ${input:workspace:mobile|api|cli|docs|marketing}:

1. Tests: `pnpm --filter @harpa/${input:workspace} test -- --reporter=dot`
2. Typecheck: `pnpm --filter @harpa/${input:workspace} typecheck`
3. Lint: `pnpm --filter @harpa/${input:workspace} lint`
4. Guard scripts (root): `for s in scripts/check-no-*.sh scripts/check-scope-tests.sh scripts/check-spec-drift.sh; do bash "$s" || break; done`
5. If workspace is `api`, also run integration: `pnpm --filter @harpa/api test:integration`

Report PASS/FAIL per step. Do not "fix" anything — return the verdict.
The coordinator decides whether to recurse.

Apply the `verification-before-completion` superpowers skill: evidence
before assertions. Paste the actual output of the failing step, not a
summary.
