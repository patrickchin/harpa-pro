import { describe, expect, it } from 'vitest';
import { reports } from '@harpa/api-contract';

import type { ReportNoteRow } from '@/components/reports/detail/ReportNotesPane';
import {
  collectPlacedAttachmentIds,
  applyPhotoPlacement,
  groupPhotos,
  placementForNoteId,
  placementLabel,
  splitAttachments,
  type PhotoGroup,
  type PhotoPlacement,
} from './photo-placements';

function makeReport(): reports.ReportBody {
  return {
    meta: { title: 't', summary: 's', visitDate: null },
    weather: null,
    workers: [],
    materials: [],
    issues: [
      {
        title: 'Issue 0',
        severity: 'medium',
        description: 'd',
        action: null,
        attachments: { images: ['n_issue', 'n_missing'] },
      },
    ],
    nextSteps: [],
    summarySections: [
      { title: 'Section 0', body: 'c' },
      {
        title: 'Section 1',
        body: 'c',
        attachments: { images: ['n_section'] },
      },
    ],
  };
}

function makeGroup(noteId: string): PhotoGroup {
  return {
    noteId,
    title: 'Photo',
    photos: [
      {
        id: `${noteId}_f1`,
        fileId: `fil_${noteId}`,
        thumbnailFileId: null,
      },
    ],
  };
}

describe('collectPlacedAttachmentIds', () => {
  it('collects image note ids from issue and section attachments', () => {
    expect(collectPlacedAttachmentIds(makeReport())).toEqual(
      new Set(['n_issue', 'n_missing', 'n_section']),
    );
  });

  it('returns an empty set when report is null', () => {
    expect(collectPlacedAttachmentIds(null)).toEqual(new Set());
  });
});

describe('splitAttachments', () => {
  it('routes groups by report.body attachments and filters dangling ids', () => {
    const split = splitAttachments(
      [makeGroup('n_issue'), makeGroup('n_section'), makeGroup('n_unplaced')],
      makeReport(),
    );
    expect(split.unplaced.map((g) => g.noteId)).toEqual(['n_unplaced']);
    expect(split.byIssue.get(0)?.map((g) => g.noteId)).toEqual(['n_issue']);
    expect(split.bySection.get(1)?.map((g) => g.noteId)).toEqual(['n_section']);
  });

  it('treats every group as unplaced when report is null', () => {
    const split = splitAttachments([makeGroup('a'), makeGroup('b')], null);
    expect(split.unplaced.map((g) => g.noteId)).toEqual(['a', 'b']);
    expect(split.byIssue.size).toBe(0);
    expect(split.bySection.size).toBe(0);
  });
});

describe('groupPhotos', () => {
  it('groups by noteId without reading note placement metadata', () => {
    const rows = [
      {
        id: 'n1',
        body: null,
        kind: 'photo',
        createdAt: null,
        placement: { kind: 'issue', index: 0 },
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
      {
        id: 'r4',
        body: 'hi',
        kind: 'text',
        createdAt: null,
      },
    ] as unknown as ReportNoteRow[];
    const groups = groupPhotos(rows);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.noteId === 'n1')?.photos).toHaveLength(2);
    expect(groups.find((g) => g.noteId === 'n2')?.photos).toHaveLength(1);
    expect('placement' in groups[0]!).toBe(false);
  });
});

describe('placement helpers', () => {
  const report = makeReport();

  it('finds the current target for a note id from report.body', () => {
    expect(placementForNoteId(report, 'n_issue')).toEqual({
      kind: 'issue',
      index: 0,
    });
    expect(placementForNoteId(report, 'n_section')).toEqual({
      kind: 'section',
      index: 1,
    });
    expect(placementForNoteId(report, 'n_unplaced')).toBeNull();
  });

  it('resolves placement labels against current report titles', () => {
    expect(
      placementLabel({ kind: 'issue', index: 0 } satisfies PhotoPlacement, report),
    ).toBe('Issue 0');
    expect(placementLabel({ kind: 'section', index: 1 }, report)).toBe(
      'Section 1',
    );
    expect(placementLabel(null, report)).toBeNull();
  });

  it('moves a photo note to a new target without mutating the original report', () => {
    const original = makeReport();

    const next = applyPhotoPlacement(original, 'n_issue', {
      kind: 'section',
      index: 0,
    });

    expect(next).not.toBe(original);
    expect(next.issues[0]!.attachments?.images).toEqual(['n_missing']);
    expect(next.summarySections[0]!.attachments?.images).toEqual(['n_issue']);
    expect(original.issues[0]!.attachments?.images).toEqual([
      'n_issue',
      'n_missing',
    ]);
  });

  it('clears a photo placement immediately when target is null', () => {
    const original = makeReport();

    const next = applyPhotoPlacement(original, 'n_section', null);

    expect(next.summarySections[1]!.attachments).toBeUndefined();
    expect(original.summarySections[1]!.attachments?.images).toEqual([
      'n_section',
    ]);
  });
});
