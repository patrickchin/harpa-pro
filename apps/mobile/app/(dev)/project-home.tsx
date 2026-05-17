/**
 * Dev mirror — Project home with toggleable states.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { ProjectHome, type ProjectHomeProjectInfo } from '@/screens/project-home';
import { Button } from '@/components/primitives/Button';

const SAMPLE: ProjectHomeProjectInfo = {
  name: 'Highland Tower Complex',
  clientName: 'Acme Construction Co.',
  address: '2400 Highland Ave, Austin TX',
  myRole: 'owner',
  stats: { totalReports: 12, drafts: 2, lastReportAt: new Date().toISOString() },
};

type Mode = 'loaded' | 'loading' | 'empty';

export default function DevProjectHome() {
  const [mode, setMode] = useState<Mode>('loaded');
  const [refreshing, setRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row gap-2 px-5 py-3 border-b border-border">
        {(['loaded', 'loading', 'empty'] as Mode[]).map((m) => (
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
      <ProjectHome
        project={mode === 'loaded' ? SAMPLE : mode === 'empty' ? { ...SAMPLE, stats: { totalReports: 0, drafts: 0, lastReportAt: null }, clientName: null, address: null } : null}
        isLoading={mode === 'loading'}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          setTimeout(() => setRefreshing(false), 800);
        }}
        onBack={() => undefined}
        onPressEdit={() => undefined}
        onPressReports={() => undefined}
        onPressMembers={() => undefined}
        copiedKey={copiedKey}
        onCopy={(_value, key) => {
          setCopiedKey(key);
          setTimeout(() => setCopiedKey(null), 1500);
        }}
      />
    </View>
  );
}
