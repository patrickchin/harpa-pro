/**
 * EditSectionSheet — full-screen modal shell for per-card edit flows.
 *
 * Generic in the draft type. Owns:
 *  - draft state seeded from `initialValue` when `visible` flips
 *    `false → true`
 *  - dirtiness check (deep-equal via JSON.stringify, matching the
 *    snapshot-comparison pattern in saved-report.tsx)
 *  - Cancel-with-confirm via `AppDialogSheet` when dirty
 *  - Save button enable/disable + an optional Delete button (used by
 *    per-item targets like a single issue or detailed section)
 *
 * The body is rendered through a render-prop so each kind owns its own
 * field layout while the shell handles the chrome and state machine.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Trash2, X } from 'lucide-react-native';

import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { Button } from '@/components/primitives/Button';
import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { colors } from '@/lib/design-tokens/colors';

export interface EditSectionSheetProps<T> {
  visible: boolean;
  title: string;
  initialValue: T;
  onCancel: () => void;
  onSave: (next: T) => void;
  /** Only supplied for per-item targets (issue, detailed section). */
  onDelete?: () => void;
  deleteLabel?: string;
  children: (draft: T, setDraft: (next: T) => void) => ReactNode;
  testID?: string;
}

function isDirty<T>(a: T, b: T): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function EditSectionSheet<T>({
  visible,
  title,
  initialValue,
  onCancel,
  onSave,
  onDelete,
  deleteLabel = 'Delete',
  children,
  testID,
}: EditSectionSheetProps<T>) {
  const [draft, setDraft] = useState<T>(initialValue);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Re-seed the draft whenever the modal opens so a previously-edited
  // draft from a different target doesn't leak across opens. We
  // deliberately re-seed only on the visible→true transition; depending
  // on `initialValue` here would clobber the user's in-progress edits
  // when the parent re-renders.
  useEffect(() => {
    if (visible) {
      setDraft(initialValue);
      setConfirmCancelOpen(false);
      setConfirmDeleteOpen(false);
    }
  }, [visible]);

  const dirty = isDirty(draft, initialValue);

  const handleRequestCancel = () => {
    if (dirty) {
      setConfirmCancelOpen(true);
    } else {
      onCancel();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleRequestCancel}
      testID={testID}
    >
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
        >
          <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
            <Pressable
              onPress={handleRequestCancel}
              hitSlop={12}
              accessibilityLabel="Cancel edit"
              testID="btn-edit-modal-cancel"
            >
              <X size={22} color={colors.foreground} />
            </Pressable>
            <Text
              className="flex-1 px-3 text-center text-lg font-semibold text-foreground"
              numberOfLines={1}
            >
              {title}
            </Text>
            <Button
              variant="default"
              size="sm"
              onPress={() => onSave(draft)}
              disabled={!dirty}
              testID="btn-edit-modal-save"
              accessibilityLabel="Save edit"
            >
              Save
            </Button>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-4 px-5 py-5"
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            {children(draft, setDraft)}

            {onDelete ? (
              <Pressable
                onPress={() => setConfirmDeleteOpen(true)}
                className="mt-2 flex-row items-center justify-center gap-2 rounded-md border border-danger-border bg-danger-soft px-4 py-3"
                accessibilityLabel={deleteLabel}
                testID="btn-edit-modal-delete"
              >
                <Trash2 size={16} color={colors.danger.text} />
                <Text className="text-base font-semibold text-danger-text">
                  {deleteLabel}
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <AppDialogSheet
        visible={confirmCancelOpen}
        title="Discard changes?"
        message="Your edits to this section will be lost."
        noticeTone="warning"
        onClose={() => setConfirmCancelOpen(false)}
        actions={[
          {
            label: 'Discard',
            variant: 'destructive',
            onPress: () => {
              setConfirmCancelOpen(false);
              onCancel();
            },
            align: 'start',
            testID: 'btn-edit-modal-discard-confirm',
          },
          {
            label: 'Keep editing',
            variant: 'quiet',
            onPress: () => setConfirmCancelOpen(false),
          },
        ]}
      />

      <AppDialogSheet
        visible={confirmDeleteOpen}
        title={deleteLabel}
        message="This will remove the entry from the report."
        noticeTone="danger"
        onClose={() => setConfirmDeleteOpen(false)}
        actions={[
          {
            label: 'Delete',
            variant: 'destructive',
            onPress: () => {
              setConfirmDeleteOpen(false);
              onDelete?.();
            },
            align: 'start',
            testID: 'btn-edit-modal-delete-confirm',
          },
          {
            label: 'Cancel',
            variant: 'quiet',
            onPress: () => setConfirmDeleteOpen(false),
          },
        ]}
      />
    </Modal>
  );
}
