/**
 * Dev mirror — Profile screen with mode toggles.
 *
 * Mirrors `app/(app)/profile.tsx` with canned auth + usage state and
 * the canonical AI provider catalogue so the Developer modal is
 * exercisable without a real backend.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/primitives/Button';
import {
  Profile,
  type AiProviderOption,
  type ProfileMonthlyUsage,
  type ProfileUser,
} from '@/screens/profile';

type Mode = 'loaded' | 'loading-account' | 'usage-loading' | 'empty-usage' | 'new-user';

const SAMPLE_USER: ProfileUser = {
  displayName: 'Jordan Sims',
  companyName: 'Sims Construction',
  phone: '+15551234567',
};

const SAMPLE_USAGE: ProfileMonthlyUsage = {
  reportsCount: 12,
  voiceNotesCount: 34,
};

// Canonical AI provider catalogue (kept here so the dev mirror can
// exercise the modal without pulling in v3 hooks / Supabase). Real
// route hides the Developer section until P4.
const AI_PROVIDERS: ReadonlyArray<AiProviderOption> = [
  { key: 'kimi', label: 'Kimi', desc: 'Cheapest, good for dev' },
  { key: 'openai', label: 'OpenAI', desc: 'Balanced quality / price' },
  { key: 'anthropic', label: 'Anthropic', desc: 'Strong instruction following' },
  { key: 'google', label: 'Google', desc: 'Fast, large context' },
  { key: 'zai', label: 'Z.AI', desc: 'Strong reasoning (GLM)' },
  { key: 'deepseek', label: 'DeepSeek', desc: 'Cheap, capable' },
];

const PROVIDER_MODELS: Record<string, { id: string; label: string }[]> = {
  kimi: [
    { id: 'kimi-k2-0905-preview', label: 'Kimi K2 (preview, 0905)' },
    { id: 'kimi-k2-thinking', label: 'Kimi K2 Thinking' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  google: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ],
  zai: [{ id: 'glm-4.6', label: 'GLM-4.6' }],
  deepseek: [{ id: 'deepseek-chat', label: 'DeepSeek V3' }],
};

export default function DevProfile() {
  const [mode, setMode] = useState<Mode>('loaded');
  const [provider, setProvider] = useState<string>('kimi');
  const [model, setModel] = useState<string>('kimi-k2-0905-preview');

  const user: ProfileUser | null =
    mode === 'new-user'
      ? { displayName: null, companyName: null, phone: null }
      : SAMPLE_USER;
  const isLoading = mode === 'loading-account';
  const monthlyUsage =
    mode === 'empty-usage' || mode === 'usage-loading' ? null : SAMPLE_USAGE;
  const usageLoading = mode === 'usage-loading';

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row flex-wrap gap-2 px-5 py-3 border-b border-border">
        {(
          ['loaded', 'loading-account', 'usage-loading', 'empty-usage', 'new-user'] as Mode[]
        ).map((m) => (
          <Button
            key={m}
            variant={mode === m ? 'default' : 'outline'}
            size="sm"
            onPress={() => setMode(m)}
          >
            {m}
          </Button>
        ))}
      </View>

      <View className="flex-1">
        <Profile
          user={user}
          isLoading={isLoading}
          monthlyUsage={monthlyUsage}
          usageLoading={usageLoading}
          refreshing={false}
          onRefresh={() => undefined}
          onBack={() => undefined}
          onPressAccount={() => undefined}
          onPressUsage={() => undefined}
          onCopy={() => undefined}
          onSignOut={() => undefined}
          onClearCache={async () => undefined}
          showDeveloperSection
          aiProviders={AI_PROVIDERS}
          aiProvider={provider}
          onSelectProvider={(key) => {
            setProvider(key);
            setModel(PROVIDER_MODELS[key]?.[0]?.id ?? '');
          }}
          aiModels={PROVIDER_MODELS[provider] ?? []}
          aiModel={model}
          onSelectModel={setModel}
          availableProviderKeys={null}
          buildVersion="0.0.0+devmirror"
          serverLabel="Dev (mirror)"
        />
      </View>
    </View>
  );
}
