/**
 * NotesTabPane — Notes tab body. Ported from
 * `../haru3-reports/apps/mobile/components/reports/generate/NotesTabPane.tsx`
 * on branch `dev`.
 *
 * P3.6 wires the simplified `NoteTimeline` (text-only) and the empty
 * state. Voice / photo / pending-upload rendering will land in P3.7
 * alongside the corresponding pipeline hooks.
 */
import { forwardRef } from 'react';
import { ScrollView, View } from 'react-native';
import { Mic } from 'lucide-react-native';

import { EmptyState } from '@/components/primitives/EmptyState';
import { NoteTimeline } from '@/components/notes/NoteTimeline';
import { useGenerateReport } from './GenerateReportProvider';
import { colors } from '@/lib/design-tokens/colors';

interface NotesTabPaneProps {
  width: number;
}

export const NotesTabPane = forwardRef<ScrollView, NotesTabPaneProps>(
  function NotesTabPane({ width }, ref) {
    const { timeline, notes, members } = useGenerateReport();

    return (
      <View style={{ width }} className="flex-1">
        <ScrollView
          ref={ref}
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          <NoteTimeline
            notes={timeline.items}
            isLoading={timeline.isLoading}
            memberNames={members}
            onRemoveNote={notes.setDeleteIndex}
          />

          {timeline.items.length === 0 && !timeline.isLoading ? (
            <EmptyState
              icon={<Mic size={28} color={colors.muted.foreground} />}
              title="Start capturing site notes"
              description="Record short voice updates or type notes below. The report will build itself as you go."
            />
          ) : null}
        </ScrollView>
      </View>
    );
  },
);
