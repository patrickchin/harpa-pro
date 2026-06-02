/**
 * useEmailResend — cooldown timer + OTP resend via better-auth for
 * the sign-in and sign-up verify route pages.
 *
 * Replaces useOtpResend (phone-based) with the same public interface
 * so the verify pages stay thin. The cooldown only starts after a
 * successful resend, never on mount (Pitfall 5).
 */
import { useCallback, useEffect, useState } from 'react';
import { authClient } from './client';

export const RESEND_COOLDOWN_SECONDS = 30;

export interface UseEmailResendInput {
  email: string;
  type: 'sign-in' | 'email-verification';
  isSubmitting: boolean;
}

export interface UseEmailResendResult {
  resend: () => Promise<void>;
  resendDisabled: boolean;
  resendCountdownSeconds: number | null;
  resendError: string | null;
  resendInfo: string | null;
  clearMessages: () => void;
}

export function useEmailResend({
  email,
  type,
  isSubmitting,
}: UseEmailResendInput): UseEmailResendResult {
  const [isSending, setIsSending] = useState(false);
  const [cooldown, setCooldown] = useState<number | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendInfo, setResendInfo] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown === null || cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev === null || prev <= 1) return null;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  const resend = useCallback(async () => {
    setResendError(null);
    setResendInfo(null);
    setIsSending(true);

    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type,
      });
      if (error) {
        setResendError(error.message ?? 'Unable to resend code.');
      } else {
        setResendInfo('New code sent successfully.');
        setCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to resend code.';
      setResendError(message);
    } finally {
      setIsSending(false);
    }
  }, [email, type]);

  const clearMessages = useCallback(() => {
    setResendError(null);
    setResendInfo(null);
  }, []);

  return {
    resend,
    resendDisabled: isSending || isSubmitting || cooldown !== null,
    resendCountdownSeconds: cooldown,
    resendError,
    resendInfo,
    clearMessages,
  };
}
