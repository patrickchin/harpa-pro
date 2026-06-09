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
import {
  collectPlacedAttachmentIds,
  needsRegenerationOf,
  preserveExistingAttachments,
  sanitiseAttachments,
  toReportResponse,
} from './reports.js';

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

const body = {
  meta: { title: null, summary: null, visitDate: null },
  weather: null,
  workers: [],
  materials: [],
  issues: [
    {
      title: 'Issue A',
      severity: 'medium',
      description: null,
      action: null,
    },
    {
      title: 'Issue B',
      severity: 'low',
      description: null,
      action: null,
    },
  ],
  nextSteps: [],
  summarySections: [
    { title: 'Section A', body: 'A' },
    { title: 'Section B', body: 'B' },
  ],
};

describe('report body attachments helpers', () => {
  it('collects placed image/document IDs from issues and sections', () => {
    const ids = collectPlacedAttachmentIds({
      ...body,
      issues: [
        { ...body.issues[0]!, attachments: { images: ['not_a'], documents: ['not_doc'] } },
        body.issues[1]!,
      ],
      summarySections: [
        body.summarySections[0]!,
        { ...body.summarySections[1]!, attachments: { images: ['not_b'] } },
      ],
    });
    expect(ids.images).toEqual(new Set(['not_a', 'not_b']));
    expect(ids.documents).toEqual(new Set(['not_doc']));
  });

  it('sanitises invalid and duplicate attachment IDs in reading order', () => {
    const cleaned = sanitiseAttachments(
      {
        ...body,
        issues: [
          { ...body.issues[0]!, attachments: { images: ['not_a', 'not_missing', 'not_b'] } },
          { ...body.issues[1]!, attachments: { images: ['not_b'] } },
        ],
        summarySections: [
          { ...body.summarySections[0]!, attachments: { images: ['not_a', 'not_c'] } },
          body.summarySections[1]!,
        ],
      },
      {
        images: new Set(['not_a', 'not_b', 'not_c']),
        documents: new Set(),
      },
    );

    expect(cleaned.issues[0]!.attachments?.images).toEqual(['not_a', 'not_b']);
    expect(cleaned.issues[1]!.attachments).toBeUndefined();
    expect(cleaned.summarySections[0]!.attachments?.images).toEqual(['not_c']);
  });

  it('preserves an existing user placement when generated output omits it', () => {
    const current = {
      ...body,
      issues: [
        { ...body.issues[0]!, attachments: { images: ['not_user'] } },
        body.issues[1]!,
      ],
    };
    const generated = {
      ...body,
      issues: [
        { ...body.issues[0]!, attachments: { images: ['not_llm'] } },
        body.issues[1]!,
      ],
    };

    const out = preserveExistingAttachments(generated, current, {
      images: new Set(['not_user', 'not_llm']),
      documents: new Set(),
    });

    expect(out.issues[0]!.attachments?.images).toEqual(['not_llm', 'not_user']);
  });
});
