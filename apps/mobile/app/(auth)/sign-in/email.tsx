/**
 * Sign-in email entry — step 1 of the email-OTP flow.
 *
 * Wires `screens/auth-email.tsx` to better-auth:
 *   1. Validate the email locally (basic shape).
 *   2. `authClient.emailOtp.sendVerificationOtp({email, type:'sign-in'})`.
 *   3. `router.push('/sign-in/code', { email })` on success.
 *
 * Single async flow per Pitfall 5 — no setTimeouts, no progress
 * juggling.
 */
import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import AuthEmail from '@/screens/auth-email';
import { useAuthSession } from '@/lib/auth';
import { authClient } from '@/lib/auth/client';
import { isAppReviewEmail } from '@/lib/auth/app-review';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInEmailPage() {
  const router = useRouter();
  const session = useAuthSession();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  if (session.status === 'authenticated') {
    return <Redirect href="/" />;
  }

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (isAppReviewEmail(trimmed)) {
        router.push({
          pathname: '/(auth)/sign-in/code',
          params: { email: trimmed },
        });
        return;
      }
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
        email: trimmed,
        type: 'sign-in',
      });
      if (sendError) {
        throw new Error(sendError.message ?? 'Unable to send verification code.');
      }
      router.push({
        pathname: '/(auth)/sign-in/code',
        params: { email: trimmed },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to send verification code.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthEmail
      email={email}
      onChangeEmail={setEmail}
      error={error}
      info={info}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    />
  );
}
