/**
 * Dev-only screen: override the API base URL at runtime.
 *
 * Why: EXPO_PUBLIC_API_URL is inlined at Metro bundle time, so without
 * this we'd need a new EAS build to repoint a TestFlight tester at a
 * PR-preview Fly app. The override is gated to non-production variants
 * by `isApiOverrideEnabled()` — App Store builds can't reach this route
 * because the (dev) layout redirects unless APP_VARIANT !== 'production'.
 *
 * Flipping backends changes which database we talk to, so we sign the
 * user out on save: their current JWT is scoped to the old API.
 */
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import {
  getApiBaseUrl,
  isApiOverrideEnabled,
  readApiBaseUrlOverride,
  setApiBaseUrlOverride,
} from '@/lib/api/base-url';
import { useAuthSession } from '@/lib/auth/session';
import { useAppDialogSheet } from '@/lib/dialogs/useAppDialogSheet';
import { env } from '@/lib/env';

const PRESETS: { label: string; url: string }[] = [
  { label: 'Localhost', url: 'http://localhost:8787' },
  { label: 'Dev (Fly)', url: 'https://harpa-pro-api-dev.fly.dev' },
  { label: 'Prod (Fly)', url: 'https://api.harpapro.com' },
];

export default function DevApiBaseUrl() {
  const session = useAuthSession();
  const dialog = useAppDialogSheet();
  const [override, setOverride] = useState<string>('');
  const [active, setActive] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const stored = await readApiBaseUrlOverride();
      setOverride(stored ?? '');
      setActive(await getApiBaseUrl());
    })();
  }, []);

  if (!isApiOverrideEnabled()) {
    return (
      <View className="p-6">
        <Text>Disabled in production builds.</Text>
      </View>
    );
  }

  async function applyAndSignOut(url: string | null) {
    setBusy(true);
    try {
      await setApiBaseUrlOverride(url);
      await session.signOut().catch(() => {});
      setActive(await getApiBaseUrl());
      await dialog.alert({
        title: 'API base URL updated',
        message: `Now pointing at:\n${url ?? '(default) ' + env.EXPO_PUBLIC_API_URL}\n\nYou have been signed out.`,
      });
    } catch (err) {
      await dialog.alert({
        title: 'Failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerClassName="p-6 gap-4">
      <Text className="text-lg font-semibold">API base URL</Text>
      <Text className="text-sm text-neutral-600">
        Build variant: {env.EXPO_PUBLIC_APP_VARIANT}
        {'\n'}Compile-time URL: {env.EXPO_PUBLIC_API_URL}
        {'\n'}Currently in use: {active}
      </Text>

      <View className="gap-2">
        <Text className="font-medium">Presets</Text>
        {PRESETS.map((p) => (
          <Button
            key={p.url}
            disabled={busy}
            onPress={() => applyAndSignOut(p.url)}
            variant="outline"
          >
            {p.label} — {p.url}
          </Button>
        ))}
      </View>

      <View className="gap-2">
        <Text className="font-medium">Custom URL</Text>
        <Input
          value={override}
          onChangeText={setOverride}
          placeholder="https://harpa-pro-api-pr-42.fly.dev"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button disabled={busy} onPress={() => applyAndSignOut(override || null)}>
          Save & sign out
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onPress={() => applyAndSignOut(null)}
        >
          Reset to compile-time default
        </Button>
      </View>
    </ScrollView>
  );
}
