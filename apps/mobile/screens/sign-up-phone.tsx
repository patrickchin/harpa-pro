import { View, Text, KeyboardAvoidingView, Pressable, ScrollView } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { SafeAreaView } from '../components/primitives/SafeAreaView';
import { Button } from '../components/primitives/Button';
import { Input } from '../components/primitives/Input';
import { InlineNotice } from '../components/primitives/InlineNotice';
import { Logo } from '../components/primitives/Logo';
import { colors } from '../lib/design-tokens/colors';

type Props = {
  phone: string;
  onChangePhone: (v: string) => void;
  onBack: () => void;
  onGoToSignIn: () => void;
  error: string | null;
  isSubmitting: boolean;
  onSubmit: () => void;
};

export default function SignUpPhone({
  phone,
  onChangePhone,
  onBack,
  onGoToSignIn,
  error,
  isSubmitting,
  onSubmit,
}: Props) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="px-5 pt-3">
          <Pressable
            onPress={onBack}
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
              <Input
                testID="input-signup-phone"
                label="Phone Number"
                placeholder="+15550000000"
                value={phone}
                onChangeText={onChangePhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                editable={!isSubmitting}
                autoFocus
              />

              {error && <InlineNotice tone="danger">{error}</InlineNotice>}

              <Button
                testID="btn-signup-send-code"
                variant="hero"
                size="xl"
                className="w-full"
                loading={isSubmitting}
                onPress={onSubmit}
              >
                {isSubmitting ? 'Sending Code…' : 'Send Code'}
              </Button>

              <Pressable
                testID="link-go-sign-in"
                accessibilityRole="button"
                className="mt-8 items-center py-2"
                onPress={onGoToSignIn}
              >
                <Text className="text-base text-muted-foreground">
                  Already have an account?{' '}
                  <Text className="font-semibold text-foreground underline">
                    Sign In
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
