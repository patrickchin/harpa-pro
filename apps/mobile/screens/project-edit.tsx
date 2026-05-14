/**
 * ProjectEdit screen body — props-only, no data fetching.
 *
 * Ported from `../haru3-reports/apps/mobile/app/projects/[projectId]/edit.tsx`
 * on branch `dev`. Field names map to the v4 contract: `clientName`
 * (camelCase) instead of `client_name`. AppDialogSheet handles the
 * destructive delete confirmation (hard rule — no Alert.alert).
 */
import { useState, useEffect } from 'react';
import { View, Text, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { EditProjectSkeleton } from '@/components/skeletons/EditProjectSkeleton';
import { colors } from '@/lib/design-tokens/colors';
import {
  type AppDialogCopy,
  getActionErrorDialogCopy,
  getDeleteProjectDialogCopy,
} from '@/lib/app-dialog-copy';

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
  updateError: string | null;
  deleteError: string | null;
  onBack: () => void;
  onSubmit: (values: ProjectEditValues) => void;
  onDelete: () => void;
};

interface DialogState extends AppDialogCopy {
  kind: 'error' | 'confirm-delete';
}

export function ProjectEdit({
  initial,
  isLoading,
  isUpdating,
  isDeleting,
  updateError,
  deleteError,
  onBack,
  onSubmit,
  onDelete,
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
    if (deleteError) {
      setDialog({
        kind: 'error',
        ...getActionErrorDialogCopy({
          title: 'Delete Failed',
          fallbackMessage: 'Failed to delete project.',
          message: deleteError,
        }),
      });
    }
  }, [deleteError]);

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

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="px-5 py-4">
          <ScreenHeader title="Edit Project" onBack={onBack} backLabel="Overview" />
        </View>
        <EditProjectSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="px-5 py-4">
          <ScreenHeader title="Edit Project" onBack={onBack} backLabel="Overview" />
        </View>

        <View className="flex-1">
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ gap: 20, paddingBottom: 28 }}
            automaticallyAdjustKeyboardInsets
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <Input
              label="Project Name"
              placeholder="e.g. Highland Tower Complex"
              value={name}
              onChangeText={(v) => {
                setName(v);
                setValidationError(null);
              }}
              editable={!isUpdating}
              testID="input-edit-project-name"
            />
            <Input
              label="Project Address"
              placeholder="e.g. 2400 Highland Ave, Austin TX"
              value={address}
              onChangeText={setAddress}
              editable={!isUpdating}
              testID="input-edit-project-address"
            />
            <Input
              label="Client Name"
              placeholder="e.g. Acme Construction Co."
              value={client}
              onChangeText={setClient}
              editable={!isUpdating}
              testID="input-edit-client-name"
            />
            {errorMessage ? (
              <InlineNotice tone="danger">{errorMessage}</InlineNotice>
            ) : null}

            <InlineNotice tone="warning" title="Use delete carefully">
              Deleting a project permanently removes the project and all its
              reports. Save normal detail changes with the primary action below.
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
                  {isDeleting ? 'Deleting…' : 'Delete Project'}
                </Text>
              </View>
            </Button>
            <Button
              variant="hero"
              size="xl"
              className="w-full"
              onPress={handleSubmit}
              loading={isUpdating}
              testID="btn-save-project"
            >
              {isUpdating ? 'Saving…' : 'Save Changes'}
            </Button>
          </ScrollView>
        </View>

        <AppDialogSheet
          visible={dialog !== null}
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
