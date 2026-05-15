/**
 * Dev mirror — Generate Report (Notes tab) with state toggles.
 *
 * Mirrors the route at
 * `app/(app)/projects/[projectSlug]/reports/[number]/generate.tsx`
 * with mocked notes. Toggle between empty / populated / loading to
 * eyeball the empty state, the timeline rendering, and the loading
 * row without needing a real draft on the simulator.
 */
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/primitives/Button';
import { GenerateNotes } from '@/screens/generate-notes';
import type { NoteEntry } from '@/lib/note-entry';
import { uuid } from '@/lib/uuid';

type Mode = 'empty' | 'populated' | 'loading';

const SAMPLE_NOTES: NoteEntry[] = [
  {
    id: 'note-1',
    text: 'Crew arrived 7:45 AM. Slab pour delayed by rain forecast.',
    authorId: 'user-1',
    addedAt: Date.now() - 60 * 60 * 1000,
    source: 'text',
  },
  {
    id: 'note-2',
    text: 'Inspector signed off on rebar layout for grid B/C.',
    authorId: 'user-2',
    addedAt: Date.now() - 30 * 60 * 1000,
    source: 'text',
  },
  {
    id: 'note-3',
    text: 'Need to reorder the additional 20m³ of concrete for tomorrow.',
    authorId: 'user-1',
    addedAt: Date.now() - 5 * 60 * 1000,
    source: 'text',
  },
];

const SAMPLE_MEMBERS = new Map([
  ['user-1', 'Alex Park'],
  ['user-2', 'Sam Rivera'],
]);

export default function DevGenerateNotes() {
  const [mode, setMode] = useState<Mode>('empty');
  const [extraNotes, setExtraNotes] = useState<NoteEntry[]>([]);

  const baseNotes = mode === 'populated' ? SAMPLE_NOTES : [];
  const notes = mode === 'loading' ? [] : [...baseNotes, ...extraNotes];

  const handleAddTextNote = useCallback((body: string) => {
    setExtraNotes((prev) => [
      ...prev,
      {
        id: uuid(),
        text: body,
        addedAt: Date.now(),
        isPending: true,
        source: 'text',
      },
    ]);
  }, []);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row flex-wrap gap-2 px-5 py-3 border-b border-border">
        {(['empty', 'populated', 'loading'] as Mode[]).map((m) => (
          <Button
            key={m}
            variant={mode === m ? 'default' : 'outline'}
            size="sm"
            onPress={() => {
              setMode(m);
              setExtraNotes([]);
            }}
          >
            {m}
          </Button>
        ))}
      </View>
      <GenerateNotes
        projectSlug="prj_dev"
        reportNumber={1}
        notes={notes}
        notesLoading={mode === 'loading'}
        onAddTextNote={handleAddTextNote}
        memberNames={SAMPLE_MEMBERS}
        reportTitle="Highland Tower — Visit 1"
        canWrite
        onBack={() => undefined}
      />
    </View>
  );
}
