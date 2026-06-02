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
      transcript: n.transcript ?? null,
      title: n.title ?? null,
      summary: n.summary ?? null,
      durationSec: n.durationSec ?? null,
    };
  });
}
