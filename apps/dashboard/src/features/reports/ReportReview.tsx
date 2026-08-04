import { useId, useState } from 'react';
import type { reports } from '@harpa/api-contract';

import { Button, Field, Textarea } from '@/components/ui';

import { errorMessage } from './api';
import { formatDateTime } from './format';

export interface ReportReviewProps {
  comments: readonly reports.ReportComment[];
  isLoading?: boolean;
  error?: Error | null;
  isSubmitting?: boolean;
  onRetry?: () => void;
  onAddComment: (body: string) => Promise<void>;
}

export function ReportReview({
  comments,
  isLoading = false,
  error = null,
  isSubmitting = false,
  onRetry,
  onAddComment,
}: ReportReviewProps) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const trimmed = draft.trim();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed || isSubmitting) return;
    setSubmitError(null);
    try {
      await onAddComment(trimmed);
      setDraft('');
    } catch (caught) {
      setSubmitError(errorMessage(caught, "Couldn't add comment."));
    }
  };

  return (
    <section className="mx-auto grid max-w-[52rem] gap-4" aria-label="Review discussion">
      {isLoading ? (
        <p className="text-muted-foreground" role="status">
          Loading review comments…
        </p>
      ) : error ? (
        <div
          className="grid gap-3 rounded-card-ui border border-danger-border bg-danger-soft p-4 text-danger-text"
          role="alert"
        >
          <p>Couldn&apos;t load review comments. {error.message}</p>
          {onRetry ? (
            <Button className="justify-self-start" variant="secondary" onClick={onRetry}>
              Retry comments
            </Button>
          ) : null}
        </div>
      ) : comments.length === 0 ? (
        <p className="px-4 py-6 text-center text-muted-foreground">
          No review comments yet. Add the first comment about this finalized report.
        </p>
      ) : (
        <ol className="grid list-none gap-3 p-0">
          {comments.map((comment) => (
            <li key={comment.id}>
              <article className="grid gap-2 rounded-card-ui border border-border bg-card p-3">
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <strong className="font-semibold">{comment.authorDisplayName}</strong>
                  <time
                    className="whitespace-nowrap text-meta text-muted-foreground"
                    dateTime={comment.createdAt}
                  >
                    {formatDateTime(comment.createdAt)}
                  </time>
                </header>
                <p className="whitespace-pre-wrap">{comment.body}</p>
              </article>
            </li>
          ))}
        </ol>
      )}

      <form className="grid gap-3" onSubmit={submit}>
        <Field htmlFor={`${id}-comment`} label="Add a comment">
          <Textarea
            id={`${id}-comment`}
            rows={4}
            maxLength={2_000}
            value={draft}
            disabled={isSubmitting}
            placeholder="Share feedback about this report"
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              setSubmitError(null);
            }}
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3 text-meta text-muted-foreground">
          <span>{draft.length}/2,000</span>
          <Button type="submit" disabled={!trimmed || isSubmitting}>
            {isSubmitting ? 'Adding comment…' : 'Add comment'}
          </Button>
        </div>
        {submitError ? (
          <p className="text-meta text-danger-text" role="alert">
            {submitError}
          </p>
        ) : null}
      </form>
    </section>
  );
}
