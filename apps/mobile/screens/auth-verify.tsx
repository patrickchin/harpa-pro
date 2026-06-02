/**
 * OTP verify screen — step 2 of the OTP flow. Mode-parameterised for
 * the same reasons as auth-phone.tsx: sign-in and sign-up only differ
 * in title, test IDs, the back button, and minor button props.
 */
import {
  View,
  Text,
  KeyboardAvoidingView,
  ScrollView,
  Pressable,
} from 'react-native';
import { ArrowLeft } from 'lucide-react-native';

import { SafeAreaView } from '../components/primitives/SafeAreaView';
import { Button } from '../components/primitives/Button';
import { Input } from '../components/primitives/Input';
import { InlineNotice } from '../components/primitives/InlineNotice';
import { Logo } from '../components/primitives/Logo';
import { colors } from '../lib/design-tokens/colors';
import { cn } from '../lib/util/utils';

type Props = {
  mode: 'signin' | 'signup';
  email: string;
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

const SIGNIN_IDS = {
  input: 'input-otp',
  submit: 'btn-verify-code',
  changeNumber: 'btn-change-number',
  resend: 'link-resend-code',
} as const;

const SIGNUP_IDS = {
  input: 'input-signup-otp',
  submit: 'btn-signup-verify',
  changeNumber: 'btn-signup-change-number',
  resend: 'link-signup-resend-code',
  back: 'btn-signup-verify-back',
} as const;

export default function AuthVerify({
  mode,
  email,
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
  const isSignup = mode === 'signup';
  const title = isSignup ? 'Create Account' : 'Harpa Pro';
  const ids = isSignup ? SIGNUP_IDS : SIGNIN_IDS;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        {isSignup && (
          <View className="px-5 pt-3">
            <Pressable
              onPress={onChangeEmail}
              testID={SIGNUP_IDS.back}
              accessibilityLabel="Back"
              className="flex-row items-center gap-2 py-2"
            >
              <ArrowLeft size={20} color={colors.foreground} />
              <Text className="text-base font-semibold text-foreground">
                Back
              </Text>
            </Pressable>
          </View>
        )}

        <ScrollView
          className="flex-1"
          contentContainerClassName="grow px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-sm self-center">
            <View className="flex-row items-center gap-3">
              <Logo />
              <View className="flex-1">
                <Text className="text-display text-foreground">{title}</Text>
              </View>
            </View>

            <View className="mt-8 gap-4">
              <View>
                <Text className="text-sm text-muted-foreground">
                  Code sent to {email}
                </Text>
              </View>

              <Input
                testID={ids.input}
                label="Verification Code"
                placeholder="123456"
                value={otp}
                onChangeText={onChangeOtp}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={6}
                editable={!isSubmitting}
                autoFocus={isSignup}
              />

              {error && <InlineNotice tone="danger">{error}</InlineNotice>}
              {info && <InlineNotice tone="info">{info}</InlineNotice>}

              <View className="gap-3">
                <Button
                  testID={ids.submit}
                  variant="hero"
                  size="xl"
                  className="w-full"
                  disabled={isSubmitting || otp.trim().length < 6}
                  loading={isSignup ? isSubmitting : undefined}
                  onPress={onSubmit}
                >
                  {isSubmitting ? 'Verifying…' : isSignup ? 'Verify' : 'Verify Code'}
                </Button>

                <Button
                  testID={ids.changeNumber}
                  variant="outline"
                  size="xl"
                  className="w-full"
                  onPress={onChangeEmail}
                  disabled={isSubmitting}
                >
                  Change Email
                </Button>
              </View>

              <Pressable
                testID={ids.resend}
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
                      resendDisabled ? 'text-muted-foreground' : 'text-foreground'
                    )}
                  >
                    {resendCountdownSeconds != null
                      ? `Resend in ${resendCountdownSeconds}s`
                      : 'Resend Code'}
                  </Text>
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
