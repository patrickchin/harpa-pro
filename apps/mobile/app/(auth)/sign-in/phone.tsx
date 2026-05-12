/**
 * Sign-in phone entry — step 1 of OTP flow.
 *
 * Wires data layer for the screens/sign-in-phone.tsx body component:
 *   - useAuthSession (redirect if already authed)
 *   - useStartOtpMutation (POST /auth/otp/start)
 *   - getRememberedPhoneNumber / rememberPhoneNumber (AsyncStorage)
 *   - router.push to verify screen on success
 *
 * Single async flow per Pitfall 5: mutateAsync then router.push. No setTimeout.
 */
import { useEffect, useState } from 'react';
import { Redirect, useRouter, type Href } from 'expo-router';
import SignInPhone from '@/screens/sign-in-phone';
import { useAuthSession } from '@/lib/auth';
import { useStartOtpMutation } from '@/lib/api/hooks';
import {
  isValidPhoneNumber,
  normalizePhoneNumber,
  INVALID_PHONE_NUMBER_MESSAGE,
} from '@/lib/phone';
import {
  getRememberedPhoneNumber,
  rememberPhoneNumber,
  clearRememberedPhoneNumber,
} from '@/lib/remembered-login';
import { getLoginPhoneHint } from '@/lib/login-phone-hint';

export default function SignInPhonePage() {
  const router = useRouter();
  const session = useAuthSession();
  const startOtpMutation = useStartOtpMutation();

  const [phone, setPhone] = useState('');
  const [rememberedPhone, setRememberedPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const normalizedPhone = normalizePhoneNumber(phone);
  const phoneMatchesRemembered =
    rememberedPhone !== null && normalizedPhone === rememberedPhone;

  // Redirect if already authenticated
  if (session.status === 'authenticated') {
    return <Redirect href="/" />;
  }

  // Load remembered phone on mount
  useEffect(() => {
    let isMounted = true;

    void getRememberedPhoneNumber()
      .then((storedPhoneNumber) => {
        if (!isMounted || !storedPhoneNumber) {
          return;
        }

        setRememberedPhone(storedPhoneNumber);
        setPhone((currentPhone) =>
          currentPhone.trim().length === 0 ? storedPhoneNumber : currentPhone
        );
      })
      .catch(() => {
        // Silently ignore errors loading remembered phone
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async () => {
    if (!isValidPhoneNumber(normalizedPhone)) {
      setError(INVALID_PHONE_NUMBER_MESSAGE);
      return;
    }

    setError(null);
    setInfo(null);

    try {
      await startOtpMutation.mutateAsync({ body: { phone: normalizedPhone } });
      await rememberPhoneNumber(normalizedPhone).catch(() => {
        // Silently ignore storage errors
      });
      // expo-router typed-routes regenerates on next `expo start`; cast safe.
      router.push({
        // @ts-expect-error — route exists but types not regenerated yet
        pathname: '/(auth)/sign-in/verify',
        params: { phone: normalizedPhone },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to send verification code.';
      setError(message);
    }
  };

  const handleUseDifferentNumber = async () => {
    try {
      await clearRememberedPhoneNumber();
      setRememberedPhone(null);
      setPhone('');
      setError(null);
      setInfo(null);
    } catch {
      setError('Unable to clear the saved phone number right now.');
    }
  };

  return (
    <SignInPhone
      phone={phone}
      onChangePhone={setPhone}
      rememberedPhone={rememberedPhone}
      onUseDifferentNumber={handleUseDifferentNumber}
      hint={getLoginPhoneHint({
        codeSent: false,
        rememberedPhone,
        phoneMatchesRemembered,
      })}
      error={error}
      info={info}
      isSubmitting={startOtpMutation.isPending}
      onSubmit={handleSubmit}
    />
  );
}
