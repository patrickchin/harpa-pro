import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';

import { OnboardingLab } from '@/screens/onboarding-lab';
import { safeBack } from '@/lib/nav/safe-back';
import type { OnboardingPocVariantId } from '@/lib/onboarding/poc';

export default function OnboardingLabRoute() {
  const router = useRouter();
  const [selectedVariantId, setSelectedVariantId] =
    useState<OnboardingPocVariantId>('report-first');

  return (
    <OnboardingLab
      selectedVariantId={selectedVariantId}
      onSelectVariant={setSelectedVariantId}
      onBack={() => safeBack(router, '/(app)/projects' as Href)}
      onPrimaryAction={() => {
        router.push('/(app)/projects/new' as Href);
      }}
    />
  );
}
