import { useState, type FormEvent } from 'react';

interface VerifyCodeInput {
  email: string;
  otp: string;
}

interface SignInFormProps {
  onSendCode: (email: string) => Promise<void>;
  onVerifyCode: (input: VerifyCodeInput) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function SignInForm({ onSendCode, onVerifyCode }: SignInFormProps): React.JSX.Element {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onSendCode(normalizedEmail);
      setEmail(normalizedEmail);
      setStep('code');
    } catch (sendError) {
      setError(errorMessage(sendError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the six-digit code from your email.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onVerifyCode({ email, otp });
    } catch (verifyError) {
      setError(errorMessage(verifyError));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === 'code') {
    return (
      <div className="auth-panel">
        <div className="auth-brand" aria-hidden="true">
          HP
        </div>
        <p className="eyebrow">Secure sign in</p>
        <h1>Check your email</h1>
        <p className="auth-lede">
          Enter the six-digit code sent to <strong>{email}</strong>.
        </p>
        <form className="form-stack" onSubmit={verifyCode} noValidate>
          <label>
            Six-digit code
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              name="otp"
              onChange={(event) => setOtp(event.currentTarget.value.replace(/\D/g, ''))}
              value={otp}
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <button className="button button-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Verifying…' : 'Verify code'}
          </button>
          <button
            className="button button-quiet"
            type="button"
            onClick={() => {
              setOtp('');
              setError(null);
              setStep('email');
            }}
          >
            Use another email
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-panel">
      <div className="auth-brand" aria-hidden="true">
        HP
      </div>
      <p className="eyebrow">Office dashboard</p>
      <h1>Welcome to Harpa Pro</h1>
      <p className="auth-lede">
        Sign in with your work email. We’ll send a six-digit code—no password required.
      </p>
      <form className="form-stack" onSubmit={sendCode} noValidate>
        <label>
          Email address
          <input
            autoComplete="email"
            name="email"
            onChange={(event) => setEmail(event.currentTarget.value)}
            type="email"
            value={email}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button className="button button-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Send code'}
        </button>
      </form>
      <p className="auth-footnote">
        By continuing, you agree to use Harpa Pro for authorized project work.
      </p>
    </div>
  );
}
