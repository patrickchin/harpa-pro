/**
 * Developer route — wires AI provider hooks into the props-only
 * `Developer` body. Lives on its own page so the Profile (settings)
 * screen stays focused on account / usage / sign-out.
 */
import { useRouter } from 'expo-router';

import { Developer } from '@/screens/developer';
import {
  AI_PROVIDERS,
  PROVIDER_MODELS,
  useAiProvider,
  useAvailableProviders,
  type AiProviderKey,
} from '@/lib/ai/useAiProvider';
import { safeBack } from '@/lib/nav/safe-back';

export default function DeveloperRoute() {
  const router = useRouter();
  const ai = useAiProvider();
  const availability = useAvailableProviders();

  return (
    <Developer
      onBack={() => safeBack(router, '/(app)/profile')}
      aiProviders={AI_PROVIDERS}
      aiProvider={ai.provider}
      onSelectProvider={(key) => ai.setProvider(key as AiProviderKey)}
      aiModels={PROVIDER_MODELS[ai.provider] ?? []}
      aiModel={ai.model}
      onSelectModel={(model) => ai.setModel(model)}
      availableProviderKeys={availability.availableKeys}
    />
  );
}
