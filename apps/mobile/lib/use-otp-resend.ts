/**
 * useOtpResend — shared cooldown timer + resend mutation glue for the
 * sign-in/sign-up verify route pages. The two pages previously
 * carried byte-identical copies of this logic; extracting it here
 * keeps the cooldown behaviour single-sourced and lets the route
 * pages stay thin.
 *
 * Single async flow per Pitfall 5: mutateAsync, then set local state.
 * No setTimeout-on-mount; the cooldown only starts after a successful
 * resend response.
 */
import { useCallback, useEffect, useState } from 'react';

import { useStartOtpMutation } from '@/lib/api/hooks';

export const RESEND_COOLDOWN_SECONDS = 30;

export interface UseOtpResendInput {
  phone: string;
  isSubmitting: boolean;
}

export interface UseOtpResendResult {
  resend: () => Promise<void>;
  resendDisabled: boolean;
  resendCountdownSeconds: number | null;
  /** Most recent resend error message, or null. Cleared on next attempt. */
  resendError: string | null;
  /** Set to "New code sent successfully." after a successful resend. */
  resendInfo: string | null;
  clearMessages: () => void;
}

export function useOtpResend({
  phone,
  isSubmitting,
}: UseOtpResendInput): UseOtpResendResult {
  const startOtpMutation = useStartOtpMutation();

  const [cooldown, setCooldown] = useState<number | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendInfo, setResendInfo] = useState<string | null>(null);

  // UI-only cooldown tick (per Pitfall 5).
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

  const resend = useCallback(async () => {
    setResendError(null);
    setResendInfo(null);

    try {
      await startOtpMutation.mutateAsync({ body: { phone } });
      setResendInfo('New code sent successfully.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to resend code.';
      setResendError(message);
    }
  }, [startOtpMutation, phone]);

  const clearMessages = useCallback(() => {
    setResendError(null);
    setResendInfo(null);
  }, []);

  return {
    resend,
    resendDisabled:
      startOtpMutation.isPending || isSubmitting || cooldown !== null,
    resendCountdownSeconds: cooldown,
    resendError,
    resendInfo,
    clearMessages,
  };
}
