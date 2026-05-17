import { View, Text, KeyboardAvoidingView, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from '../components/primitives/SafeAreaView';
import { Button } from '../components/primitives/Button';
import { Input } from '../components/primitives/Input';
import { InlineNotice } from '../components/primitives/InlineNotice';
import { Logo } from '../components/primitives/Logo';

type Props = {
  phone: string;
  onChangePhone: (v: string) => void;
  rememberedPhone: string | null;
  onUseDifferentNumber: () => void;
  hint: string;
  error: string | null;
  info: string | null;
  isSubmitting: boolean;
  onSubmit: () => void;
};

export default function SignInPhone({
  phone,
  onChangePhone,
  rememberedPhone,
  onUseDifferentNumber,
  hint,
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
                testID="input-phone"
                label="Phone Number"
                placeholder="+15550000000"
                value={phone}
                onChangeText={onChangePhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                editable={!isSubmitting}
                hint={hint}
              />

              {rememberedPhone && (
                <Pressable
                  testID="use-different-number"
                  accessibilityRole="button"
                  className="py-1"
                  disabled={isSubmitting}
                  onPress={onUseDifferentNumber}
                >
                  <Text className="text-sm text-muted-foreground">
                    Not you?{' '}
                    <Text className="font-semibold text-foreground underline">
                      Use a different number
                    </Text>
                  </Text>
                </Pressable>
              )}

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
                {isSubmitting ? 'Sending Code...' : 'Send Code'}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
