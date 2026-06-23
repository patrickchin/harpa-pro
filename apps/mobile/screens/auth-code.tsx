/**
 * Email-OTP verification screen — step 2 of the email-OTP flow.
 * Replaces the old phone-OTP verify screen.
 */
import {
  View,
  Text,
  KeyboardAvoidingView,
  ScrollView,
  Pressable,
} from 'react-native';

import { SafeAreaView } from '../components/primitives/SafeAreaView';
import { Button } from '../components/primitives/Button';
import { Input } from '../components/primitives/Input';
import { InlineNotice } from '../components/primitives/InlineNotice';
import { Logo } from '../components/primitives/Logo';
import { cn } from '../lib/util/utils';

type Props = {
  email: string;
  mode?: 'otp' | 'password';
  otp: string;
  onChangeOtp: (v: string) => void;
  onChangeEmail: () => void;
  onResend: () => void;
  resendDisabled: boolean;
  resendCountdownSeconds: number | null;
  error: string | null;
  info: string | null;
  isSubmitting: boolean;
  onSubmit: () => void;
};

export default function AuthCode({
  email,
  mode = 'otp',
  otp,
  onChangeOtp,
  onChangeEmail,
  onResend,
  resendDisabled,
  resendCountdownSeconds,
  error,
  info,
  isSubmitting,
  onSubmit,
}: Props) {
  const isPasswordMode = mode === 'password';
  const canSubmit = isPasswordMode ? otp.trim().length > 0 : otp.trim().length >= 6;

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
              <View>
                <Text className="text-sm text-muted-foreground">
                  {isPasswordMode ? `Sign in as ${email}` : `Code sent to ${email}`}
                </Text>
              </View>

              <Input
                testID="input-otp"
                label={isPasswordMode ? 'Password' : 'Verification Code'}
                placeholder={isPasswordMode ? 'Password' : '123456'}
                value={otp}
                onChangeText={onChangeOtp}
                keyboardType={isPasswordMode ? 'default' : 'number-pad'}
                autoComplete={isPasswordMode ? undefined : 'one-time-code'}
                textContentType={isPasswordMode ? 'password' : 'oneTimeCode'}
                secureTextEntry={isPasswordMode}
                maxLength={isPasswordMode ? undefined : 6}
                editable={!isSubmitting}
              />

              {error && <InlineNotice tone="danger">{error}</InlineNotice>}
              {info && <InlineNotice tone="info">{info}</InlineNotice>}

              <View className="gap-3">
                <Button
                  testID="btn-verify-code"
                  variant="hero"
                  size="xl"
                  className="w-full"
                  disabled={isSubmitting || !canSubmit}
                  onPress={onSubmit}
                >
                  {isSubmitting
                    ? (isPasswordMode ? 'Signing in…' : 'Verifying…')
                    : (isPasswordMode ? 'Sign In' : 'Verify Code')}
                </Button>

                <Button
                  testID="btn-change-email"
                  variant="outline"
                  size="xl"
                  className="w-full"
                  onPress={onChangeEmail}
                  disabled={isSubmitting}
                >
                  Change Email
                </Button>
              </View>

              {!isPasswordMode && (
                <Pressable
                  testID="link-resend-code"
                  accessibilityRole="button"
                  className="items-center py-2"
                  disabled={resendDisabled}
                  onPress={onResend}
                >
                  <Text className="text-sm text-muted-foreground">
                    Didn't get the code?{' '}
                    <Text
                      className={cn(
                        'font-semibold underline',
                        resendDisabled ? 'text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      {resendCountdownSeconds != null
                        ? `Resend in ${resendCountdownSeconds}s`
                        : 'Resend Code'}
                    </Text>
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
