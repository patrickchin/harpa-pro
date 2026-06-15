/**
 * Sign-in email-OTP verification — step 2 of the email-OTP flow.
 *
 * Wires `screens/auth-code.tsx` to better-auth:
 *   1. `authClient.signIn.emailOtp({email, otp})` — better-auth's expoClient
 *      persists the cookie on success.
 *   2. `session.refresh()` so `useSession()` picks up the new user.
 *   3. `router.replace('/')` — the (app) auth gate then routes the
 *      user to onboarding / projects depending on the user shape.
 *
 * Resend uses the same `sendVerificationOtp` call. We keep a 30s
 * countdown locally to discourage hammering the email provider.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import AuthCode from '@/screens/auth-code';
import { useAuthSession } from '@/lib/auth';
import { authClient } from '@/lib/auth/client';
import { safeBack } from '@/lib/nav/safe-back';

const RESEND_COOLDOWN_SECONDS = 30;

export default function SignInCodePage() {
  const router = useRouter();
  const session = useAuthSession();
  const params = useLocalSearchParams<{ email: string }>();
  const email = (params.email ?? '').toLowerCase();

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resendInfo, setResendInfo] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [isResending, setResending] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startCountdown = useCallback(() => {
    setCountdown(RESEND_COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev == null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  if (session.status === 'authenticated') {
    return <Redirect href="/" />;
  }

  if (!email) {
    return <Redirect href={'/(auth)/sign-in/email' as Href} />;
  }

  const handleSubmit = async () => {
    setError(null);
    setResendInfo(null);
    setResendError(null);
    setSubmitting(true);
    try {
      const { error: verifyError } = await authClient.signIn.emailOtp({
        email,
        otp: otp.trim(),
      });
      if (verifyError) {
        throw new Error(verifyError.message ?? 'Unable to verify your code.');
      }
      // expoClient has now persisted the cookie. Refresh useSession()
      // so the auth gate can route us correctly.
      await session.refresh();
      router.replace('/');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to verify your code.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (isResending || (countdown != null && countdown > 0)) return;
    setResendError(null);
    setResendInfo(null);
    setResending(true);
    try {
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'sign-in',
      });
      if (sendError) {
        throw new Error(sendError.message ?? 'Unable to resend code.');
      }
      setResendInfo('Code resent.');
      startCountdown();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to resend code.';
      setResendError(message);
    } finally {
      setResending(false);
    }
  };

  const handleChangeEmail = useCallback(() => {
    safeBack(router, '/(auth)/sign-in/email' as Href);
  }, [router]);

  const resendDisabled = isResending || (countdown != null && countdown > 0);

  return (
    <AuthCode
      email={email}
      otp={otp}
      onChangeOtp={setOtp}
      onChangeEmail={handleChangeEmail}
      onResend={handleResend}
      resendDisabled={resendDisabled}
      resendCountdownSeconds={countdown}
      error={error ?? resendError}
      info={resendInfo}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    />
  );
}
