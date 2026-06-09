/**
 * Photo placement helpers. Placement source of truth is the live
 * GeneratedSiteReport body: issue/section `attachments.images[]`
 * contain image note ids.
 */
import type { GeneratedSiteReport } from '@harpa/report-core';

import type { ReportNoteRow } from '@/components/reports/detail/ReportNotesPane';

export type PhotoPlacement =
  | { kind: 'issue'; index: number }
  | { kind: 'section'; index: number };

export interface PhotoGroupTile {
  id: string;
  fileId: string;
  thumbnailFileId: string | null;
}

export interface PhotoGroup {
  noteId: string;
  title: string;
  photos: ReadonlyArray<PhotoGroupTile>;
}

export interface SplitPlacements {
  unplaced: PhotoGroup[];
  byIssue: Map<number, PhotoGroup[]>;
  bySection: Map<number, PhotoGroup[]>;
}

export function collectPlacedAttachmentIds(
  report: GeneratedSiteReport | null,
): Set<string> {
  const out = new Set<string>();
  if (!report) return out;
  for (const issue of report.report.issues) {
    for (const id of issue.attachments?.images ?? []) out.add(id);
  }
  for (const section of report.report.sections) {
    for (const id of section.attachments?.images ?? []) out.add(id);
  }
  return out;
}

function pushPlaced(
  bucket: Map<number, PhotoGroup[]>,
  index: number,
  group: PhotoGroup,
): void {
  const list = bucket.get(index);
  if (list) list.push(group);
  else bucket.set(index, [group]);
}

export function splitAttachments(
  groups: ReadonlyArray<PhotoGroup>,
  report: GeneratedSiteReport | null,
): SplitPlacements {
  if (!report) {
    return {
      unplaced: [...groups],
      byIssue: new Map(),
      bySection: new Map(),
    };
  }

  const groupsByNoteId = new Map(groups.map((group) => [group.noteId, group]));
  const placed = new Set<string>();
  const byIssue = new Map<number, PhotoGroup[]>();
  const bySection = new Map<number, PhotoGroup[]>();

  report.report.issues.forEach((issue, index) => {
    for (const noteId of issue.attachments?.images ?? []) {
      const group = groupsByNoteId.get(noteId);
      if (!group || placed.has(noteId)) continue;
      placed.add(noteId);
      pushPlaced(byIssue, index, group);
    }
  });

  report.report.sections.forEach((section, index) => {
    for (const noteId of section.attachments?.images ?? []) {
      const group = groupsByNoteId.get(noteId);
      if (!group || placed.has(noteId)) continue;
      placed.add(noteId);
      pushPlaced(bySection, index, group);
    }
  });

  return {
    unplaced: groups.filter((group) => !placed.has(group.noteId)),
    byIssue,
    bySection,
  };
}

export const splitPlacements = splitAttachments;

export function groupPhotos(
  noteRows: ReadonlyArray<ReportNoteRow> | undefined,
): PhotoGroup[] {
  const out: PhotoGroup[] = [];
  for (const n of noteRows ?? []) {
    if (n.kind !== 'photo') continue;
    const title = n.body?.trim() || 'Photo';
    let tiles: PhotoGroupTile[] = [];
    if (n.files && n.files.length > 0) {
      tiles = n.files
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((f) => ({
          id: f.id,
          fileId: f.fileId,
          thumbnailFileId: f.thumbnailFileId,
        }));
    } else if (n.fileId) {
      tiles = [
        {
          id: n.id,
          fileId: n.fileId,
          thumbnailFileId: n.thumbnailFileId ?? null,
        },
      ];
    }
    if (tiles.length === 0) continue;
    out.push({ noteId: n.id, title, photos: tiles });
  }
  return out;
}

export function placementForNoteId(
  report: GeneratedSiteReport | null,
  noteId: string | null,
): PhotoPlacement | null {
  if (!report || !noteId) return null;
  const issueIndex = report.report.issues.findIndex((issue) =>
    (issue.attachments?.images ?? []).includes(noteId),
  );
  if (issueIndex >= 0) return { kind: 'issue', index: issueIndex };

  const sectionIndex = report.report.sections.findIndex((section) =>
    (section.attachments?.images ?? []).includes(noteId),
  );
  if (sectionIndex >= 0) return { kind: 'section', index: sectionIndex };
  return null;
}

export function placementLabel(
  placement: PhotoPlacement | null,
  report: GeneratedSiteReport | null,
): string | null {
  if (!placement || !report) return null;
  if (placement.kind === 'issue') {
    return report.report.issues[placement.index]?.title ?? null;
  }
  return report.report.sections[placement.index]?.title ?? null;
}
