/**
 * Sign-in OTP verification — step 2 of the email-OTP flow.
 *
 * Reads the `email` param forwarded by sign-in/email.tsx, calls
 * authClient.signIn.emailOtp to verify the code, then navigates to
 * the app root. The (app) auth gate handles needs-onboarding vs
 * authenticated routing automatically via status propagation.
 *
 * Single async flow per Pitfall 5: verify → router.replace('/').
 */
import { useCallback, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';

import AuthVerify from '@/screens/auth-verify';
import { useAuthSession } from '@/lib/auth';
import { authClient } from '@/lib/auth/client';
import { useEmailResend } from '@/lib/auth/use-email-resend';
import { safeBack } from '@/lib/nav/safe-back';

export default function SignInVerifyPage() {
  const router = useRouter();
  const session = useAuthSession();
  const params = useLocalSearchParams<{ email: string }>();
  const email = params.email ?? '';

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const resend = useEmailResend({ email, type: 'sign-in', isSubmitting });

  if (session.status === 'authenticated') {
    return <Redirect href="/" />;
  }

  if (!email) {
    return <Redirect href={'/(auth)/sign-in/email' as Href} />;
  }

  const handleSubmit = async () => {
    setError(null);
    resend.clearMessages();
    setSubmitting(true);

    try {
      const { error: verifyError } = await authClient.signIn.emailOtp({
        email,
        otp: otp.trim(),
      });
      if (verifyError) {
        setError(verifyError.message ?? 'Unable to verify your code.');
        return;
      }
      router.replace('/');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to verify your code.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeEmail = useCallback(() => {
    safeBack(router, '/(auth)/sign-in/email' as Href);
  }, [router]);

  return (
    <AuthVerify
      mode="signin"
      email={email}
      otp={otp}
      onChangeOtp={setOtp}
      onChangeEmail={handleChangeEmail}
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
