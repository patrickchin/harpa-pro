# 2026-06-06 — Placed photo "reverts" to bottom grid a split second after placement

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** On the generate screen, after tapping the placement
pill on a photo group and picking "Roof" (or any issue/section),
the photo group correctly appeared inline under that card for a
fraction of a second, then jumped back to the "Unplaced photos"
grid at the bottom. The placement was effectively impossible to
keep, but no error surfaced and React Query reported success.

**Root cause.** A four-step chain whose individual links were all
"correct in isolation":

1. `updateNotePlacement` (server) wrote the new `placement` JSONB
   **and** called `bumpNotesChangedAt(report)` — copy-pasted from
   the other note mutations.
2. `useUpdateNotePlacementMutation.onSettled` invalidated both
   `['reportNotes']` **and** `['report']`.
3. The refetched `report` row had a fresh `notes_changed_at >
   generated_at`, so `useAutoRegenerate` saw
   `needsRegeneration: true` and fired `onRegenerate()` (instant
   in fixture mode, ~seconds in prod).
4. The regen returned a freshly shaped report whose
   `issues[]` / `sections[]` array no longer had the same length
   or order. `splitPlacements` put the user's just-saved
   placement into `orphans`, and the orphan-healer effect in
   `ReportTabPane` fire-and-forgot `PATCH /placement {null}` to
   "self-heal" it — clearing the placement the user had just set.

Each link looked right on its own:
- The server bump matched the existing pattern for "any note
  change is a content change".
- The client invalidation matched what the other note mutations
  did.
- The orphan-healer was the documented mitigation for stale
  placements after a regen.

**Fix.**

1. **Server (`updateNotePlacement`)** — drop the
   `bumpNotesChangedAt` call. Placement is a UI-only annotation
   (which generated card a photo group anchors to), not a content
   change to the underlying note. It must not trigger
   auto-regeneration.
2. **Client (`invalidation.ts`)** — drop `'report'` from the
   `useUpdateNotePlacementMutation` invalidation list. The report
   row doesn't change on a placement edit, and refetching it is a
   second path to the same race.
3. **Docs (`design-photo-placement.md`)** — flip the API-behaviour
   section, the implementation-checklist item, and the
   auto-regen cross-link to record the placement→regen carve-out.
4. **Regression test (`notes.integration.test.ts`)** — flipped
   the prior `bumps notes_changed_at` assertion to its inverse:
   placement must NOT bump `notes_changed_at`.

**Test.** API-side: the flipped assertion catches any future
re-introduction of `bumpNotesChangedAt` on the placement path.
Client-side: `ReportTabPane.test.tsx` (added in the same PR)
already proves the in-cache pipeline renders placed photos into
the matching card and removes them from the bottom grid — that
test plus the API assertion form an "across-the-stack" fence
against this specific revert pattern.

**Pattern.** New pattern **R9 — "Two layers, both correct, fight
each other"**. The auto-regenerator and the orphan-healer were
both individually defensible but combined they ratcheted away
user intent. When a UI feature attaches *metadata* to a row that
also drives content regeneration, the metadata path must be
explicitly carved out of the "bump → regen" plumbing, or the
regen loop will eat the metadata. Audit any future "UI-only"
field on a content row (caption, pin, hide-from-AI, ordering
hint, …) for the same trap.
