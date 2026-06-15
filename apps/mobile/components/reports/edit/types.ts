/**
 * Discriminated union identifying which slice of a `GeneratedSiteReport`
 * is being edited by the per-card pencil → full-screen modal flow.
 *
 * The list-shaped slices have two granularities by user choice:
 *   - `issue`, `section` are per-item (each row gets its own pencil)
 *   - `materials`, `nextSteps`, `workers` (with roles) are whole-list
 * See `docs/superpowers/specs/2026-06-03-report-edit-modal-redesign-design.md`.
 */
export type ReportEditTarget =
  | { kind: 'meta' }
  | { kind: 'weather' }
  | { kind: 'workers' }
  | { kind: 'materials' }
  | { kind: 'nextSteps' }
  | { kind: 'issue'; index: number }
  | { kind: 'section'; index: number };
