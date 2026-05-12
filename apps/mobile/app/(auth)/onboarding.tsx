/**
 * Onboarding real route — post-OTP identity collection.
 *
 * Wires data layer for screens/onboarding.tsx:
 *   - useAuthSession to read session.user (for prefill) and session.refresh()
 *   - useUpdateMeMutation (PATCH /me)
 *   - Auto-redirect to / if displayName + companyName already exist
 *   - Single async flow (Pitfall 5): mutateAsync → session.refresh() →
 *     router.replace('/')
 *
 * The (app) auth gate (P2.6) routes authenticated vs needs-onboarding users.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';
import Onboarding from '@/screens/onboarding';
import { useAuthSession } from '@/lib/auth';
import { useUpdateMeMutation } from '@/lib/api/hooks';

export default function OnboardingPage() {
  const router = useRouter();
  const session = useAuthSession();
  const updateMe = useUpdateMeMutation();

  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Prefill from session.user when available
  useEffect(() => {
    if (session.user) {
      if (session.user.displayName) {
        setFullName(session.user.displayName);
      }
      if (session.user.companyName) {
        setCompanyName(session.user.companyName);
      }
    }
  }, [session.user]);

  // Auto-redirect if both displayName and companyName already exist
  useEffect(() => {
    if (
      session.status === 'authenticated' &&
      session.user?.displayName &&
      session.user?.companyName
    ) {
      router.replace('/' as Href);
    }
  }, [session.status, session.user, router]);

  const handleSubmit = useCallback(async () => {
    const trimmedName = fullName.trim();
    const trimmedCompany = companyName.trim();

    if (trimmedName.length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (trimmedCompany.length < 2) {
      setError('Please enter your company name.');
      return;
    }

    setError(null);

    try {
      await updateMe.mutateAsync({
        body: {
          displayName: trimmedName,
          companyName: trimmedCompany,
        },
      });

      await session.refresh();
      router.replace('/' as Href);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save profile.';
      setError(message);
    }
  }, [fullName, companyName, updateMe, session, router]);

  return (
    <Onboarding
      fullName={fullName}
      companyName={companyName}
      onChangeFullName={setFullName}
      onChangeCompanyName={setCompanyName}
      error={error}
      isPending={updateMe.isPending}
      onSubmit={handleSubmit}
    />
  );
}
