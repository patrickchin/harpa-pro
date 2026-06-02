/**
 * Email-entry screen — step 1 of the email-OTP flow. Replaces the old
 * phone + country-picker screen.
 *
 * Sign-up is gone with better-auth: a successful OTP verify on a new
 * email creates the user automatically. So this is single-mode (the
 * user only ever sees the sign-in entry point) but we keep the file
 * symmetric with `auth-code.tsx`.
 */
import {
  View,
  Text,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';

import { SafeAreaView } from '../components/primitives/SafeAreaView';
import { Button } from '../components/primitives/Button';
import { BuildBadge } from '../components/primitives/BuildBadge';
import { InlineNotice } from '../components/primitives/InlineNotice';
import { Input } from '../components/primitives/Input';
import { Logo } from '../components/primitives/Logo';

type Props = {
  email: string;
  onChangeEmail: (email: string) => void;
  error: string | null;
  info: string | null;
  isSubmitting: boolean;
  onSubmit: () => void;
};

export default function AuthEmail({
  email,
  onChangeEmail,
  error,
  info,
  isSubmitting,
  onSubmit,
}: Props) {
  return (
    <SafeAreaView className="flex-1 bg-background">
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
                <Text className="text-display text-foreground">Harpa Pro</Text>
              </View>
            </View>

            <View className="mt-8 gap-4">
              <Input
                testID="input-email"
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={onChangeEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                editable={!isSubmitting}
              />

              {error && <InlineNotice tone="danger">{error}</InlineNotice>}
              {info && <InlineNotice tone="info">{info}</InlineNotice>}

              <Button
                testID="btn-login-send-code"
                variant="hero"
                size="xl"
                className="w-full"
                disabled={isSubmitting}
                onPress={onSubmit}
              >
                {isSubmitting ? 'Sending Code…' : 'Send Code'}
              </Button>
            </View>

            <BuildBadge testID="sign-in-build-badge" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
