/**
 * AppDialogSheet primitive. Ported from
 * `../haru3-reports/apps/mobile/components/ui/AppDialogSheet.tsx` on
 * branch `dev`. Themed in-app dialog used everywhere Alert.alert would
 * otherwise be (hard rule: `scripts/check-no-alert-alert.sh`).
 *
 * Visible-controlled bottom sheet (RN Modal + Pressable backdrop) with
 * a tone-driven InlineNotice for the message, optional children, and a
 * stacked column of action Buttons. Stable keys: prefer caller testID,
 * fall back to slot index so duplicate labels (Share/Download "Preparing…")
 * don't collide across renders.
 */
import { type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';

import { Button } from './Button';
import { InlineNotice, type InlineNoticeTone } from './InlineNotice';
import type { AppDialogActionVariant } from '@/lib/app-dialog-copy';
import { colors } from '@/lib/design-tokens/colors';

export interface AppDialogAction {
  label: string;
  onPress: () => void;
  variant?: AppDialogActionVariant;
  disabled?: boolean;
  accessibilityLabel?: string;
  align?: 'start' | 'center';
  testID?: string;
}

export interface AppDialogSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  noticeTone?: InlineNoticeTone;
  noticeTitle?: string;
  onClose: () => void;
  canDismiss?: boolean;
  actions: AppDialogAction[];
  children?: ReactNode;
}

export function AppDialogSheet({
  visible,
  title,
  message,
  noticeTone = 'danger',
  noticeTitle,
  onClose,
  canDismiss = true,
  actions,
  children,
}: AppDialogSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (canDismiss) {
          onClose();
        }
      }}
    >
      <Pressable
        className="flex-1 justify-end bg-black/40"
        onPress={() => {
          if (canDismiss) {
            onClose();
          }
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-background pb-10"
          testID="dialog-sheet"
        >
          <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <Text className="text-xl font-bold text-foreground">{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} disabled={!canDismiss}>
              <X size={20} color={colors.muted.foreground} />
            </Pressable>
          </View>

          <View className="gap-4 px-5 pt-4">
            {message ? (
              <InlineNotice tone={noticeTone} title={noticeTitle}>
                {message}
              </InlineNotice>
            ) : null}

            {children ? <View>{children}</View> : null}

            <View className="gap-3">
              {actions.map((action, index) => (
                <Button
                  // Stable keys: prefer caller testID, fall back to
                  // slot index so duplicate labels don't collide.
                  key={action.testID ?? `dialog-action-${index}`}
                  variant={action.variant ?? 'secondary'}
                  size="lg"
                  className={action.align === 'start' ? 'justify-start' : 'justify-center'}
                  accessibilityLabel={action.accessibilityLabel}
                  testID={action.testID ?? `dialog-action-${index}`}
                  onPress={action.onPress}
                  disabled={action.disabled}
                >
                  {action.label}
                </Button>
              ))}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
