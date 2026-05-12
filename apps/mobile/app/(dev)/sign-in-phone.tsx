/**
 * Dev mirror for sign-in-phone. Demonstrates:
 *   - Empty phone input
 *   - Remembered phone present
 *   - Interactive typing
 *   - Submit → isSubmitting toggle for 600ms (UI-only)
 */
import { useState } from 'react';
import SignInPhone from '@/screens/sign-in-phone';

export default function DevSignInPhone() {
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (phone.trim().length === 0) {
      setError('Enter your phone number with country code, starting with +.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
    }, 600);
  };

  const handleUseDifferentNumber = () => {
    setPhone('');
    setError(null);
  };

  return (
    <SignInPhone
      phone={phone}
      onChangePhone={setPhone}
      rememberedPhone="+15551234567"
      onUseDifferentNumber={handleUseDifferentNumber}
      hint="Signed in recently with this number on this device."
      error={error}
      info={null}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    />
  );
}
