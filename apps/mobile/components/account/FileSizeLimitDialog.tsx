import { Text, View } from 'react-native';

import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import type { UploadFileSizeLimitError } from '@/lib/uploads/file-size-limit-error';

export interface FileSizeLimitDialogProps {
  error: UploadFileSizeLimitError | null;
  onClose: () => void;
  onUpgrade?: () => void | Promise<unknown>;
}

function formatMegabytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

export function FileSizeLimitDialog({
  error,
  onClose,
  onUpgrade,
}: FileSizeLimitDialogProps) {
  const canUpgrade = error?.plan === 'free' && onUpgrade;
  const limit = error ? formatMegabytes(error.limitBytes) : '';

  return (
    <AppDialogSheet
      visible={error !== null}
      title="File is too large"
      noticeTone="warning"
      message={
        error
          ? error.plan === 'free'
            ? `Your Free plan accepts files up to ${limit}. Choose a smaller file or upgrade to Pro.`
            : `Your plan accepts files up to ${limit}. Choose a smaller file and try again.`
          : undefined
      }
      onClose={onClose}
      actions={[
        ...(canUpgrade
          ? [{
              label: 'Upgrade',
              accessibilityLabel: 'Upgrade to Pro',
              testID: 'file-size-limit-upgrade',
              variant: 'default' as const,
              onPress: () => {
                void onUpgrade();
              },
            }]
          : []),
        {
          label: 'Close',
          testID: 'file-size-limit-close',
          variant: 'secondary',
          onPress: onClose,
        },
      ]}
    >
      {error ? (
        <View testID="file-size-limit-dialog">
          <Text className="text-xs text-muted-foreground">
            Selected file: {formatMegabytes(error.sizeBytes)}
          </Text>
        </View>
      ) : null}
    </AppDialogSheet>
  );
}
