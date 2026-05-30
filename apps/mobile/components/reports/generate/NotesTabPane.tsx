/**
 * NotesTabPane — Notes tab body. Ported from
 * `../haru3-reports/apps/mobile/components/reports/generate/NotesTabPane.tsx`
 * on branch `dev`.
 *
 * P3.6 wires the simplified `NoteTimeline` (text-only) and the empty
 * state. Voice / photo / pending-upload rendering will land in P3.7
 * alongside the corresponding pipeline hooks.
 */
import { forwardRef, useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { Mic } from 'lucide-react-native';

import { EmptyState } from '@/components/primitives/EmptyState';
import { NoteTimeline } from '@/components/notes/NoteTimeline';
import { useGenerateReport } from '@/features/generate/GenerateReportProvider';
import { colors } from '@/lib/design-tokens/colors';

interface NotesTabPaneProps {
  width: number;
}

export const NotesTabPane = forwardRef<ScrollView, NotesTabPaneProps>(
  function NotesTabPane({ width }, ref) {
    const { timeline, notes, members, voice, photo, preview } = useGenerateReport();

    // Auto-scroll to the newest note whenever the timeline grows
    // (user added a text/voice/photo note). Skipped on initial load
    // and on deletions so the user keeps their place.
    const localRef = useRef<ScrollView | null>(null);
    const prevCountRef = useRef<number>(timeline.items.length);
    const itemCount = timeline.items.length;

    useEffect(() => {
      const prev = prevCountRef.current;
      prevCountRef.current = itemCount;
      if (itemCount > prev && prev !== 0) {
        // Defer to next frame so the new row has measured before
        // scrollToEnd computes the offset.
        const id = setTimeout(() => {
          localRef.current?.scrollToEnd({ animated: true });
        }, 0);
        return () => clearTimeout(id);
      }
      return undefined;
    }, [itemCount]);

    const setRef = (node: ScrollView | null) => {
      localRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<ScrollView | null>).current = node;
    };

    return (
      <View style={{ width }} className="flex-1">
        <ScrollView
          ref={setRef}
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          <NoteTimeline
            notes={timeline.items}
            isLoading={timeline.isLoading}
            memberNames={members}
            onDeleteNote={notes.deleteAt}
            onEditNote={notes.canEdit ? notes.update : undefined}
            onRetryVoice={voice.retry}
            onOpenPhoto={(fileId) => preview.openPhoto(fileId)}
            onRetryPhotoUpload={photo.retryUpload}
            onCancelPhotoUpload={photo.cancelUpload}
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
