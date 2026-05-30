/**
 * Sign-up OTP verification — step 2 of sign-up OTP flow.
 *
 * Wires the data layer for the screens/auth-verify.tsx body component
 * in 'signup' mode:
 *   - useLocalSearchParams to read the phone passed from sign-up/phone
 *   - useVerifyOtpMutation (POST /auth/otp/verify)
 *   - useOtpResend (cooldown timer + POST /auth/otp/start for resend)
 *   - useAuthSession — only its signIn(...) method to persist the result
 *   - router.replace('/') after successful verification
 *
 * Single async flow per Pitfall 5: mutateAsync then session.signIn then
 * router.replace. The (app) auth gate (P2.6) handles needs-onboarding vs
 * authenticated routing.
 *
 * Deliberate v4 simplification: identity (fullName/companyName) is NOT
 * passed through the OTP flow. The auth session's needs-onboarding status
 * (deriveStatus checks displayName == null) routes the user to onboarding
 * via the (app) auth gate (P2.6).
 */
import { useCallback, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import AuthVerify from '@/screens/auth-verify';
import { useAuthSession } from '@/lib/auth';
import { useVerifyOtpMutation } from '@/lib/api/hooks';
import { safeBack } from '@/lib/nav/safe-back';
import { useOtpResend } from '@/lib/auth/use-otp-resend';

export default function SignUpVerifyPage() {
  const router = useRouter();
  const session = useAuthSession();
  const params = useLocalSearchParams<{ phone: string }>();
  const phone = params.phone ?? '';

  const verifyOtpMutation = useVerifyOtpMutation();

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isSubmitting =
    verifyOtpMutation.isPending || session.status === 'loading';

  const resend = useOtpResend({ phone, isSubmitting });

  // Redirect if already authenticated
  if (session.status === 'authenticated') {
    return <Redirect href="/" />;
  }

  // Fallback if phone is missing
  if (!phone) {
    return <Redirect href={'/(auth)/sign-up/phone' as Href} />;
  }

  const handleSubmit = async () => {
    setError(null);
    resend.clearMessages();

    try {
      const result = await verifyOtpMutation.mutateAsync({
        body: { phone, code: otp.trim() },
      });

      await session.signIn({
        token: result.token,
        user: result.user,
        phone,
      });

      router.replace('/' as Href);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to verify your code.';
      setError(message);
    }
  };

  const handleChangeNumber = useCallback(() => {
    safeBack(router, '/(auth)/sign-up/phone' as Href);
  }, [router]);

  return (
    <AuthVerify
      mode="signup"
      phone={phone}
      otp={otp}
      onChangeOtp={setOtp}
      onChangeNumber={handleChangeNumber}
      onResend={resend.resend}
      resendDisabled={resend.resendDisabled}
      resendCountdownSeconds={resend.resendCountdownSeconds}
      error={error ?? resend.resendError}
      info={resend.resendInfo}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    />
  );
}
