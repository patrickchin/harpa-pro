import { useState, type FormEvent } from 'react';

interface OnboardingInput {
  displayName: string;
  companyName?: string;
}

interface OnboardingFormProps {
  email: string;
  onSubmit: (input: OnboardingInput) => Promise<void>;
}

export function OnboardingForm({ email, onSubmit }: OnboardingFormProps): React.JSX.Element {
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = displayName.trim();
    if (!normalizedName) {
      setError('Enter your full name.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const normalizedCompany = companyName.trim();
      await onSubmit({
        displayName: normalizedName,
        ...(normalizedCompany ? { companyName: normalizedCompany } : {}),
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save your profile.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-panel">
      <div className="auth-brand" aria-hidden="true">
        HP
      </div>
      <p className="eyebrow">One last step</p>
      <h1>Set up your profile</h1>
      <p className="auth-lede">This is how teammates will recognize you across projects.</p>
      <p className="signed-in-as">
        Signed in as <strong>{email}</strong>
      </p>
      <form className="form-stack" onSubmit={submit} noValidate>
        <label>
          Full name
          <input
            autoComplete="name"
            name="displayName"
            onChange={(event) => setDisplayName(event.currentTarget.value)}
            value={displayName}
          />
        </label>
        <label>
          Company{' '}
          <span aria-hidden="true" className="optional-label">
            Optional
          </span>
          <input
            autoComplete="organization"
            name="companyName"
            onChange={(event) => setCompanyName(event.currentTarget.value)}
            value={companyName}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button className="button button-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
