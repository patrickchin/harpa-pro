/**
 * UsageLimitDialog — shown when an API call returns 403
 * `usage_limit_exceeded`. Renders the bucket name + used/limit +
 * reset boundary in an AppDialogSheet so we never use Alert.alert
 * (hard rule).
 *
 * Props-only: callers (route handlers / mutations) map their captured
 * error to `details` via `usageLimitFromError(err)` and pass `visible`
 * + `onClose`. The dialog itself doesn't refetch anything — when the
 * user dismisses we just close.
 *
 * Phase 3 of per-account usage limits — see
 * docs/v4/arch-usage-limits.md §5.
 */
import { View, Text } from 'react-native';

import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import type { UsageLimitDetails, UsageLimitKind } from '@/lib/api/usage-limit-error';

export interface UsageLimitDialogProps {
  visible: boolean;
  details: UsageLimitDetails | null;
  onClose: () => void;
}

const KIND_LABEL: Record<UsageLimitKind, string> = {
  report_generate: 'report generations',
  voice_transcribe: 'voice transcriptions',
  voice_summarize: 'voice summaries',
  ai_input_tokens: 'AI input tokens',
  ai_output_tokens: 'AI output tokens',
};

function formatReset(iso: string): string {
  if (!iso) return 'next month';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'next month';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export function UsageLimitDialog({ visible, details, onClose }: UsageLimitDialogProps) {
  const kindLabel = details ? KIND_LABEL[details.kind] : '';
  const resetLabel = details ? formatReset(details.resetAt) : '';
  const usedLimit =
    details && details.limit !== null
      ? `${details.used} of ${details.limit}`
      : details
        ? `${details.used}`
        : '';

  return (
    <AppDialogSheet
      visible={visible}
      title="Monthly limit reached"
      noticeTone="warning"
      noticeTitle={details ? `You've used ${usedLimit} ${kindLabel} this month.` : undefined}
      message={
        details
          ? `Your limit resets on ${resetLabel}. To keep working before then, please upgrade your plan or contact support.`
          : undefined
      }
      onClose={onClose}
      actions={[
        {
          label: 'OK',
          onPress: onClose,
          variant: 'default',
          testID: 'usage-limit-dialog-ok',
        },
      ]}
    >
      {details && (
        <View testID="usage-limit-dialog-details" className="gap-1">
          <Text className="text-xs text-muted-foreground">
            Plan: {details.plan.toUpperCase()}
            {details.overridden ? ' (custom limit)' : ''}
          </Text>
        </View>
      )}
    </AppDialogSheet>
  );
}
