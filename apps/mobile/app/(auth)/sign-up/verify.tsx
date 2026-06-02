/**
 * Sign-up OTP verification — step 2 of the email-OTP sign-up flow.
 *
 * Reads the `email` param forwarded by sign-up/email.tsx, calls
 * authClient.signIn.emailOtp to verify the code, then navigates to
 * the app root. The (app) auth gate routes to onboarding when
 * displayName/companyName are missing (needs-onboarding status).
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

export default function SignUpVerifyPage() {
  const router = useRouter();
  const session = useAuthSession();
  const params = useLocalSearchParams<{ email: string }>();
  const email = params.email ?? '';

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const resend = useEmailResend({ email, type: 'email-verification', isSubmitting });

  if (session.status === 'authenticated') {
    return <Redirect href="/" />;
  }

  if (!email) {
    return <Redirect href={'/(auth)/sign-up/email' as Href} />;
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
      router.replace('/' as Href);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to verify your code.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeEmail = useCallback(() => {
    safeBack(router, '/(auth)/sign-up/email' as Href);
  }, [router]);

  return (
    <AuthVerify
      mode="signup"
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
