/**
 * ProjectEdit screen body — props-only, no data fetching.
 *
 * Ported from `../haru3-reports/apps/mobile/app/projects/[projectId]/edit.tsx`
 * on branch `dev`. Field names map to the v4 contract: `clientName`
 * (camelCase) instead of `client_name`. AppDialogSheet handles the
 * destructive delete confirmation (hard rule — no Alert.alert).
 */
import { useState, useEffect, type ReactNode } from 'react';
import { View, Text, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { EditProjectSkeleton } from '@/components/skeletons/EditProjectSkeleton';
import { useLayoutShiftProbe } from '@/lib/util/layout-shift-probe';
import { colors } from '@/lib/design-tokens/colors';
import {
  type AppDialogCopy,
  getActionErrorDialogCopy,
  getDeleteProjectDialogCopy,
} from '@/lib/dialogs/app-dialog-copy';

export type ProjectEditValues = {
  name: string;
  clientName: string | null;
  address: string | null;
};

export type ProjectEditProps = {
  initial: { name: string; clientName: string | null; address: string | null } | null;
  isLoading: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  canDelete: boolean;
  updateError: string | null;
  deleteError: string | null;
  onBack: () => void;
  onSubmit: (values: ProjectEditValues) => void;
  onDelete: () => void;
  actions?: ReactNode;
};

interface DialogState extends AppDialogCopy {
  kind: 'error' | 'confirm-delete';
}

export function ProjectEdit({
  initial,
  isLoading,
  isUpdating,
  isDeleting,
  canDelete,
  updateError,
  deleteError,
  onBack,
  onSubmit,
  onDelete,
  actions,
}: ProjectEditProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [client, setClient] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    if (initial) {
      setName(initial.name ?? '');
      setAddress(initial.address ?? '');
      setClient(initial.clientName ?? '');
    }
  }, [initial]);

  // Surface delete errors via the dialog sheet.
  useEffect(() => {
    if (canDelete && deleteError) {
      setDialog({
        kind: 'error',
        ...getActionErrorDialogCopy({
          title: "Couldn't delete project",
          fallbackMessage: "Couldn't delete project. Try again.",
          message: deleteError,
        }),
      });
    }
  }, [canDelete, deleteError]);

  const confirmDelete = () => {
    setDialog({
      kind: 'confirm-delete',
      ...getDeleteProjectDialogCopy(),
    });
  };

  const closeDialog = () => {
    if (isDeleting && dialog?.kind === 'confirm-delete') return;
    setDialog(null);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      setValidationError('Project name is required.');
      return;
    }
    setValidationError(null);
    onSubmit({
      name: name.trim(),
      address: address.trim() || null,
      clientName: client.trim() || null,
    });
  };

  const errorMessage = validationError ?? updateError;
  const canDismiss = dialog?.kind !== 'confirm-delete' || !isDeleting;

  const onHeaderLayout = useLayoutShiftProbe('edit-project:header');
  const onFirstFieldLayout = useLayoutShiftProbe('edit-project:first-field');
  const onLastFieldLayout = useLayoutShiftProbe('edit-project:last-field');
  const onSubmitLayout = useLayoutShiftProbe('edit-project:submit');

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="px-5 py-4" onLayout={onHeaderLayout}>
          <ScreenHeader title="Edit project" onBack={onBack} backLabel="Overview" actions={actions} />
        </View>
        <EditProjectSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="px-5 py-4" onLayout={onHeaderLayout}>
          <ScreenHeader title="Edit project" onBack={onBack} backLabel="Overview" actions={actions} />
        </View>

        <View className="flex-1">
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ gap: 20, paddingBottom: 28 }}
            automaticallyAdjustKeyboardInsets
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <View onLayout={onFirstFieldLayout}>
              <Input
                label="Project name"
                placeholder="e.g. Highland Tower Complex"
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  setValidationError(null);
                }}
                editable={!isUpdating}
                testID="input-edit-project-name"
              />
            </View>
            <Input
              label="Project address"
              placeholder="e.g. 2400 Highland Ave, Austin TX"
              value={address}
              onChangeText={setAddress}
              editable={!isUpdating}
              testID="input-edit-project-address"
            />
            <View onLayout={onLastFieldLayout}>
              <Input
                label="Client name"
                placeholder="e.g. Acme Construction Co."
                value={client}
                onChangeText={setClient}
                editable={!isUpdating}
                testID="input-edit-client-name"
              />
            </View>
            {errorMessage ? (
              <InlineNotice tone="danger">{errorMessage}</InlineNotice>
            ) : null}

            {canDelete ? (
              <>
                <InlineNotice tone="warning" title="Heads up">
                  Deleting a project permanently removes the project and all reports.
                </InlineNotice>

                <Button
                  variant="destructive"
                  size="default"
                  className="self-start"
                  onPress={confirmDelete}
                  disabled={isDeleting}
                  testID="btn-delete-project"
                >
                  <View className="flex-row items-center gap-2">
                    <Trash2 size={16} color={colors.danger.text} />
                    <Text className="text-base font-semibold text-danger-text">
                      {isDeleting ? 'Deleting…' : 'Delete project'}
                    </Text>
                  </View>
                </Button>
              </>
            ) : null}
            <Button
              variant="hero"
              size="xl"
              className="w-full"
              onPress={handleSubmit}
              loading={isUpdating}
              testID="btn-save-project"
              onLayout={onSubmitLayout}
            >
              {isUpdating ? 'Saving…' : 'Save changes'}
            </Button>
          </ScrollView>
        </View>

        <AppDialogSheet
          visible={canDelete && dialog !== null}
          title={dialog?.title ?? 'Project Action'}
          message={dialog?.message ?? ''}
          noticeTone={dialog?.tone ?? 'danger'}
          noticeTitle={dialog?.noticeTitle}
          onClose={closeDialog}
          canDismiss={canDismiss}
          actions={
            dialog?.kind === 'confirm-delete'
              ? [
                  {
                    label: isDeleting ? 'Deleting…' : dialog.confirmLabel,
                    variant: dialog.confirmVariant,
                    onPress: onDelete,
                    disabled: isDeleting,
                    accessibilityLabel: 'Confirm delete project',
                    align: 'start',
                    testID: 'confirm-delete-project',
                  },
                  {
                    label: dialog.cancelLabel ?? 'Cancel',
                    variant: 'quiet',
                    onPress: closeDialog,
                    disabled: isDeleting,
                    accessibilityLabel: 'Cancel delete project',
                  },
                ]
              : dialog
                ? [
                    {
                      label: dialog.confirmLabel,
                      variant: dialog.confirmVariant,
                      onPress: closeDialog,
                      accessibilityLabel: 'Dismiss project action dialog',
                    },
                  ]
                : []
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default ProjectEdit;
