/**
 * Photo placement split helper. Pure function — no React, no fetching.
 *
 * Takes the report's photo groups (one entry per parent note id, with
 * the underlying files for that note) and the live `GeneratedSiteReport`.
 * Splits the groups into:
 *
 *   - `unplaced` — groups with `placement === null`. Render in the
 *     bottom photo strip (`ReportPhotos`).
 *   - `byIssue` — Map keyed by issue index, only including groups
 *     whose placement target still exists in `report.issues`.
 *   - `bySection` — same idea for `report.sections`.
 *   - `orphans` — groups whose placement target index is out of
 *     range. The caller is expected to fire-and-forget a PATCH to
 *     clear those (self-heal) and surface them as unplaced for now.
 *
 * Out-of-range checks happen here so the rest of the UI never has to
 * worry about stale placements after an LLM regenerates and shuffles
 * issues / sections.
 */
import type { GeneratedSiteReport } from '@harpa/report-core';

import type { ReportNoteRow } from '@/components/reports/detail/ReportNotesPane';

/** Stored placement payload — matches the API + Drizzle column type. */
export type PhotoPlacement =
  | { kind: 'issue'; index: number }
  | { kind: 'section'; index: number };

/** A single tile within a photo group. */
export interface PhotoGroupTile {
  id: string;
  fileId: string;
  thumbnailFileId: string | null;
}

/** A single photo group keyed by parent `noteId` with N tiles. */
export interface PhotoGroup {
  noteId: string;
  title: string;
  photos: ReadonlyArray<PhotoGroupTile>;
  placement: PhotoPlacement | null;
}

export interface SplitPlacements {
  unplaced: PhotoGroup[];
  byIssue: Map<number, PhotoGroup[]>;
  bySection: Map<number, PhotoGroup[]>;
  /** Groups with a placement that no longer matches a real target. */
  orphans: PhotoGroup[];
}

export function splitPlacements(
  groups: ReadonlyArray<PhotoGroup>,
  report: GeneratedSiteReport | null,
): SplitPlacements {
  const issueCount = report?.report.issues.length ?? 0;
  const sectionCount = report?.report.sections.length ?? 0;

  const unplaced: PhotoGroup[] = [];
  const byIssue = new Map<number, PhotoGroup[]>();
  const bySection = new Map<number, PhotoGroup[]>();
  const orphans: PhotoGroup[] = [];

  for (const g of groups) {
    if (g.placement === null) {
      unplaced.push(g);
      continue;
    }
    const { kind, index } = g.placement;
    if (kind === 'issue') {
      if (index < 0 || index >= issueCount) {
        orphans.push(g);
        continue;
      }
      const list = byIssue.get(index);
      if (list) list.push(g);
      else byIssue.set(index, [g]);
    } else {
      if (index < 0 || index >= sectionCount) {
        orphans.push(g);
        continue;
      }
      const list = bySection.get(index);
      if (list) list.push(g);
      else bySection.set(index, [g]);
    }
  }

  return { unplaced, byIssue, bySection, orphans };
}

/**
 * Build photo groups from a flat list of note rows. Each image-kind
 * note contributes exactly one group. Photos come from the note's
 * `files[]` array (canonical post-`note_files` migration), falling
 * back to the legacy single-file `fileId` for image notes that
 * pre-date the migration and were never backfilled.
 *
 * `placementsByNoteId` is a side-channel because the placement field
 * lives on the raw API note, not on the flattened row. The caller
 * (parent screen) reads it off the API response before flattening.
 */
export function groupPhotos(
  noteRows: ReadonlyArray<ReportNoteRow> | undefined,
  placementsByNoteId: ReadonlyMap<string, PhotoPlacement | null>,
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
    out.push({
      noteId: n.id,
      title,
      photos: tiles,
      placement: placementsByNoteId.get(n.id) ?? null,
    });
  }
  return out;
}

/**
 * Resolve a placement to a human-readable label. Returns `null` for
 * unplaced groups, or for placements that point to a missing target
 * (caller renders such groups as unplaced after self-heal).
 */
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
