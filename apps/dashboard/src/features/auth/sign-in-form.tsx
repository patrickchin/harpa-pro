import { KeyRound, MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { BrandMark, Button, Field, Input } from '@/components/ui';
import { isPasswordAccountEmail } from './demo-account';

interface VerifyCodeInput {
  email: string;
  otp: string;
}

interface PasswordSignInInput {
  email: string;
  password: string;
}

interface SignInFormProps {
  onSendCode: (email: string) => Promise<void>;
  onSignInWithPassword: (input: PasswordSignInInput) => Promise<void>;
  onVerifyCode: (input: VerifyCodeInput) => Promise<void>;
  passwordAccountEmails?: readonly string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function AuthError({ children }: { children: string }): React.JSX.Element {
  return (
    <p
      className="rounded-card-ui border border-danger-border bg-danger-soft px-4 py-3 text-sm font-medium text-danger-text"
      role="alert"
    >
      {children}
    </p>
  );
}

function AuthBrand({ eyebrow }: { eyebrow: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <BrandMark className="size-12 rounded-card-ui" />
      <div className="min-w-0 flex-1">
        <p className="text-label text-accent-ink uppercase">{eyebrow}</p>
        <p className="text-display text-foreground">Harpa Pro</p>
      </div>
    </div>
  );
}

export function SignInForm({
  onSendCode,
  onSignInWithPassword,
  onVerifyCode,
  passwordAccountEmails = [],
}: SignInFormProps): React.JSX.Element {
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    'send-code' | 'verify-code' | 'sign-in' | 'fallback-code' | null
  >(null);
  const isSubmitting = pendingAction !== null;

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setPendingAction('send-code');
    try {
      if (isPasswordAccountEmail(normalizedEmail, passwordAccountEmails)) {
        setEmail(normalizedEmail);
        setStep('password');
        return;
      }
      await onSendCode(normalizedEmail);
      setEmail(normalizedEmail);
      setStep('code');
    } catch (sendError) {
      setError(errorMessage(sendError));
    } finally {
      setPendingAction(null);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the six-digit code from your email.');
      return;
    }
    setError(null);
    setPendingAction('verify-code');
    try {
      await onVerifyCode({ email, otp });
    } catch (verifyError) {
      setError(errorMessage(verifyError));
    } finally {
      setPendingAction(null);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPassword = password.trim();
    if (!normalizedPassword) {
      setError('Enter the account password.');
      return;
    }
    setError(null);
    setPendingAction('sign-in');
    try {
      await onSignInWithPassword({ email, password: normalizedPassword });
    } catch (signInError) {
      setError(errorMessage(signInError));
    } finally {
      setPendingAction(null);
    }
  }

  async function useEmailCode() {
    setError(null);
    setPendingAction('fallback-code');
    try {
      await onSendCode(email);
      setOtp('');
      setPassword('');
      setStep('code');
    } catch (sendError) {
      setError(errorMessage(sendError));
    } finally {
      setPendingAction(null);
    }
  }

  function useAnotherEmail() {
    setOtp('');
    setPassword('');
    setError(null);
    setStep('email');
  }

  if (step === 'password') {
    return (
      <section className="w-full max-w-sm">
        <AuthBrand eyebrow="Secure sign in" />
        <div className="mt-8">
          <KeyRound aria-hidden="true" className="mb-3 size-6 text-accent" />
          <h1 className="text-title text-foreground">Enter your password</h1>
          <p className="mt-2 text-body text-muted-foreground">
            Sign in as <strong className="font-semibold text-foreground">{email}</strong>.
          </p>
        </div>
        <form className="mt-6 flex flex-col gap-4" onSubmit={submitPassword} noValidate>
          <Field label="Password">
            <Input
              autoComplete="current-password"
              autoFocus
              disabled={isSubmitting}
              key="demo-password"
              name="password"
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder="Password"
              type="password"
              value={password}
            />
          </Field>
          {error ? <AuthError>{error}</AuthError> : null}
          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              disabled={isSubmitting || password.trim().length === 0}
              size="large"
              type="submit"
              variant="hero"
            >
              {pendingAction === 'sign-in' ? 'Signing in…' : 'Sign in'}
            </Button>
            <Button
              className="w-full"
              disabled={isSubmitting}
              onClick={useEmailCode}
              size="large"
              type="button"
              variant="quiet"
            >
              {pendingAction === 'fallback-code' ? 'Sending…' : 'Use email code instead'}
            </Button>
            <Button
              className="w-full"
              disabled={isSubmitting}
              onClick={useAnotherEmail}
              size="large"
              type="button"
              variant="outline"
            >
              Use another email
            </Button>
          </div>
        </form>
      </section>
    );
  }

  if (step === 'code') {
    return (
      <section className="w-full max-w-sm">
        <AuthBrand eyebrow="Secure sign in" />
        <div className="mt-8">
          <MailCheck aria-hidden="true" className="mb-3 size-6 text-accent" />
          <h1 className="text-title text-foreground">Check your email</h1>
          <p className="mt-2 text-body text-muted-foreground">
            Enter the six-digit code sent to{' '}
            <strong className="font-semibold text-foreground">{email}</strong>.
          </p>
        </div>
        <form className="mt-6 flex flex-col gap-4" onSubmit={verifyCode} noValidate>
          <Field label="Six-digit code">
            <Input
              autoComplete="one-time-code"
              autoFocus
              className="font-bold tracking-[0.24em]"
              disabled={isSubmitting}
              inputMode="numeric"
              maxLength={6}
              name="otp"
              onChange={(event) => setOtp(event.currentTarget.value.replace(/\D/g, ''))}
              placeholder="123456"
              value={otp}
            />
          </Field>
          {error ? <AuthError>{error}</AuthError> : null}
          <div className="flex flex-col gap-3">
            <Button className="w-full" disabled={isSubmitting} size="large" type="submit" variant="hero">
              {pendingAction === 'verify-code' ? 'Verifying…' : 'Verify code'}
            </Button>
            <Button
              className="w-full"
              disabled={isSubmitting}
              onClick={useAnotherEmail}
              size="large"
              type="button"
              variant="outline"
            >
              Use another email
            </Button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="w-full max-w-sm">
      <AuthBrand eyebrow="Office dashboard" />
      <div className="mt-8">
        <h1 className="text-title text-foreground">Welcome to Harpa Pro</h1>
        <p className="mt-2 text-body text-muted-foreground">
          Sign in with your work email. Most accounts receive a six-digit code—no password
          required.
        </p>
      </div>
      <form className="mt-6 flex flex-col gap-4" onSubmit={sendCode} noValidate>
        <Field label="Email address">
          <Input
            autoComplete="email"
            autoFocus
            disabled={isSubmitting}
            name="email"
            onChange={(event) => setEmail(event.currentTarget.value)}
            placeholder="you@example.com"
            type="email"
            value={email}
          />
        </Field>
        {error ? <AuthError>{error}</AuthError> : null}
        <Button className="w-full" disabled={isSubmitting} size="large" type="submit" variant="hero">
          {pendingAction === 'send-code' ? 'Sending…' : 'Send code'}
        </Button>
      </form>
      <p className="mt-4 text-meta text-muted-foreground">
        By continuing, you agree to use Harpa Pro for authorized project work.
      </p>
    </section>
  );
}
