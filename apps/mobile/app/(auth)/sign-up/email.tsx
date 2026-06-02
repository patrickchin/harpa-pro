/**
 * Sign-up email entry — step 1 of the email-OTP sign-up flow.
 *
 * Calls authClient.emailOtp.sendVerificationOtp with type
 * 'email-verification', then navigates to the verify screen.
 * Single async flow per Pitfall 5.
 */
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { Redirect, useRouter } from 'expo-router';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { Button } from '@/components/primitives/Button';
import { BuildBadge } from '@/components/primitives/BuildBadge';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { Logo } from '@/components/primitives/Logo';
import { colors } from '@/lib/design-tokens/colors';
import { useAuthSession } from '@/lib/auth';
import { authClient } from '@/lib/auth/client';

export default function SignUpEmailPage() {
  const router = useRouter();
  const session = useAuthSession();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  if (session.status === 'authenticated') {
    return <Redirect href="/" />;
  }

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const { error: otpError } = await authClient.emailOtp.sendVerificationOtp({
        email: trimmedEmail,
        type: 'email-verification',
      });
      if (otpError) {
        setError(otpError.message ?? 'Unable to send verification code.');
        return;
      }
      router.push({
        pathname: '/(auth)/sign-up/verify',
        params: { email: trimmedEmail },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to send verification code.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="px-5 pt-3">
          <Pressable
            onPress={() => router.back()}
            testID="btn-signup-back"
            accessibilityLabel="Back to Sign In"
            className="flex-row items-center gap-2 py-2"
          >
            <ArrowLeft size={20} color={colors.foreground} />
            <Text className="text-base font-semibold text-foreground">
              Back to Sign In
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="grow px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-sm self-center">
            <View className="flex-row items-center gap-3">
              <Logo />
              <View className="flex-1">
                <Text className="text-display text-foreground">Create Account</Text>
              </View>
            </View>

            <View className="mt-8 gap-4">
              <TextInput
                testID="input-signup-email"
                className="rounded-md border border-border bg-background px-4 py-3 text-base text-foreground"
                placeholder="Email address"
                placeholderTextColor="gray"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                autoFocus
                editable={!isSubmitting}
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={handleSubmit}
                returnKeyType="send"
              />

              {error && <InlineNotice tone="danger">{error}</InlineNotice>}

              <Button
                testID="btn-signup-send-code"
                variant="hero"
                size="xl"
                className="w-full"
                disabled={isSubmitting || !email.trim()}
                loading={isSubmitting}
                onPress={handleSubmit}
              >
                {isSubmitting ? 'Sending Code…' : 'Send Code'}
              </Button>

              <Pressable
                testID="link-go-sign-in"
                accessibilityRole="button"
                className="mt-8 items-center py-2"
                onPress={() => router.push('/(auth)/sign-in/email')}
              >
                <Text className="text-base text-muted-foreground">
                  Already have an account?{' '}
                  <Text className="font-semibold text-foreground underline">
                    Sign In
                  </Text>
                </Text>
              </Pressable>
            </View>

            <BuildBadge testID="sign-up-build-badge" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
