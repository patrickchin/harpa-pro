# Mobile app text & label audit — design

## Goal

Produce a **docs-only** review of every user-facing label, header,
button, body string, empty state, error message, toast, and
accessibility label in `apps/mobile/`, plus call out gaps where
context is missing (silent failures, ambiguous icons, missing empty
states).

Output is a written audit. No app code changes in this pass. Edits
ship as follow-up PRs triaged from the audit findings.

## Deliverables

Two markdown files under `docs/v4/text-audit/`, committed in a single
PR against `dev`:

### 1. `docs/v4/text-audit/style-guide.md`

The anchor doc that every recommendation in the audit cites. Sections:

- **Voice & tone** — terse, sentence case, action-oriented,
  Linear/Vercel style. No "Oops", no "Whoops", no "Sorry", no emoji
  in errors, no exclamation marks, no "Please".
- **Button labels** — verb-first, max 3 words, no trailing
  punctuation, sentence case (e.g. "Save changes", not "Save
  Changes" and not "Save Changes!"). When to use destructive
  variants.
- **Headers & titles** — sentence case, no trailing colons, screen
  titles match the back-stack label.
- **Error messages** — pattern: `<what happened in one clause>.
  <what the user can do>`. Never surface raw API error text. Never
  use `Alert.alert` (existing hard rule).
- **Empty states** — 1-line headline + optional 1-line subtext +
  CTA when an action is possible. When to omit entirely.
- **Toasts & inline feedback** — success: past-tense verb +
  object ("Report saved"). Error: cause + action.
- **Form labels & placeholders** — label is the field name,
  placeholder is an example not a restatement, helper text only
  when validation rules are non-obvious.
- **Accessibility labels** — every icon-only button must have an
  `accessibilityLabel`. Pattern guidance (verb + object).
- **Reserved/forbidden words & punctuation** — listed explicitly so
  reviewers can grep.
- **Title case vs sentence case** — sentence case everywhere except
  proper nouns and product names.

Target length: 300–500 lines.

### 2. `docs/v4/text-audit/audit-findings.md`

Per-screen audit. Organized by route group, then by file:

- `(auth)` — onboarding, sign-in email, sign-in code,
  e2e-password-login
- `(app)` — account, profile, usage, developer, projects index,
  projects/new, projects/[project]/*, reports/*, p/[project],
  r/[report]
- `(camera)` — capture
- **Shared components** — dialogs (`AppDialogSheet`, etc.),
  primitives (buttons, inputs, headers), feature components
  (`InlineVoiceRecorder`, generate flow, photo grid, etc.)

Each screen/component section contains:

1. **File path** (heading + permalink-style reference).
2. **Findings table** with columns:
   `Current text` | `Recommendation` | `Reason` (cites style-guide
   section).
3. **Gaps checklist** — flagged when clearly missing: silent
   failure paths, ambiguous icon-only controls without
   accessibilityLabel, missing empty state on a list, missing
   loading/error state on async UI, missing confirmation copy on
   destructive actions.

Each finding stays one row. No prose paragraphs in the audit doc —
the style guide carries the rationale, the audit cites it.

Target length: 1500–2500 lines.

## Process

1. **Read baseline.** Sample ~10 screens across all areas (auth,
   projects, reports, account, camera, shared) to extract existing
   patterns and inconsistencies. This grounds the style guide in
   what the codebase actually does.
2. **Write the style guide first.** Commit it before audit work so
   subagents can cite it.
3. **Parallel audit.** Dispatch one `explore` subagent per area:
   - `audit-auth` — `apps/mobile/app/(auth)/**`
   - `audit-app-account` — account, profile, usage, developer
   - `audit-projects` — projects index, new, [project]/{index,
     members, edit}
   - `audit-reports` — reports/* (index, [number]/{index, generate,
     notes, debug}), `r/[report]`, `p/[project]`
   - `audit-camera` — `(camera)/**`
   - `audit-shared` — `apps/mobile/components/**`,
     `apps/mobile/features/**` (excluding tests)

   Each subagent receives: the style guide path, the audit-findings
   template, its file glob, and the instruction to produce a markdown
   chunk in the agreed format. Subagents do NOT edit code.
4. **Stitch & normalize.** Combine subagent outputs into
   `audit-findings.md`, normalize voice across chunks (subagents
   may diverge in phrasing), and do a final consistency pass — every
   recommendation must cite a style-guide section.
5. **Self-review pass.** Grep for reserved words, exclamation
   marks, and "Oops"/"Sorry" across `apps/mobile/` to ensure the
   audit didn't miss any obvious offenders.
6. **Commit & PR.** Single PR against `dev` with both docs.
   Conventional Commits: `docs(mobile): add text and label audit`.

## Out of scope

- Code changes to `apps/mobile/`. The audit informs follow-up PRs;
  it does not contain them.
- Translations / i18n strategy. The app is currently English-only;
  i18n is a separate design.
- Test code (`*.test.tsx`, Maestro flows). Test text is not user
  facing.
- Dev-only screens are audited but flagged as "dev-only — lower
  priority".
- Backend / API error messages. The audit covers what the *mobile
  app* renders; if the app surfaces a raw API string, the fix is to
  catch it in the mobile layer (recommendation in the audit), not
  to change the API.

## Risks & mitigations

- **Subagent voice drift** — mitigated by the style guide existing
  before subagents run, and by a final consistency pass.
- **Audit goes stale fast** — mitigated by keeping the audit
  organized per-file so individual sections can be re-checked or
  deleted as code changes; the style guide is the durable artifact.
- **Audit too long to be useful** — mitigated by the table-only
  format (no prose per finding) and by splitting into two files so
  the style guide can be read independently.

## Success criteria

- Style guide is concrete enough that two reviewers reading the same
  screen would propose the same recommendation.
- Every user-facing `.tsx` file under `apps/mobile/app/`,
  `apps/mobile/components/`, and `apps/mobile/features/` has either
  a findings table or an explicit "No findings" note.
- Every recommendation cites a style-guide section.
- All clearly-missing-context gaps (silent catches, icon-only
  buttons without a11y labels, lists without empty states) are
  flagged.
