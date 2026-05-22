/**
 * Sign-in phone entry — step 1 of OTP flow.
 *
 * Wires data layer for the screens/sign-in-phone.tsx body component:
 *   - useAuthSession (redirect if already authed)
 *   - useStartOtpMutation (POST /auth/otp/start)
 *   - getRememberedPhoneNumber / rememberPhoneNumber (AsyncStorage)
 *   - router.push to verify screen on success
 *
 * Phone entry uses a country prefix picker (PhoneNumberInput +
 * CountryPickerModal). The screen owns split country + national state
 * and derives the canonical E.164 string via combineCountryAndNational
 * on submit.
 *
 * Single async flow per Pitfall 5: mutateAsync then router.push. No setTimeout.
 */
import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import SignInPhone from '@/screens/sign-in-phone';
import { useAuthSession } from '@/lib/auth';
import { useStartOtpMutation } from '@/lib/api/hooks';
import {
  combineCountryAndNational,
  getInitialPhoneState,
  isValidPhoneNumber,
  splitE164,
  INVALID_PHONE_NUMBER_MESSAGE,
} from '@/lib/phone';
import { type Country } from '@/lib/countries';
import {
  getRememberedPhoneNumber,
  rememberPhoneNumber,
  clearRememberedPhoneNumber,
} from '@/lib/remembered-login';

export default function SignInPhonePage() {
  const router = useRouter();
  const session = useAuthSession();
  const startOtpMutation = useStartOtpMutation();

  const initial = useMemo(() => getInitialPhoneState(null), []);
  const [country, setCountry] = useState<Country>(initial.country);
  const [national, setNational] = useState<string>(initial.national);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const normalizedPhone = combineCountryAndNational(country, national);

  if (session.status === 'authenticated') {
    return <Redirect href="/" />;
  }

  useEffect(() => {
    let isMounted = true;

    void getRememberedPhoneNumber()
      .then((storedPhoneNumber) => {
        if (!isMounted || !storedPhoneNumber) {
          return;
        }

        // Only prefill if the user hasn't started typing yet
        const split = splitE164(storedPhoneNumber);
        if (split) {
          setCountry((current) => (national.length === 0 ? split.country : current));
          setNational((current) => (current.length === 0 ? split.national : current));
        }
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
      router.push({
        pathname: '/(auth)/sign-in/verify',
        params: { phone: normalizedPhone },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to send verification code.';
      setError(message);
    }
  };

  const handleClear = async () => {
    setNational('');
    setError(null);
    setInfo(null);
    try {
      await clearRememberedPhoneNumber();
    } catch {
      // Silently ignore — clearing the in-memory value is what matters
      // for the next OTP attempt; the remembered hint will be
      // overwritten on the next successful submission anyway.
    }
  };

  return (
    <SignInPhone
      country={country}
      national={national}
      onChangeCountry={setCountry}
      onChangeNational={setNational}
      onClear={handleClear}
      error={error}
      info={info}
      isSubmitting={startOtpMutation.isPending}
      onSubmit={handleSubmit}
    />
  );
}
