/**
 * Dev mirror — Project edit with toggleable states.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { ProjectEdit } from '@/screens/project-edit';
import { Button } from '@/components/primitives/Button';

type Mode = 'loaded' | 'loading' | 'updating' | 'deleting' | 'error';

export default function DevProjectEdit() {
  const [mode, setMode] = useState<Mode>('loaded');
  return (
    <View className="flex-1 bg-background">
      <View className="flex-row flex-wrap gap-2 px-5 py-3 border-b border-border">
        {(['loaded', 'loading', 'updating', 'deleting', 'error'] as Mode[]).map(
          (m) => (
            <Button
              key={m}
              variant={mode === m ? 'default' : 'outline'}
              size="sm"
              onPress={() => setMode(m)}
            >
              {m}
            </Button>
          ),
        )}
      </View>
      <ProjectEdit
        initial={{
          name: 'Highland Tower Complex',
          clientName: 'Acme Construction Co.',
          address: '2400 Highland Ave, Austin TX',
        }}
        isLoading={mode === 'loading'}
        isUpdating={mode === 'updating'}
        isDeleting={mode === 'deleting'}
        updateError={mode === 'error' ? 'Network unavailable. Try again.' : null}
        deleteError={null}
        onBack={() => undefined}
        onSubmit={() => undefined}
        onDelete={() => undefined}
      />
    </View>
  );
}
