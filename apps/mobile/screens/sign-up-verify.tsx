import { View, Text, KeyboardAvoidingView, ScrollView, Pressable } from 'react-native';
import { HardHat, ArrowLeft } from 'lucide-react-native';
import { SafeAreaView } from '../components/primitives/SafeAreaView';
import { Button } from '../components/primitives/Button';
import { Input } from '../components/primitives/Input';
import { InlineNotice } from '../components/primitives/InlineNotice';
import { colors } from '../lib/design-tokens/colors';
import { cn } from '../lib/utils';

type Props = {
  phone: string;
  otp: string;
  onChangeOtp: (v: string) => void;
  onChangeNumber: () => void;
  onResend: () => void;
  resendDisabled: boolean;
  resendCountdownSeconds: number | null;
  error: string | null;
  info: string | null;
  isSubmitting: boolean;
  onSubmit: () => void;
};

export default function SignUpVerify({
  phone,
  otp,
  onChangeOtp,
  onChangeNumber,
  onResend,
  resendDisabled,
  resendCountdownSeconds,
  error,
  info,
  isSubmitting,
  onSubmit,
}: Props) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="px-5 pt-3">
          <Pressable
            onPress={onChangeNumber}
            testID="btn-signup-verify-back"
            accessibilityLabel="Back"
            className="flex-row items-center gap-2 py-2"
          >
            <ArrowLeft size={20} color={colors.foreground} />
            <Text className="text-base font-semibold text-foreground">
              Back
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
              <View className="h-12 w-12 items-center justify-center rounded-lg bg-primary">
                <HardHat size={24} color={colors.primary.foreground} />
              </View>
              <View className="flex-1">
                <Text className="text-display text-foreground">Create Account</Text>
              </View>
            </View>

            <View className="mt-8 gap-4">
              <View>
                <Text className="text-sm text-muted-foreground">
                  Code sent to {phone}
                </Text>
              </View>

              <Input
                testID="input-signup-otp"
                label="Verification Code"
                placeholder="123456"
                value={otp}
                onChangeText={onChangeOtp}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={6}
                editable={!isSubmitting}
                autoFocus
              />

              {error && <InlineNotice tone="danger">{error}</InlineNotice>}
              {info && <InlineNotice tone="info">{info}</InlineNotice>}

              <View className="gap-3">
                <Button
                  testID="btn-signup-verify"
                  variant="hero"
                  size="xl"
                  className="w-full"
                  disabled={isSubmitting || otp.trim().length < 6}
                  loading={isSubmitting}
                  onPress={onSubmit}
                >
                  {isSubmitting ? 'Verifying…' : 'Verify'}
                </Button>

                <Button
                  testID="btn-signup-change-number"
                  variant="outline"
                  size="xl"
                  className="w-full"
                  loading={false}
                  onPress={onChangeNumber}
                  disabled={isSubmitting}
                >
                  Change Number
                </Button>
              </View>

              <Pressable
                testID="link-signup-resend-code"
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
