/**
 * Unit tests for the pure helpers in services/reports.ts.
 *
 * Focus: needsRegenerationOf — the dual-read predicate that powers
 * the contract's `needsRegeneration` boolean during the expand-only
 * window. Race-safety against `generated_at` snapshot semantics is
 * exercised in reports.snapshot.integration.test.ts; here we lock
 * down the pure comparison branches.
 */
import { describe, it, expect } from 'vitest';
import { needsRegenerationOf, toReportResponse } from './reports.js';

function row(overrides: Partial<Parameters<typeof needsRegenerationOf>[0]> = {}) {
  return {
    id: 'r1',
    number: 1,
    projectId: 'p1',
    status: 'draft' as const,
    visitDate: null,
    body: null,
    notesSinceLastGeneration: 0,
    notesChangedAt: null as string | null,
    generatedAt: null as string | null,
    finalizedAt: null,
    pdfUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('needsRegenerationOf', () => {
  it('returns true when notesChangedAt is set and generatedAt is null (never generated)', () => {
    expect(needsRegenerationOf(row({ notesChangedAt: '2026-01-02T00:00:00.000Z' }))).toBe(true);
  });

  it('returns true when notesChangedAt is newer than generatedAt', () => {
    expect(
      needsRegenerationOf(
        row({
          notesChangedAt: '2026-01-02T00:00:01.000Z',
          generatedAt: '2026-01-02T00:00:00.000Z',
        }),
      ),
    ).toBe(true);
  });

  it('returns false when notesChangedAt equals generatedAt (snapshot semantic)', () => {
    expect(
      needsRegenerationOf(
        row({
          notesChangedAt: '2026-01-02T00:00:00.000Z',
          generatedAt: '2026-01-02T00:00:00.000Z',
        }),
      ),
    ).toBe(false);
  });

  it('returns false when notesChangedAt is older than generatedAt', () => {
    expect(
      needsRegenerationOf(
        row({
          notesChangedAt: '2026-01-01T00:00:00.000Z',
          generatedAt: '2026-01-02T00:00:00.000Z',
        }),
      ),
    ).toBe(false);
  });

  it('falls back to legacy counter when notesChangedAt is null', () => {
    expect(needsRegenerationOf(row({ notesSinceLastGeneration: 3 }))).toBe(true);
    expect(needsRegenerationOf(row({ notesSinceLastGeneration: 0 }))).toBe(false);
  });

  it('prefers notesChangedAt over legacy counter when both present (counter is stale)', () => {
    // Legacy counter says dirty, but notes_changed_at <= generated_at says clean.
    // New code path wins.
    expect(
      needsRegenerationOf(
        row({
          notesSinceLastGeneration: 5,
          notesChangedAt: '2026-01-01T00:00:00.000Z',
          generatedAt: '2026-01-02T00:00:00.000Z',
        }),
      ),
    ).toBe(false);
  });
});

describe('toReportResponse', () => {
  it('decorates the row with a needsRegeneration boolean', () => {
    const r = row({ notesSinceLastGeneration: 2 });
    expect(toReportResponse(r)).toEqual({ ...r, needsRegeneration: true });
  });
});
