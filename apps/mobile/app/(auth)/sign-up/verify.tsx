/**
 * Sign-up OTP verification — step 2 of sign-up OTP flow.
 *
 * Wires data layer for the screens/sign-up-verify.tsx body component:
 *   - useLocalSearchParams to read the phone passed from sign-up/phone
 *   - useVerifyOtpMutation (POST /auth/otp/verify)
 *   - useStartOtpMutation for resend
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
import { useCallback, useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import SignUpVerify from '@/screens/sign-up-verify';
import { useAuthSession } from '@/lib/auth';
import { useVerifyOtpMutation, useStartOtpMutation } from '@/lib/api/hooks';

const RESEND_COOLDOWN_SECONDS = 30;

export default function SignUpVerifyPage() {
  const router = useRouter();
  const session = useAuthSession();
  const params = useLocalSearchParams<{ phone: string }>();
  const phone = params.phone ?? '';

  const verifyOtpMutation = useVerifyOtpMutation();
  const startOtpMutation = useStartOtpMutation();

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number | null>(null);

  // Redirect if already authenticated
  if (session.status === 'authenticated') {
    return <Redirect href="/" />;
  }

  // Fallback if phone is missing
  if (!phone) {
    // expo-router typed-routes regenerates on next `expo start`; cast safe.
    return <Redirect href={'/(auth)/sign-up/phone' as Href} />;
  }

  // Resend cooldown timer (UI-only, per Pitfall 5)
  useEffect(() => {
    if (cooldown === null || cooldown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev === null || prev <= 1) {
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [cooldown]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setInfo(null);

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
  }, [verifyOtpMutation, session, phone, otp, router]);

  const handleResend = useCallback(async () => {
    setError(null);
    setInfo(null);

    try {
      await startOtpMutation.mutateAsync({ body: { phone } });
      setInfo('New code sent successfully.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to resend code.';
      setError(message);
    }
  }, [startOtpMutation, phone]);

  const handleChangeNumber = useCallback(() => {
    // expo-router typed-routes regenerates on next `expo start`; cast safe.
    router.replace({ pathname: '/(auth)/sign-up/phone' });
  }, [router]);

  const isSubmitting =
    verifyOtpMutation.isPending || session.status === 'loading';
  const resendDisabled = startOtpMutation.isPending || isSubmitting || cooldown !== null;

  return (
    <SignUpVerify
      phone={phone}
      otp={otp}
      onChangeOtp={setOtp}
      onChangeNumber={handleChangeNumber}
      onResend={handleResend}
      resendDisabled={resendDisabled}
      resendCountdownSeconds={cooldown}
      error={error}
      info={info}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    />
  );
}
