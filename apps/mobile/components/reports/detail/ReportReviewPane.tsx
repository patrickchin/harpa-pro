/** Published-report review discussion. Props-only; the route owns I/O. */
import { useState } from 'react';
import { MessageSquare } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Input } from '@/components/primitives/Input';
import { Skeleton } from '@/components/primitives/Skeleton';
import { colors } from '@/lib/design-tokens/colors';
import { formatRelativeOrDate } from '@/lib/util/date';
import type { reports as reportSchemas } from '@harpa/api-contract';

export interface ReportReviewPaneProps {
  comments: ReadonlyArray<reportSchemas.ReportComment>;
  isLoading?: boolean;
  error?: Error | null;
  isSubmitting?: boolean;
  onRetry?: () => void;
  onAddComment?: (body: string) => void | Promise<void>;
}

export function ReportReviewPane({
  comments,
  isLoading = false,
  error = null,
  isSubmitting = false,
  onRetry,
  onAddComment,
}: ReportReviewPaneProps) {
  const [draft, setDraft] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const trimmed = draft.trim();

  const submit = async () => {
    if (!onAddComment || trimmed.length === 0 || isSubmitting) return;
    setSubmitError(null);
    try {
      await onAddComment(trimmed);
      setDraft('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't add comment.");
    }
  };

  return (
    <View testID="report-review-pane" className="gap-4 px-5">
      {isLoading ? (
        <Card testID="report-review-loading" className="gap-3">
          <Skeleton height={16} width={120} />
          <Skeleton height={14} />
          <Skeleton height={14} width="75%" />
        </Card>
      ) : error ? (
        <Card variant="danger" className="gap-3">
          <Text className="text-base font-semibold text-danger-text">
            Couldn't load review comments
          </Text>
          <Text className="text-sm text-danger-text">{error.message}</Text>
          {onRetry ? (
            <Button
              testID="btn-retry-report-review"
              variant="outline"
              size="sm"
              onPress={onRetry}
              className="self-start"
            >
              Retry
            </Button>
          ) : null}
        </Card>
      ) : comments.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={24} color={colors.muted.foreground} />}
          title="No review comments yet"
          description="Add the first comment about this published report."
        />
      ) : (
        <View className="gap-3">
          {comments.map((comment) => (
            <Card key={comment.id} testID={`report-review-comment-${comment.id}`}>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                  {comment.authorDisplayName}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {formatRelativeOrDate(comment.createdAt)}
                </Text>
              </View>
              <Text className="mt-2 text-body text-foreground" selectable>
                {comment.body}
              </Text>
            </Card>
          ))}
        </View>
      )}

      <View testID="report-review-composer" className="gap-3">
        <Input
          testID="input-report-review-comment"
          label="Add a comment"
          placeholder="Share feedback about this report"
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            if (submitError) setSubmitError(null);
          }}
          multiline
          numberOfLines={4}
          maxLength={2_000}
          editable={!isSubmitting}
          className="h-28"
          style={{ textAlignVertical: 'top', lineHeight: 20 }}
          error={submitError}
        />
        <Button
          testID="btn-add-report-review-comment"
          onPress={submit}
          disabled={!onAddComment || trimmed.length === 0}
          loading={isSubmitting}
          className="self-end"
        >
          Add comment
        </Button>
      </View>
    </View>
  );
}
