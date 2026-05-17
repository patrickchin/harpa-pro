/**
 * Dev mirror for ProjectNew — toggleable status states.
 *
 * Toggle between idle / pending / error for visual review.
 */
import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { ProjectNew } from '@/screens/project-new';

type DevState = 'idle' | 'pending' | 'error';

export default function ProjectNewDevMirror() {
  const [state, setState] = useState<DevState>('idle');

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row gap-2 border-b border-border bg-background-muted px-4 py-2">
        {(['idle', 'pending', 'error'] as const).map((s) => (
          <Pressable
            key={s}
            onPress={() => setState(s)}
            className={`rounded-md px-3 py-1 ${state === s ? 'bg-primary' : 'bg-card'}`}
          >
            <Text
              className={`text-sm ${state === s ? 'text-primary-foreground' : 'text-foreground'}`}
            >
              {s}
            </Text>
          </Pressable>
        ))}
      </View>
      <View className="flex-1">
        <ProjectNew
          isPending={state === 'pending'}
          errorMessage={state === 'error' ? 'Network unavailable — please try again.' : null}
          onBack={() => {}}
          onSubmit={() => {}}
        />
      </View>
    </View>
  );
}
