import { describe, expect, it } from 'vitest';
import type { GeneratedSiteReport } from '@harpa/report-core';

import type { ReportNoteRow } from '@/components/reports/detail/ReportNotesPane';
import {
  groupPhotos,
  placementLabel,
  splitPlacements,
  type PhotoGroup,
  type PhotoPlacement,
} from './photo-placements';

function makeReport(
  issueCount: number,
  sectionCount: number,
): GeneratedSiteReport {
  return {
    report: {
      meta: { title: 't', summary: 's', visitDate: null },
      weather: null,
      workers: null,
      materials: [],
      issues: Array.from({ length: issueCount }, (_, i) => ({
        title: `Issue ${i}`,
        category: 'safety',
        severity: 'medium',
        status: 'open',
        details: 'd',
        actionRequired: null,
      })),
      nextSteps: [],
      sections: Array.from({ length: sectionCount }, (_, i) => ({
        title: `Section ${i}`,
        content: 'c',
      })),
    },
  };
}

function makeGroup(noteId: string, placement: PhotoPlacement | null): PhotoGroup {
  return {
    noteId,
    title: 'Photo',
    placement,
    photos: [
      {
        id: `${noteId}_f1`,
        fileId: 'fil_x',
        thumbnailFileId: null,
      },
    ],
  };
}

describe('splitPlacements', () => {
  it('routes groups to issues, sections, and unplaced buckets', () => {
    const report = makeReport(2, 2);
    const groups = [
      makeGroup('a', null),
      makeGroup('b', { kind: 'issue', index: 0 }),
      makeGroup('c', { kind: 'issue', index: 0 }),
      makeGroup('d', { kind: 'section', index: 1 }),
    ];
    const split = splitPlacements(groups, report);
    expect(split.unplaced.map((g) => g.noteId)).toEqual(['a']);
    expect(split.byIssue.get(0)?.map((g) => g.noteId)).toEqual(['b', 'c']);
    expect(split.bySection.get(1)?.map((g) => g.noteId)).toEqual(['d']);
    expect(split.orphans).toEqual([]);
  });

  it('classifies out-of-range placements as orphans', () => {
    const report = makeReport(1, 1);
    const groups = [
      makeGroup('x', { kind: 'issue', index: 5 }),
      makeGroup('y', { kind: 'section', index: -1 }),
      makeGroup('z', { kind: 'issue', index: 0 }),
    ];
    const split = splitPlacements(groups, report);
    expect(split.orphans.map((g) => g.noteId)).toEqual(['x', 'y']);
    expect(split.byIssue.get(0)?.map((g) => g.noteId)).toEqual(['z']);
  });

  it('treats every placed group as orphan when report is null', () => {
    const groups = [
      makeGroup('a', null),
      makeGroup('b', { kind: 'issue', index: 0 }),
    ];
    const split = splitPlacements(groups, null);
    expect(split.unplaced.map((g) => g.noteId)).toEqual(['a']);
    expect(split.orphans.map((g) => g.noteId)).toEqual(['b']);
  });
});

describe('groupPhotos', () => {
  it('groups by noteId and attaches placement from the side-channel', () => {
    const rows: ReportNoteRow[] = [
      {
        id: 'n1',
        body: null,
        kind: 'photo',
        createdAt: null,
        files: [
          { id: 'r1', fileId: 'f1', thumbnailFileId: null, position: 0 },
          { id: 'r2', fileId: 'f2', thumbnailFileId: null, position: 1 },
        ],
      },
      {
        id: 'n2',
        body: null,
        kind: 'photo',
        createdAt: null,
        fileId: 'f3',
      },
      // Non-photo rows are filtered out
      {
        id: 'r4',
        body: 'hi',
        kind: 'text',
        createdAt: null,
      },
    ];
    const placements = new Map<string, PhotoPlacement | null>([
      ['n1', { kind: 'issue', index: 0 }],
    ]);
    const groups = groupPhotos(rows, placements);
    expect(groups).toHaveLength(2);
    const n1 = groups.find((g) => g.noteId === 'n1')!;
    const n2 = groups.find((g) => g.noteId === 'n2')!;
    expect(n1.photos).toHaveLength(2);
    expect(n1.placement).toEqual({ kind: 'issue', index: 0 });
    expect(n2.photos).toHaveLength(1);
    expect(n2.placement).toBeNull();
  });
});

describe('placementLabel', () => {
  const report = makeReport(2, 2);
  it('returns null for null placement', () => {
    expect(placementLabel(null, report)).toBeNull();
  });
  it('returns the issue title when placement points to a real issue', () => {
    expect(placementLabel({ kind: 'issue', index: 1 }, report)).toBe('Issue 1');
  });
  it('returns the section title when placement points to a real section', () => {
    expect(placementLabel({ kind: 'section', index: 0 }, report)).toBe(
      'Section 0',
    );
  });
  it('returns null for out-of-range placement', () => {
    expect(placementLabel({ kind: 'issue', index: 99 }, report)).toBeNull();
  });
});
