/**
 * Discriminated union identifying which slice of a canonical
 * `reports.ReportBody` is being edited by the per-card modal flow.
 */
export type ReportEditTarget =
  | { kind: 'meta' }
  | { kind: 'weather' }
  | { kind: 'workers' }
  | { kind: 'materials' }
  | { kind: 'nextSteps' }
  | { kind: 'issue'; index: number }
  | { kind: 'section'; index: number };
