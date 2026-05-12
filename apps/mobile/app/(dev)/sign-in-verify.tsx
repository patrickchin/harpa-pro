/**
 * Dev gallery mirror for sign-in-verify body component.
 *
 * Demonstrates: empty OTP, error state, countdown active.
 */
import { useState } from 'react';
import SignInVerify from '@/screens/sign-in-verify';

export default function SignInVerifyDevPage() {
  const [otp, setOtp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    'Invalid verification code. Please try again.'
  );
  const [cooldown, setCooldown] = useState<number | null>(15);

  const handleSubmit = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
    }, 2000);
  };

  const handleResend = () => {
    setCooldown(30);
  };

  const handleChangeNumber = () => {
    // Dev stub — in real route this navigates back
  };

  return (
    <SignInVerify
      phone="+15551234567"
      otp={otp}
      onChangeOtp={setOtp}
      onChangeNumber={handleChangeNumber}
      onResend={handleResend}
      resendDisabled={cooldown !== null}
      resendCountdownSeconds={cooldown}
      error={error}
      info={null}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    />
  );
}
