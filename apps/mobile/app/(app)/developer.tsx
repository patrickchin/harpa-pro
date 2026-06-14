/**
 * Developer route — wires the server-backed `useAiProvider` hook into
 * the props-only `Developer` body. Picker is single-step (model only)
 * since the catalogue currently only contains OpenAI; vendor selection
 * is implicit. See docs/superpowers/plans/2026-05-29-user-model-selection.md.
 */
import { useRouter, type Href } from 'expo-router';

import { Developer } from '@/screens/developer';
import { AI_MODELS, useAiProvider } from '@/lib/ai/useAiProvider';
import { useDeveloperFlags } from '@/lib/config/dev-flags';
import { safeBack } from '@/lib/nav/safe-back';

export default function DeveloperRoute() {
  const router = useRouter();
  const ai = useAiProvider();
  const devFlags = useDeveloperFlags();

  return (
    <Developer
      onBack={() => safeBack(router, '/(app)/profile')}
      aiModels={AI_MODELS.openai}
      aiSelection={ai.selection}
      onSelectModel={(next) => {
        void ai.setSelection(next);
      }}
      isLoadingSelection={ai.isLoading}
      showGenerateDebugTab={devFlags.showGenerateDebugTab}
      onToggleGenerateDebugTab={devFlags.setShowGenerateDebugTab}
      showGenerateEditTab={devFlags.showGenerateEditTab}
      onToggleGenerateEditTab={devFlags.setShowGenerateEditTab}
      onPressOnboardingLab={() => {
        router.push('/(app)/onboarding-lab' as Href);
      }}
    />
  );
}
