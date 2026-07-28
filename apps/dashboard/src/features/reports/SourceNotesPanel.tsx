import { useQuery } from '@tanstack/react-query';
import type { notes } from '@harpa/api-contract';

import type { ReportsApi } from './api';
import { formatDateTime } from './format';

function NoteImage({ api, fileId, alt }: { api: ReportsApi; fileId: string; alt: string }) {
  const query = useQuery({
    queryKey: ['dashboard', 'report-note-file', fileId],
    queryFn: ({ signal }) => api.getFileUrl(fileId, signal),
    staleTime: 5 * 60_000,
  });

  if (query.isError) {
    return <span className="reports-muted">Photo unavailable</span>;
  }
  if (!query.data) {
    return <span className="reports-muted">Loading photo…</span>;
  }
  return <img src={query.data.url} alt={alt} loading="lazy" />;
}

function SourceNote({ api, note }: { api: ReportsApi; note: notes.Note }) {
  const noteText = note.summary || note.body || note.transcript || 'No text recorded.';
  const imageFileIds =
    note.files.length > 0
      ? note.files.map((file) => file.thumbnailFileId ?? file.fileId)
      : note.thumbnailFileId
        ? [note.thumbnailFileId]
        : note.kind === 'image' && note.fileId
          ? [note.fileId]
          : [];

  return (
    <article className="reports-note">
      <header>
        <div>
          <p className="reports-note__kind">{note.kind}</p>
          {note.title ? <h4>{note.title}</h4> : null}
        </div>
        <time dateTime={note.createdAt}>{formatDateTime(note.createdAt)}</time>
      </header>
      <p>{noteText}</p>
      {note.summary && note.transcript ? (
        <details>
          <summary>Transcript</summary>
          <p>{note.transcript}</p>
        </details>
      ) : null}
      {imageFileIds.length > 0 ? (
        <div className="reports-note__images">
          {imageFileIds.map((fileId, index) => (
            <NoteImage
              key={`${fileId}-${index}`}
              api={api}
              fileId={fileId}
              alt={`Source photo ${index + 1}`}
            />
          ))}
        </div>
      ) : null}
      {note.kind === 'document' && note.fileId ? (
        <p className="reports-note__document">Attached document</p>
      ) : null}
    </article>
  );
}

export interface SourceNotesPanelProps {
  api: ReportsApi;
  notes: readonly notes.Note[];
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

export function SourceNotesPanel({
  api,
  notes: rows,
  isLoading = false,
  error = null,
  onRetry,
}: SourceNotesPanelProps) {
  return (
    <aside className="reports-source-notes" aria-labelledby="source-notes-heading">
      <div className="reports-section-heading">
        <div>
          <p className="reports-eyebrow">Read-only evidence</p>
          <h2 id="source-notes-heading">Source notes</h2>
        </div>
        <span className="reports-badge reports-badge--neutral">Read only</span>
      </div>
      {isLoading ? (
        <p role="status">Loading source notes…</p>
      ) : error ? (
        <div className="reports-inline-error" role="alert">
          <p>Couldn&apos;t load source notes. {error.message}</p>
          {onRetry ? (
            <button
              type="button"
              className="reports-button reports-button--secondary"
              onClick={onRetry}
            >
              Retry source notes
            </button>
          ) : null}
        </div>
      ) : rows.length === 0 ? (
        <p className="reports-muted">No source notes were captured.</p>
      ) : (
        <div className="reports-note-list">
          {rows.map((note) => (
            <SourceNote key={note.id} api={api} note={note} />
          ))}
        </div>
      )}
    </aside>
  );
}
