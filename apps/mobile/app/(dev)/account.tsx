/**
 * Dev mirror — Account screen with mode toggles.
 *
 * Mirrors `app/(app)/account.tsx` with canned profile state.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/primitives/Button';
import { Account, type AccountProfile } from '@/screens/account';

type Mode = 'loaded' | 'loading' | 'no-name' | 'no-company';

const SAMPLE: AccountProfile = {
  phone: '+15551234567',
  fullName: 'Jordan Sims',
  companyName: 'Sims Construction',
};

export default function DevAccount() {
  const [mode, setMode] = useState<Mode>('loaded');

  const profile: AccountProfile | null =
    mode === 'loading'
      ? null
      : mode === 'no-name'
        ? { ...SAMPLE, fullName: null }
        : mode === 'no-company'
          ? { ...SAMPLE, companyName: null }
          : SAMPLE;

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row flex-wrap gap-2 px-5 py-3 border-b border-border">
        {(['loaded', 'loading', 'no-name', 'no-company'] as Mode[]).map((m) => (
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
        <Account
          profile={profile}
          refreshing={false}
          onRefresh={() => undefined}
          onBack={() => undefined}
        />
      </View>
    </View>
  );
}
