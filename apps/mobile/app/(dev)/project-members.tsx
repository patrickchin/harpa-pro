/**
 * Dev mirror — Project members with state toggles.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { ProjectMembers, type MemberRow } from '@/screens/project-members';
import { Button } from '@/components/primitives/Button';

const SAMPLE: MemberRow[] = [
  {
    userId: 'u-owner',
    displayName: 'Maya Owner',
    phone: '+15551234567',
    role: 'owner',
    joinedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    userId: 'u-self',
    displayName: 'You',
    phone: '+15559999999',
    role: 'editor',
    joinedAt: '2024-02-01T00:00:00.000Z',
  },
  {
    userId: 'u-bob',
    displayName: 'Bob Editor',
    phone: '+15552223333',
    role: 'editor',
    joinedAt: '2024-02-15T00:00:00.000Z',
  },
  {
    userId: 'u-vivi',
    displayName: 'Vivi Viewer',
    phone: '+15554445555',
    role: 'viewer',
    joinedAt: '2024-03-10T00:00:00.000Z',
  },
];

type Mode = 'owner' | 'editor' | 'viewer' | 'empty' | 'loading';

export default function DevProjectMembers() {
  const [mode, setMode] = useState<Mode>('owner');
  return (
    <View className="flex-1 bg-background">
      <View className="flex-row flex-wrap gap-2 px-5 py-3 border-b border-border">
        {(['owner', 'editor', 'viewer', 'empty', 'loading'] as Mode[]).map(
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
      <ProjectMembers
        members={mode === 'empty' ? [SAMPLE[0]!, SAMPLE[1]!] : SAMPLE}
        currentUserId={'u-self'}
        myRole={mode === 'owner' ? 'owner' : mode === 'editor' ? 'editor' : 'viewer'}
        ownerId={'u-owner'}
        isLoading={mode === 'loading'}
        refreshing={false}
        onRefresh={() => undefined}
        onBack={() => undefined}
        onAddMember={() => undefined}
        isAddPending={false}
        addError={null}
        onRemoveMember={() => undefined}
        isRemovePending={false}
      />
    </View>
  );
}
