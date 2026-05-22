/**
 * Phone-entry screen — step 1 of the OTP flow. Mode-parameterised
 * because the sign-in and sign-up variants are 95% identical (Logo +
 * PhoneNumberInput + Send Code button) and differed only in title,
 * test IDs, the back button, and the "Already have an account?"
 * link.
 *
 * Maestro flows depend on the variant-specific test IDs; the
 * `mode` prop selects the right set so the contract documented in
 * .maestro/README.md stays intact.
 */
import {
  View,
  Text,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
} from 'react-native';
import { ArrowLeft } from 'lucide-react-native';

import { SafeAreaView } from '../components/primitives/SafeAreaView';
import { Button } from '../components/primitives/Button';
import { BuildBadge } from '../components/primitives/BuildBadge';
import { InlineNotice } from '../components/primitives/InlineNotice';
import { Logo } from '../components/primitives/Logo';
import { PhoneNumberInput } from '../components/primitives/PhoneNumberInput';
import { colors } from '../lib/design-tokens/colors';
import { type Country } from '../lib/countries';

type SignInExtras = {
  mode: 'signin';
  onClear: () => void;
  info: string | null;
};

type SignUpExtras = {
  mode: 'signup';
  onBack: () => void;
  onGoToSignIn: () => void;
};

type Props = (SignInExtras | SignUpExtras) & {
  country: Country;
  national: string;
  onChangeCountry: (country: Country) => void;
  onChangeNational: (national: string) => void;
  error: string | null;
  isSubmitting: boolean;
  onSubmit: () => void;
};

const SIGNIN_IDS = {
  input: 'input-phone',
  countryButton: 'btn-country-picker',
  submit: 'btn-login-send-code',
  buildBadge: 'sign-in-build-badge',
} as const;

const SIGNUP_IDS = {
  input: 'input-signup-phone',
  countryButton: 'btn-signup-country-picker',
  submit: 'btn-signup-send-code',
  buildBadge: 'sign-up-build-badge',
  back: 'btn-signup-back',
  goToSignIn: 'link-go-sign-in',
} as const;

export default function AuthPhone(props: Props) {
  const { country, national, onChangeCountry, onChangeNational, error, isSubmitting, onSubmit } = props;
  const isSignup = props.mode === 'signup';
  const title = isSignup ? 'Create Account' : 'Harpa Pro';
  const ids = isSignup ? SIGNUP_IDS : SIGNIN_IDS;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        {props.mode === 'signup' && (
          <View className="px-5 pt-3">
            <Pressable
              onPress={props.onBack}
              testID={SIGNUP_IDS.back}
              accessibilityLabel="Back to Sign In"
              className="flex-row items-center gap-2 py-2"
            >
              <ArrowLeft size={20} color={colors.foreground} />
              <Text className="text-base font-semibold text-foreground">
                Back to Sign In
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
              <PhoneNumberInput
                testID={ids.input}
                countryButtonTestID={ids.countryButton}
                country={country}
                national={national}
                onChangeCountry={onChangeCountry}
                onChangeNational={onChangeNational}
                onClear={props.mode === 'signin' ? props.onClear : undefined}
                editable={!isSubmitting}
                autoFocus={isSignup}
              />

              {error && <InlineNotice tone="danger">{error}</InlineNotice>}
              {props.mode === 'signin' && props.info && (
                <InlineNotice tone="info">{props.info}</InlineNotice>
              )}

              <Button
                testID={ids.submit}
                variant="hero"
                size="xl"
                className="w-full"
                disabled={isSubmitting}
                loading={isSignup ? isSubmitting : undefined}
                onPress={onSubmit}
              >
                {isSubmitting ? 'Sending Code…' : 'Send Code'}
              </Button>

              {props.mode === 'signup' && (
                <Pressable
                  testID={SIGNUP_IDS.goToSignIn}
                  accessibilityRole="button"
                  className="mt-8 items-center py-2"
                  onPress={props.onGoToSignIn}
                >
                  <Text className="text-base text-muted-foreground">
                    Already have an account?{' '}
                    <Text className="font-semibold text-foreground underline">
                      Sign In
                    </Text>
                  </Text>
                </Pressable>
              )}
            </View>

            <BuildBadge testID={ids.buildBadge} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
