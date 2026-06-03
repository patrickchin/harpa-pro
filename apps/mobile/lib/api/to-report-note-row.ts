/**
 * toReportNoteRows — shared adapter from the API note shape
 * (`packages/api-contract` notes list response) to the mobile
 * `ReportNoteRow` consumed by both the inline saved-report Notes
 * tab (`reports/[number]/index.tsx`) and the dedicated finalised-
 * report Notes screen (`reports/[number]/notes.tsx`).
 *
 * Image notes are canonical-via-`note_files`: the API returns one
 * row with a `files[]` array. This helper preserves that shape on
 * the mobile side — one `ReportNoteRow` per note, `files[]` carried
 * through — so consumers (`ReportNotesPane`, `ReportPhotos`,
 * `saved-report.photoGallery`) can render every image of a batch
 * without fanning out into duplicate cards.
 */
import type { ReportNoteRow } from '@/components/reports/detail/ReportNotesPane';

export interface ApiNoteRowInput {
  id: string;
  authorId?: string;
  kind: 'text' | 'voice' | 'image' | 'document';
  body: string | null;
  transcript: string | null;
  title?: string | null;
  summary?: string | null;
  durationSec?: number | null;
  fileId: string | null;
  thumbnailFileId?: string | null;
  files?: ReadonlyArray<{
    id: string;
    fileId: string;
    thumbnailFileId: string | null;
    position: number;
    caption: string | null;
  }>;
  /** Stored placement pointer for image notes; null = unplaced. */
  placement?: { kind: 'issue' | 'section'; index: number } | null;
  createdAt: string;
}

export function toReportNoteRows(
  items: ReadonlyArray<ApiNoteRowInput> | undefined,
  memberNames: ReadonlyMap<string, string>,
): ReadonlyArray<ReportNoteRow> {
  if (!items) return [];
  return items.map((n) => {
    const authorName = n.authorId
      ? memberNames.get(n.authorId) ?? null
      : null;
    return {
      id: n.id,
      body: n.body ?? n.transcript ?? null,
      kind: n.kind === 'image' ? 'photo' : n.kind,
      createdAt: n.createdAt ?? null,
      authorName,
      fileId: n.fileId ?? null,
      thumbnailFileId: n.thumbnailFileId ?? null,
      files: n.files ?? null,
      placement: n.kind === 'image' ? n.placement ?? null : null,
      transcript: n.transcript ?? null,
      title: n.title ?? null,
      summary: n.summary ?? null,
      durationSec: n.durationSec ?? null,
    };
  });
}

/**
 * One entry per photo in the swipeable preview gallery — flattened
 * across every image note's `files[]` (with a legacy single-`fileId`
 * fallback). Ordered newest-note-first / earliest-position-first so
 * the gallery walks photos in the same direction the timeline reads.
 *
 * Both `screens/saved-report.tsx` and `screens/report-notes.tsx`
 * resolve a tap on a tile to an index in this list via `findIndex`
 * by `fileId`, so this is the canonical source of truth for the
 * fullscreen modal's stride.
 */
export interface PhotoGalleryEntry {
  fileId: string;
  thumbnailFileId: string | null;
  noteId: string;
  title: string;
  cacheKey: string;
}

export function flattenPhotoGallery(
  noteRows: ReadonlyArray<ReportNoteRow> | undefined,
): ReadonlyArray<PhotoGalleryEntry> {
  if (!noteRows) return [];
  const photoNotes = noteRows
    .filter((n) => n.kind === 'photo')
    .slice()
    .sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });
  const out: PhotoGalleryEntry[] = [];
  for (const n of photoNotes) {
    const title = n.body?.trim() || 'Photo';
    if (n.files && n.files.length > 0) {
      const sorted = n.files.slice().sort((a, b) => a.position - b.position);
      for (const f of sorted) {
        out.push({
          fileId: f.fileId,
          thumbnailFileId: f.thumbnailFileId,
          noteId: n.id,
          title,
          cacheKey: f.fileId,
        });
      }
      continue;
    }
    if (n.fileId) {
      out.push({
        fileId: n.fileId,
        thumbnailFileId: n.thumbnailFileId ?? null,
        noteId: n.id,
        title,
        cacheKey: n.fileId,
      });
    }
  }
  return out;
}
