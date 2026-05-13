/**
 * Sign-up phone entry — step 1 of sign-up OTP flow.
 *
 * Wires data layer for the screens/sign-up-phone.tsx body component:
 *   - useStartOtpMutation (POST /auth/otp/start)
 *   - router.push to verify screen on success
 *
 * Single async flow per Pitfall 5: mutateAsync then router.push. No setTimeout.
 *
 * Deliberate v4 simplification: canonical signup.tsx has 3 steps
 * (identity / phone / verify) but v4 drops identity. User provides
 * displayName + companyName via the onboarding screen post-OTP,
 * which is gated by the auth session's `needs-onboarding` status.
 */
import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import SignUpPhone from '@/screens/sign-up-phone';
import { useStartOtpMutation } from '@/lib/api/hooks';
import {
  isValidPhoneNumber,
  normalizePhoneNumber,
  INVALID_PHONE_NUMBER_MESSAGE,
} from '@/lib/phone';

export default function SignUpPhonePage() {
  const router = useRouter();
  const startOtpMutation = useStartOtpMutation();

  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const normalizedPhone = normalizePhoneNumber(phone);

  const handleSubmit = async () => {
    if (!isValidPhoneNumber(normalizedPhone)) {
      setError(INVALID_PHONE_NUMBER_MESSAGE);
      return;
    }

    setError(null);

    try {
      await startOtpMutation.mutateAsync({ body: { phone: normalizedPhone } });
      // expo-router typed-routes regenerates on next `expo start`; cast safe.
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

  const handleGoToSignIn = () => {
    router.replace('/(auth)/sign-in/phone' as Href);
  };

  return (
    <SignUpPhone
      phone={phone}
      onChangePhone={setPhone}
      onBack={handleBack}
      onGoToSignIn={handleGoToSignIn}
      error={error}
      isSubmitting={startOtpMutation.isPending}
      onSubmit={handleSubmit}
    />
  );
}
