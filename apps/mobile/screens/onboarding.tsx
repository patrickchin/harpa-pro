/**
 * Onboarding body component — post-OTP identity collection.
 *
 * Props-only, no API calls. Real route at app/(auth)/onboarding.tsx wires
 * useAuthSession (for prefill + refresh) and useUpdateMeMutation (PATCH /me).
 *
 * Canonical source: ../haru3-reports/apps/mobile/app/onboarding.tsx (full file).
 */
import { View, Text, KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { Logo } from '@/components/primitives/Logo';

export interface OnboardingProps {
  fullName: string;
  companyName: string;
  onChangeFullName: (v: string) => void;
  onChangeCompanyName: (v: string) => void;
  error: string | null;
  isPending: boolean;
  onSubmit: () => void;
}

export default function Onboarding({
  fullName,
  companyName,
  onChangeFullName,
  onChangeCompanyName,
  error,
  isPending,
  onSubmit,
}: OnboardingProps) {
  return (
    <SafeAreaView className="flex-1 bg-background" testID="screen-onboarding">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-sm self-center">
            <View className="flex-row items-center gap-3">
              <Logo />
              <View className="flex-1">
                <Text className="text-display text-foreground">Welcome</Text>
                <Text className="text-body text-muted-foreground">
                  Finish your account details so reports and projects are
                  labeled correctly from day one.
                </Text>
              </View>
            </View>

            <View className="mt-8 gap-4">
              <Input
                label="Full Name"
                placeholder="John Smith"
                value={fullName}
                onChangeText={onChangeFullName}
                autoComplete="name"
                autoCapitalize="words"
                editable={!isPending}
                hint="Use the name teammates will recognize in shared reports."
                autoFocus
                testID="input-onboarding-name"
              />
              <Input
                label="Company Name"
                placeholder="Smith Construction LLC"
                value={companyName}
                onChangeText={onChangeCompanyName}
                autoComplete="organization"
                autoCapitalize="words"
                editable={!isPending}
                hint="This shows on profile and exported report details."
                testID="input-onboarding-company"
              />

              {error && <InlineNotice tone="danger">{error}</InlineNotice>}

              <Button
                variant="hero"
                size="xl"
                className="w-full"
                loading={isPending}
                onPress={onSubmit}
                testID="btn-onboarding-submit"
              >
                {isPending ? 'Saving...' : 'Get Started'}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
