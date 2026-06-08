# Mobile Text & Label Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a docs-only audit of every user-facing label, header, button, body string, empty state, error message, toast, and accessibility label in `apps/mobile/`, plus a tone/voice style guide to anchor recommendations.

**Architecture:** Two docs under `docs/v4/text-audit/` — `style-guide.md` (anchor) written first, then `audit-findings.md` (per-screen tables) assembled from 6 parallel `explore` subagent chunks. No app code changes. Single PR against `dev`.

**Tech Stack:** Markdown only. Subagents read `apps/mobile/**/*.tsx`. Verification uses `grep`/`view`.

**Spec:** [`docs/superpowers/specs/2026-06-08-mobile-text-audit-design.md`](../specs/2026-06-08-mobile-text-audit-design.md)

---

## Task 1: Sample baseline screens to ground the style guide

**Files:**
- Read (no edits): a representative cross-section of mobile screens and shared components.

- [ ] **Step 1: Pick the sample set**

Read these 10 files in parallel — they span every area and surface most patterns we'll encounter:

```
apps/mobile/app/(auth)/onboarding.tsx
apps/mobile/app/(auth)/sign-in/email.tsx
apps/mobile/app/(auth)/sign-in/code.tsx
apps/mobile/app/(app)/account.tsx
apps/mobile/app/(app)/projects/index.tsx
apps/mobile/app/(app)/projects/new.tsx
apps/mobile/app/(app)/projects/[project]/index.tsx
apps/mobile/app/(app)/projects/[project]/reports/[number]/index.tsx
apps/mobile/app/(camera)/capture.tsx
apps/mobile/components/primitives/AppDialogSheet.tsx
```

- [ ] **Step 2: Note current patterns**

Capture, in a scratch note (do NOT commit), examples of: button labels, screen titles, empty states, error/toast text, accessibility labels, helper text, dialog copy. Flag inconsistencies (e.g. mixed sentence/title case, "Oops" wording, missing a11y on icon buttons) — these become the style guide's "Reserved/forbidden" and "Examples" sections.

- [ ] **Step 3: Grep for obvious offenders to confirm coverage**

```bash
cd apps/mobile && \
  grep -rni --include='*.tsx' -E '\b(Oops|Whoops|Sorry|Please)\b|!\s*["'\''`]|Failed to ' app/ components/ features/ | head -40
```

Expected: a list of currently-shipping offenders the style guide must address. Save these (mentally) as concrete examples to cite in the audit.

- [ ] **Step 4: No commit**

This task produces context only.

---

## Task 2: Write the style guide

**Files:**
- Create: `docs/v4/text-audit/style-guide.md`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p docs/v4/text-audit
```

- [ ] **Step 2: Write `style-guide.md` with these sections, in this order**

Use sentence-case `## Section` headings. Each section gives the rule, 2–3 ✅ examples and 2–3 ❌ examples drawn from Task 1's findings where possible.

Required sections:

1. **Purpose & scope** — 3–5 sentences. What this guide governs and what it doesn't (i18n, API error text, test code are out).
2. **Voice & tone** — terse, sentence case, action-oriented, Linear/Vercel style. No emoji in errors. No exclamation marks. No "Please".
3. **Reserved/forbidden words & punctuation** — explicit grep-friendly list: `Oops`, `Whoops`, `Sorry`, `Please`, `!` in non-celebratory copy, emoji in errors, "Failed to" without context.
4. **Sentence case vs title case** — sentence case everywhere except proper nouns and product names (Apple, Google, Sign in with Apple).
5. **Screen titles & headers** — sentence case, no trailing colons, screen title matches its back-stack label.
6. **Button labels** — verb-first, max 3 words, no trailing punctuation. Destructive variant rules. Loading-state labels ("Saving…" with single ellipsis char).
7. **Form labels, placeholders & helper text** — label = field name; placeholder = example, not restatement; helper text only when validation is non-obvious; required-field marker convention.
8. **Empty states** — 1-line headline + optional 1-line subtext + CTA when an action is possible. When to omit entirely.
9. **Error messages** — pattern: `<what happened in one clause>. <what the user can do>`. Never surface raw API error text. Never use `Alert.alert` (cite AGENTS.md hard rule #4). Distinguish inline-field errors, page-level errors, and toast errors.
10. **Toasts & inline feedback** — success: past-tense verb + object ("Report saved"). Error: cause + action. Duration & dismissal guidance.
11. **Dialog & sheet copy** — title (verb phrase or noun phrase, not a sentence), body (≤2 sentences), primary/secondary button rules. Confirmation copy for destructive actions must name the object ("Delete report" not "Delete").
12. **Accessibility labels** — every icon-only `Pressable`/button has an `accessibilityLabel`. Pattern: verb + object ("Open menu", "Close dialog"). When to use `accessibilityHint`. Avoid duplicating visible label.
13. **Loading & skeleton states** — when to show a label, when silence is fine, never use "Loading…" if a skeleton conveys it.
14. **Numbers, dates & units** — sentence-case month names, "2 photos" not "2 Photos", relative time format ("2m ago", "Yesterday").
15. **How to cite this guide** — every audit row's `Reason` column cites a section by anchor (e.g. `#button-labels`).

Target length: 300–500 lines.

- [ ] **Step 3: Verify section anchors**

```bash
grep -n '^## ' docs/v4/text-audit/style-guide.md
```

Expected: 15 section headings matching the list above. Fix any drift.

- [ ] **Step 4: Commit**

```bash
git add docs/v4/text-audit/style-guide.md
git commit -m "docs(mobile): add text and label style guide

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Create the audit-findings skeleton

**Files:**
- Create: `docs/v4/text-audit/audit-findings.md`

This task lays down the section structure so subagent outputs in Task 4 drop into known slots.

- [ ] **Step 1: Write the skeleton**

Contents:

```markdown
# Mobile text & label audit findings

> Style guide: [`style-guide.md`](./style-guide.md). Every recommendation in this doc cites a style-guide section by anchor.
>
> Format per file:
> - **Findings** — table with columns `Current` | `Recommended` | `Reason` (style-guide anchor).
> - **Gaps** — bullet list. Flagged only when clearly missing: silent failure paths, icon-only controls without `accessibilityLabel`, lists without empty states, async UI without loading/error state, destructive actions without confirmation copy.
> - "No findings" is a valid section body.

## (auth)

_To be filled by audit pass._

## (app) — account, profile, usage, developer

_To be filled by audit pass._

## (app) — projects

_To be filled by audit pass._

## (app) — reports

_To be filled by audit pass._

## (camera)

_To be filled by audit pass._

## Shared components

_To be filled by audit pass._
```

- [ ] **Step 2: Commit**

```bash
git add docs/v4/text-audit/audit-findings.md
git commit -m "docs(mobile): scaffold text audit findings doc

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Run six parallel audit subagents

**Files:**
- Subagents READ: their assigned globs under `apps/mobile/`.
- Subagents WRITE: nothing in the repo. Each returns a markdown chunk in its response.

All six subagents run in **one response** (parallel `task` calls). They share the same prompt template differing only in `AREA`, `GLOB`, and `SECTION_HEADING`.

### Shared subagent prompt template

````
You are auditing user-facing text in the mobile app. This is a docs-only review — do NOT edit any code.

Style guide (read first): docs/v4/text-audit/style-guide.md
Spec (context): docs/superpowers/specs/2026-06-08-mobile-text-audit-design.md

Your area: <AREA>
Files to audit: <GLOB>
Excluded: *.test.tsx, *.test.ts, __snapshots__/**, Maestro/Playwright flows

For each file in your glob, produce a markdown section in this exact format:

### `<relative file path from repo root>`

**Findings**

| Current | Recommended | Reason |
| --- | --- | --- |
| `"Exact current string"` | `"Proposed string"` | [Voice & tone](./style-guide.md#voice--tone) |
| `"Another current string"` | _Remove_ | [Empty states](./style-guide.md#empty-states) |

**Gaps**

- Icon-only `Pressable` at line 87 has no `accessibilityLabel`. Suggest `"Close project"`. ([Accessibility labels](./style-guide.md#accessibility-labels))
- Async `.catch()` at line 142 swallows the error silently with no UI feedback. ([Error messages](./style-guide.md#error-messages))

If a file has no user-facing text and no gaps, write only:

### `<path>`

No findings.

Rules:
- Every Reason column cell MUST be a markdown link to a style-guide section anchor.
- Quote `Current` strings verbatim (preserve casing, punctuation, ellipses).
- For dynamic strings using template literals, quote the literal template with `${var}` intact.
- Gaps are flagged ONLY when clearly missing — do not speculate.
- Dev-only screens (developer.tsx, debug.tsx, e2e-password-login.tsx) get a `> Dev-only — lower priority` note above the Findings table.
- Do NOT propose architectural changes, prop renames, or component refactors. Text only.
- Return the assembled markdown for your area, ready to paste under the corresponding `## <SECTION_HEADING>` heading in audit-findings.md. Do NOT include the `## <SECTION_HEADING>` heading itself.
````

### Subagent assignments

1. **audit-auth** — `apps/mobile/app/(auth)/**/*.tsx` → goes under `## (auth)`
2. **audit-account** — `apps/mobile/app/(app)/{account,profile,usage,developer}.tsx` plus `apps/mobile/components/account/**/*.tsx` → goes under `## (app) — account, profile, usage, developer`
3. **audit-projects** — `apps/mobile/app/(app)/projects/{index,new,_layout}.tsx` and `apps/mobile/app/(app)/projects/[project]/{index,members,edit}.tsx` and `apps/mobile/app/(app)/p/[project].tsx` → goes under `## (app) — projects`
4. **audit-reports** — `apps/mobile/app/(app)/projects/[project]/reports/**/*.tsx` and `apps/mobile/app/(app)/r/[report].tsx` plus `apps/mobile/components/reports/**/*.tsx` and `apps/mobile/features/generate/GenerateReportProvider.tsx` → goes under `## (app) — reports`
5. **audit-camera** — `apps/mobile/app/(camera)/**/*.tsx` plus `apps/mobile/components/files/**/*.tsx` (photos/files UI travels with camera) → goes under `## (camera)`
6. **audit-shared** — everything left under `apps/mobile/components/{ui,primitives,skeletons,notes}/**/*.tsx` and `apps/mobile/features/voice/InlineVoiceRecorder.tsx` and `apps/mobile/app/(app)/_layout.tsx` and `apps/mobile/app/_layout.tsx` and `apps/mobile/app/index.tsx` → goes under `## Shared components`

- [ ] **Step 1: Dispatch all six subagents in one response**

Use `task` with `agent_type: explore` for each. Each prompt = the shared template with `<AREA>`, `<GLOB>`, `<SECTION_HEADING>` substituted.

- [ ] **Step 2: Verify coverage**

After all six return, count audited files vs source-of-truth:

```bash
cd apps/mobile && find app components features -name '*.tsx' \
  -not -name '*.test.tsx' -not -path '*/__snapshots__/*' | sort > /tmp/mobile-tsx.txt
wc -l /tmp/mobile-tsx.txt
```

Cross-check that every file in `/tmp/mobile-tsx.txt` appears in at least one subagent chunk. If any are missing, dispatch a follow-up subagent for them. Delete `/tmp/mobile-tsx.txt` when done.

- [ ] **Step 3: No commit yet**

The chunks live only in the conversation. Task 5 stitches them into the file.

---

## Task 5: Stitch subagent chunks into audit-findings.md

**Files:**
- Modify: `docs/v4/text-audit/audit-findings.md`

- [ ] **Step 1: Paste each chunk under its assigned `## ` heading**

Replace the six `_To be filled by audit pass._` placeholders with the corresponding subagent output. Preserve the subagent's `### <path>` headings.

- [ ] **Step 2: Normalize voice**

Read every `Recommended` column cell. Subagents may diverge in phrasing — apply the style guide directly:
- Sentence case
- No trailing punctuation on buttons
- No "Please" / "Oops" / "Sorry"
- Past-tense verbs on success toasts

Fix in place. The normalization pass is the human-style-editor moment of this plan — do not skip it.

- [ ] **Step 3: Verify every Reason cites a style-guide anchor**

```bash
grep -nE '^\|' docs/v4/text-audit/audit-findings.md \
  | grep -v -- '---' \
  | grep -v 'style-guide.md#' \
  | grep -v '^[^|]*|[^|]*|[^|]*Reason' \
  | head -40
```

Expected: zero rows (after filtering header + separator rows). Any hit is a Reason cell missing its anchor — fix it.

- [ ] **Step 4: Verify every audited file has a section**

```bash
grep -c '^### `' docs/v4/text-audit/audit-findings.md
```

Compare against the file count from Task 4 Step 2. They should match.

- [ ] **Step 5: Commit**

```bash
git add docs/v4/text-audit/audit-findings.md
git commit -m "docs(mobile): fill text audit findings

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Final self-review pass

**Files:**
- Read-only verification of both `docs/v4/text-audit/*.md`.
- Possible touch-ups to either doc.

- [ ] **Step 1: Grep the mobile app for reserved words and cross-check audit coverage**

```bash
cd apps/mobile && grep -rniE --include='*.tsx' \
  '\b(Oops|Whoops|Sorry|Please)\b|!\s*["'\''`]|Failed to ' \
  app/ components/ features/ \
  | grep -v '\.test\.tsx' > /tmp/reserved-hits.txt
wc -l /tmp/reserved-hits.txt
```

For each hit, confirm the audit-findings doc addresses it (either in a Findings row or a Gaps bullet). Add anything missed. Delete `/tmp/reserved-hits.txt` when done.

- [ ] **Step 2: Grep for icon-only buttons missing a11y labels**

```bash
cd apps/mobile && grep -rnE --include='*.tsx' \
  '<Pressable\b|<TouchableOpacity\b|<IconButton\b' app/ components/ features/ \
  | grep -v '\.test\.tsx' | wc -l
```

Spot-check 5–10 random hits against the audit Gaps lists. If a clear icon-only pattern is unflagged, add the gap.

- [ ] **Step 3: Cross-link sanity check**

```bash
grep -c 'style-guide.md#' docs/v4/text-audit/audit-findings.md
```

Expected: a large positive integer (one per Findings row + one per Gaps bullet, roughly).

```bash
grep -n '^## ' docs/v4/text-audit/style-guide.md | wc -l
```

Expected: matches Task 2 Step 3 (15 sections).

- [ ] **Step 4: Word-count sanity check**

```bash
wc -l docs/v4/text-audit/style-guide.md docs/v4/text-audit/audit-findings.md
```

Expected: style guide 300–500 lines; audit 1500–2500 lines. If the audit is far smaller, files were skipped. If far larger, recommendations are too verbose — collapse.

- [ ] **Step 5: Commit any touch-ups**

```bash
git add docs/v4/text-audit/
git commit -m "docs(mobile): self-review pass on text audit

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" || echo "nothing to commit"
```

---

## Task 7: Open the PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin HEAD
```

- [ ] **Step 2: Open PR against `dev`**

```bash
gh pr create --base dev --title "docs(mobile): add text and label audit" \
  --body "$(cat <<'EOF'
Adds two docs under `docs/v4/text-audit/`:

- `style-guide.md` — voice/tone anchor for all mobile copy. Sentence case, action-oriented, Linear/Vercel style. Reserved words and patterns called out for grep-ability.
- `audit-findings.md` — per-file table of current text, recommendation, and reason (cites style-guide anchor). Gaps section per file flags clearly-missing context (silent catches, icon-only buttons without a11y labels, lists without empty states).

No code changes. Triage and follow-up edit PRs will land separately.

Spec: `docs/superpowers/specs/2026-06-08-mobile-text-audit-design.md`
EOF
)"
```

- [ ] **Step 3: Confirm CI is green and await review**

```bash
gh pr checks --watch
```

Expected: passes (docs-only change should trip no build/test failures).
