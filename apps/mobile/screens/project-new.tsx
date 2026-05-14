/**
 * ProjectNew screen body — props-only, no data fetching.
 *
 * Ported from
 * `../haru3-reports/apps/mobile/app/projects/new.tsx` on branch `dev`.
 * JSX + Tailwind classes copied verbatim; the v3 useLocalProjectMutations
 * is replaced with caller-supplied `onSubmit` + status props so the
 * real route can wire useCreateProjectMutation.
 */
import { useState } from 'react';
import { View, KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';

export type ProjectNewFormValues = {
  name: string;
  address: string | null;
  clientName: string | null;
};

export type ProjectNewProps = {
  isPending: boolean;
  errorMessage: string | null;
  onBack: () => void;
  onSubmit: (values: ProjectNewFormValues) => void;
};

export function ProjectNew({ isPending, errorMessage, onBack, onSubmit }: ProjectNewProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [client, setClient] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

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

  const noticeMessage = validationError ?? errorMessage;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="px-5 py-4">
          <ScreenHeader title="New Project" onBack={onBack} backLabel="Projects" />
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
              testID="input-project-name"
              label="Project Name"
              placeholder="e.g. Highland Tower Complex"
              value={name}
              onChangeText={(v) => {
                setName(v);
                setValidationError(null);
              }}
              editable={!isPending}
            />
            <Input
              testID="input-project-address"
              label="Project Address"
              placeholder="e.g. 2400 Highland Ave, Austin TX"
              value={address}
              onChangeText={setAddress}
              editable={!isPending}
            />
            <Input
              testID="input-client-name"
              label="Client Name"
              placeholder="e.g. Acme Construction Co."
              value={client}
              onChangeText={setClient}
              editable={!isPending}
            />
            {noticeMessage ? (
              <InlineNotice tone="danger">{noticeMessage}</InlineNotice>
            ) : null}
            <Button
              testID="btn-submit-project"
              variant="hero"
              size="xl"
              className="w-full"
              onPress={handleSubmit}
              loading={isPending}
            >
              {isPending ? 'Creating…' : 'Create Project'}
            </Button>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
