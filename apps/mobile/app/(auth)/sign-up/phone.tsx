/**
 * Sign-up phone entry — step 1 of sign-up OTP flow.
 *
 * Wires the data layer for the screens/auth-phone.tsx body component
 * in 'signup' mode:
 *   - useStartOtpMutation (POST /auth/otp/start)
 *   - router.push to verify screen on success
 *
 * Phone entry uses a country prefix picker (PhoneNumberInput +
 * CountryPickerModal). Country defaults to device locale via
 * getInitialPhoneState. Canonical E.164 is computed on submit.
 *
 * Single async flow per Pitfall 5: mutateAsync then router.push. No setTimeout.
 *
 * Deliberate v4 simplification: canonical signup.tsx has 3 steps
 * (identity / phone / verify) but v4 drops identity. User provides
 * displayName + companyName via the onboarding screen post-OTP,
 * which is gated by the auth session's `needs-onboarding` status.
 */
import { useMemo, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import AuthPhone from '@/screens/auth-phone';
import { useStartOtpMutation } from '@/lib/api/hooks';
import {
  combineCountryAndNational,
  getInitialPhoneState,
  isValidPhoneNumber,
  INVALID_PHONE_NUMBER_MESSAGE,
} from '@/lib/phone/phone';
import { type Country } from '@/lib/phone/countries';

export default function SignUpPhonePage() {
  const router = useRouter();
  const startOtpMutation = useStartOtpMutation();

  const initial = useMemo(() => getInitialPhoneState(null), []);
  const [country, setCountry] = useState<Country>(initial.country);
  const [national, setNational] = useState<string>(initial.national);
  const [error, setError] = useState<string | null>(null);

  const normalizedPhone = combineCountryAndNational(country, national);

  const handleSubmit = async () => {
    if (!isValidPhoneNumber(normalizedPhone)) {
      setError(INVALID_PHONE_NUMBER_MESSAGE);
      return;
    }

    setError(null);

    try {
      await startOtpMutation.mutateAsync({ body: { phone: normalizedPhone } });
      router.push({
        pathname: '/(auth)/sign-up/verify',
        params: { phone: normalizedPhone },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to send verification code.';
      setError(message);
    }
  };

  const handleBack = () => {
    router.replace('/(auth)/sign-in/phone' as Href);
  };

  return (
    <AuthPhone
      mode="signup"
      country={country}
      national={national}
      onChangeCountry={setCountry}
      onChangeNational={setNational}
      onBack={handleBack}
      onGoToSignIn={handleBack}
      error={error}
      isSubmitting={startOtpMutation.isPending}
      onSubmit={handleSubmit}
    />
  );
}
