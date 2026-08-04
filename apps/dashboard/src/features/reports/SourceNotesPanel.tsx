import { useQuery } from '@tanstack/react-query';
import type { notes } from '@harpa/api-contract';

import { Badge, Button } from '@/components/ui';

import type { ReportsApi } from './api';
import { formatDateTime } from './format';

function NoteImage({ api, fileId, alt }: { api: ReportsApi; fileId: string; alt: string }) {
  const query = useQuery({
    queryKey: ['dashboard', 'report-note-file', fileId],
    queryFn: ({ signal }) => api.getFileUrl(fileId, signal),
    staleTime: 5 * 60_000,
  });

  if (query.isError) {
    return <span className="text-meta text-muted-foreground">Photo unavailable</span>;
  }
  if (!query.data) {
    return <span className="text-meta text-muted-foreground">Loading photo…</span>;
  }
  return (
    <img
      className="aspect-4/3 w-full rounded-card-ui object-cover"
      src={query.data.url}
      alt={alt}
      loading="lazy"
    />
  );
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
    <article className="grid gap-3 rounded-card-ui border border-border bg-surface-emphasis p-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge tone="info">{note.kind}</Badge>
          {note.title ? <h4 className="mt-2 font-semibold">{note.title}</h4> : null}
        </div>
        <time
          className="whitespace-nowrap text-meta text-muted-foreground"
          dateTime={note.createdAt}
        >
          {formatDateTime(note.createdAt)}
        </time>
      </header>
      <p className="whitespace-pre-wrap">{noteText}</p>
      {note.summary && note.transcript ? (
        <details className="rounded-control-ui border border-border bg-card p-3">
          <summary className="cursor-pointer font-semibold">Transcript</summary>
          <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{note.transcript}</p>
        </details>
      ) : null}
      {imageFileIds.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
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
        <p className="text-meta text-muted-foreground">Attached document</p>
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
    <aside
      className="grid min-w-0 gap-3 rounded-card-ui border border-border bg-card p-4 shadow-raised-ui"
      aria-labelledby="source-notes-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-label" id="source-notes-heading">
          Source notes
        </h2>
        <Badge>Read only</Badge>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground" role="status">
          Loading source notes…
        </p>
      ) : error ? (
        <div
          className="grid gap-3 rounded-card-ui border border-danger-border bg-danger-soft p-4 text-danger-text"
          role="alert"
        >
          <p>Couldn&apos;t load source notes. {error.message}</p>
          {onRetry ? (
            <Button className="justify-self-start" variant="secondary" onClick={onRetry}>
              Retry source notes
            </Button>
          ) : null}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">No source notes were captured.</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((note) => (
            <SourceNote key={note.id} api={api} note={note} />
          ))}
        </div>
      )}
    </aside>
  );
}
