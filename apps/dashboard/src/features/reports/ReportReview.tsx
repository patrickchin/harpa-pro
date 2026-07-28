import { useId, useState } from 'react';
import type { reports } from '@harpa/api-contract';

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
    <section className="reports-review" aria-labelledby={`${id}-heading`}>
      <header>
        <p className="reports-eyebrow">Append-only discussion</p>
        <h2 id={`${id}-heading`}>Review</h2>
      </header>

      {isLoading ? (
        <p role="status">Loading review comments…</p>
      ) : error ? (
        <div className="reports-inline-error" role="alert">
          <p>Couldn&apos;t load review comments. {error.message}</p>
          {onRetry ? (
            <button
              type="button"
              className="reports-button reports-button--secondary"
              onClick={onRetry}
            >
              Retry comments
            </button>
          ) : null}
        </div>
      ) : comments.length === 0 ? (
        <p className="reports-empty-copy">
          No review comments yet. Add the first comment about this finalized report.
        </p>
      ) : (
        <ol className="reports-comment-list">
          {comments.map((comment) => (
            <li key={comment.id}>
              <article>
                <header>
                  <strong>{comment.authorDisplayName}</strong>
                  <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
                </header>
                <p>{comment.body}</p>
              </article>
            </li>
          ))}
        </ol>
      )}

      <form className="reports-comment-form" onSubmit={submit}>
        <label className="reports-field" htmlFor={`${id}-comment`}>
          <span>Add a comment</span>
          <textarea
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
        </label>
        <div className="reports-comment-form__actions">
          <span>{draft.length}/2,000</span>
          <button
            type="submit"
            className="reports-button reports-button--primary"
            disabled={!trimmed || isSubmitting}
          >
            {isSubmitting ? 'Adding comment…' : 'Add comment'}
          </button>
        </div>
        {submitError ? (
          <p className="reports-field-error" role="alert">
            {submitError}
          </p>
        ) : null}
      </form>
    </section>
  );
}
