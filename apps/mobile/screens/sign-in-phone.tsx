import { View, Text, KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaView } from '../components/primitives/SafeAreaView';
import { Button } from '../components/primitives/Button';
import { BuildBadge } from '../components/primitives/BuildBadge';
import { InlineNotice } from '../components/primitives/InlineNotice';
import { Logo } from '../components/primitives/Logo';
import { PhoneNumberInput } from '../components/primitives/PhoneNumberInput';
import { type Country } from '../lib/countries';

type Props = {
  country: Country;
  national: string;
  onChangeCountry: (country: Country) => void;
  onChangeNational: (national: string) => void;
  onClear: () => void;
  error: string | null;
  info: string | null;
  isSubmitting: boolean;
  onSubmit: () => void;
};

export default function SignInPhone({
  country,
  national,
  onChangeCountry,
  onChangeNational,
  onClear,
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
              <PhoneNumberInput
                testID="input-phone"
                countryButtonTestID="btn-country-picker"
                country={country}
                national={national}
                onChangeCountry={onChangeCountry}
                onChangeNational={onChangeNational}
                onClear={onClear}
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
                {isSubmitting ? 'Sending Code...' : 'Send Code'}
              </Button>
            </View>

            <BuildBadge testID="sign-in-build-badge" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
