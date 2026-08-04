import { useState, type FormEvent } from 'react';

import { BrandMark, Button, Field, Input } from '@/components/ui';

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
    <section className="w-full max-w-sm">
      <div className="flex items-center gap-3">
        <BrandMark className="size-12 rounded-card-ui" />
        <div className="min-w-0 flex-1">
          <h1 className="text-display text-foreground">Welcome</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Finish your account details so reports and projects are labeled correctly from day one.
          </p>
        </div>
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Signed in as <strong className="font-semibold text-foreground">{email}</strong>
      </p>
      <form className="mt-4 flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field label="Full name">
          <Input
            autoComplete="name"
            autoFocus
            disabled={isSubmitting}
            name="displayName"
            onChange={(event) => setDisplayName(event.currentTarget.value)}
            placeholder="John Smith"
            value={displayName}
          />
        </Field>
        <p className="-mt-2 text-meta text-muted-foreground">
          Use the name teammates will recognize in shared reports.
        </p>
        <Field label="Company">
          <Input
            aria-describedby="company-hint"
            autoComplete="organization"
            disabled={isSubmitting}
            name="companyName"
            onChange={(event) => setCompanyName(event.currentTarget.value)}
            placeholder="Smith Construction LLC"
            value={companyName}
          />
        </Field>
        <p className="-mt-2 text-meta text-muted-foreground" id="company-hint">
          Optional. This shows on your profile and exported report details.
        </p>
        {error ? (
          <p
            className="rounded-card-ui border border-danger-border bg-danger-soft px-4 py-3 text-sm font-medium text-danger-text"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <Button className="w-full" disabled={isSubmitting} size="large" type="submit" variant="hero">
          {isSubmitting ? 'Saving…' : 'Continue'}
        </Button>
      </form>
    </section>
  );
}
